import { Injectable, NotFoundException } from '@nestjs/common';
import ms from 'ms';
import { DatabaseService } from '../../../database/database.service';
import { AuditService } from '../../../common/services/audit.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../redis/redis.service';
import { RefreshToken } from '../../../database/entities/refresh-token.entity';
import { User } from '../../../database/entities/user.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { mapUserRow } from '../../users/repositories/users.sql';

interface TokenContext {
  deviceId?: string;
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  provider?: string;
}

const REFRESH_TOKEN_COLUMNS_SQL = `
  id, user_id AS "userId", token_hash AS "tokenHash", device_name AS "deviceName",
  device_info AS "deviceInfo", ip_address AS "ipAddress", location, user_agent AS "userAgent",
  provider, last_used_at AS "lastUsedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt",
  created_at AS "createdAt"
`;

@Injectable()
export class SessionService {
  private readonly maxSessions: number;
  /** How long a session block must outlive the newest access token it needs
   * to invalidate — see revokeAllSessions. */
  private readonly accessTokenTtlSeconds: number;

  constructor(
    private dataSource: DatabaseService,
    private configService: ConfigService,
    private redisService: RedisService,
    private readonly audit: AuditService,
  ) {
    this.maxSessions = this.configService.get<number>('app.maxSessions') ?? 5;
    const accessExpires =
      this.configService.get<string>('jwt.accessExpires') || '20m';
    this.accessTokenTtlSeconds = Math.ceil(
      (ms(accessExpires as any) as unknown as number) / 1000,
    );
  }

  async getSessions(userId: string) {
    const sessions = await this.dataSource.query<RefreshToken>(
      `SELECT ${REFRESH_TOKEN_COLUMNS_SQL} FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY last_used_at DESC`,
      [userId],
    );

    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      browser: s.deviceInfo?.browser,
      os: s.deviceInfo?.os,
      ipAddress: s.ipAddress,
      location: s.location,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      provider: s.provider,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const raw = await this.dataSource.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [sessionId, userId],
    );
    const result = raw;
    if (!result[0]) {
      throw new NotFoundException({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found or already revoked',
      });
    }
    return { message: 'Session revoked successfully' };
  }

  /**
   * Revoking the refresh tokens alone is not enough: access tokens are
   * stateless, so every already-issued one stays valid for the rest of its
   * lifetime (20 min by default) — exactly the window that matters when the
   * user hits this because they think they've been compromised, or when
   * refresh-token reuse detection fires. blockUserSessions records a cutoff
   * that JwtStrategy checks against each token's `iat`, which kills the
   * outstanding ones without blocking the session the user opens next.
   */
  async revokeAllSessions(userId: string) {
    await Promise.all([
      this.dataSource.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      ),
      this.redisService.blockUserSessions(userId, this.accessTokenTtlSeconds),
    ]);
    // "Log me out everywhere" is what someone presses after a suspected
    // compromise, so it is exactly the event that must be on the record.
    await this.audit.log({
      actorId: userId,
      action: 'auth.all_sessions_revoked',
      entityType: 'user',
      entityId: userId,
    });
    return { message: 'All sessions revoked successfully' };
  }

  /**
   * OPTIMIZED: Single CTE query instead of COUNT -> SELECT -> SAVE (3 round trips -> 1)
   * Revokes the oldest session when limit is exceeded.
   */
  async enforceSessionLimit(userId: string): Promise<void> {
    await this.dataSource.query(
      `
      WITH active_sessions AS (
        SELECT id, created_at
        FROM refresh_tokens
        WHERE user_id = $1
          AND revoked_at IS NULL
        ORDER BY created_at ASC
      ),
      to_revoke AS (
        SELECT id FROM active_sessions
        OFFSET $2
      )
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE id IN (SELECT id FROM to_revoke)
      `,
      [userId, this.maxSessions - 1],
    );
  }

  async persistRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    ctx: TokenContext,
    deviceInfo: { browser?: string; os?: string; deviceName?: string },
  ): Promise<void> {
    // One browser = one session: logging in again (or switching group) on
    // the same device replaces its old session instead of adding another.
    if (ctx.deviceId)
      await this.dataSource.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
          WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
        [userId, ctx.deviceId],
      );
    // Raw INSERT — faster than TypeORM .save() which does SELECT first
    await this.dataSource.query(
      `
      INSERT INTO refresh_tokens
        (user_id, token_hash, expires_at, ip_address, user_agent, device_name, device_info, provider, device_id, last_used_at, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `,
      [
        userId,
        tokenHash,
        expiresAt,
        ctx.ip ?? null,
        ctx.userAgent ?? null,
        deviceInfo.deviceName ?? null,
        JSON.stringify({ browser: deviceInfo.browser, os: deviceInfo.os }),
        ctx.provider ?? null,
        ctx.deviceId ?? null,
      ],
    );

    // Opportunistic prune: nothing ever deleted expired or long-revoked rows,
    // so refresh_tokens grew without bound (86 rows for 2 users in dev). Scoped
    // to this user and driven off the same index the session list uses, so it
    // costs one cheap delete on a path that already writes — no scheduler or
    // extra infrastructure to keep alive.
    await this.dataSource
      .query(
        `DELETE FROM refresh_tokens
          WHERE user_id = $1
            AND (expires_at < now() - interval '7 days'
                 OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days'))`,
        [userId],
      )
      .catch(() => undefined); // housekeeping must never fail a login
  }

  async revokeSessionByTokenHash(tokenHash: string) {
    await this.dataSource.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
      [tokenHash],
    );
  }

  /** Returns the stored refresh token row plus the joined user (camelCase, matches RefreshToken.user). */
  async findByTokenHash(
    tokenHash: string,
  ): Promise<(RefreshToken & { user: User }) | null> {
    const rows = await this.dataSource.query<any>(
      `SELECT
         rt.id AS "id", rt.user_id AS "userId", rt.token_hash AS "tokenHash",
         rt.device_name AS "deviceName", rt.device_info AS "deviceInfo",
         rt.ip_address AS "ipAddress", rt.location AS "location", rt.user_agent AS "userAgent",
         rt.provider AS "provider", rt.last_used_at AS "lastUsedAt", rt.expires_at AS "expiresAt",
         rt.revoked_at AS "revokedAt", rt.created_at AS "createdAt",
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.username AS "u_username", u.email AS "u_email", u.phone_number AS "u_phoneNumber",
         u.password_hash AS "u_passwordHash", u.avatar_url AS "u_avatarUrl",
         u.language AS "u_language", u.timezone AS "u_timezone", u.theme AS "u_theme",
         u.is_active AS "u_isActive", u.is_verified AS "u_isVerified", u.providers AS "u_providers",
         u.needs_password_setup AS "u_needsPasswordSetup", u.last_seen AS "u_lastSeen",
         u.created_at AS "u_createdAt", u.updated_at AS "u_updatedAt",
         u.deleted_at AS "u_deletedAt", u.deleted_by AS "u_deletedBy"
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;

    const {
      id,
      userId,
      tokenHash: th,
      deviceName,
      deviceInfo,
      ipAddress,
      location,
      userAgent,
      provider,
      lastUsedAt,
      expiresAt,
      revokedAt,
      createdAt,
      ...prefixed
    } = row;

    const user = mapUserRow(
      Object.fromEntries(
        Object.entries(prefixed).map(([k, v]) => [k.slice(2), v]),
      ) as unknown as User,
    );

    return {
      id,
      userId,
      tokenHash: th,
      deviceName,
      deviceInfo,
      ipAddress,
      location,
      userAgent,
      provider,
      lastUsedAt,
      expiresAt,
      revokedAt,
      createdAt,
      user,
    };
  }

  /**
   * Atomically flips revoked_at from NULL to now() — only one concurrent
   * caller for the same token id can win this. Used by refresh rotation to
   * close the race where two requests both read revoked_at=NULL before
   * either write commits (e.g. the same account open in two tabs, both
   * refreshing around the same moment).
   */
  async claimRefreshToken(id: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }

  async save(session: RefreshToken) {
    const { setClause, values } = (() => {
      const cols = ['revokedAt', 'lastUsedAt'] as const;
      const entries = cols
        .filter((c) => session[c] !== undefined)
        .map(
          (c) =>
            [
              c === 'revokedAt' ? 'revoked_at' : 'last_used_at',
              session[c],
            ] as const,
        );
      const setClause = entries
        .map(([col], i) => `${col} = $${i + 2}`)
        .join(', ');
      return { setClause, values: entries.map(([, v]) => v) };
    })();
    if (!setClause) return session;
    await this.dataSource.query(
      `UPDATE refresh_tokens SET ${setClause} WHERE id = $1`,
      [session.id, ...values],
    );
    return session;
  }
}
