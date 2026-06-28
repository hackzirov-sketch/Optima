import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RefreshToken } from '../../../database/entities/refresh-token.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';

interface TokenContext {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  provider?: string;
}

@Injectable()
export class SessionService {
  private readonly maxSessions: number;

  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {
    this.maxSessions = this.configService.get<number>('app.maxSessions') ?? 5;
  }

  async getSessions(userId: string) {
    const sessions = await this.refreshTokensRepository.find({
      where: { userId, revokedAt: IsNull(), isDeleted: false },
      order: { lastUsedAt: 'DESC' },
    });

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
    const session = await this.refreshTokensRepository.findOne({
      where: { id: sessionId, userId, isDeleted: false },
    });
    if (!session) {
      throw new NotFoundException({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found or already revoked' });
    }

    session.revokedAt = new Date();
    session.isDeleted = true;
    await this.refreshTokensRepository.save(session);
    return { message: 'Session revoked successfully' };
  }

  async revokeAllSessions(userId: string) {
    await this.refreshTokensRepository.update(
      { userId, isDeleted: false },
      { revokedAt: new Date(), isDeleted: true },
    );
    return { message: 'All sessions revoked successfully' };
  }

  /**
   * OPTIMIZED: Single CTE query instead of COUNT → SELECT → SAVE (3 round trips → 1)
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
          AND is_deleted = false
        ORDER BY created_at ASC
      ),
      to_revoke AS (
        SELECT id FROM active_sessions
        OFFSET $2
      )
      UPDATE refresh_tokens
      SET revoked_at = NOW(), is_deleted = true
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
    // Raw INSERT — faster than TypeORM .save() which does SELECT first
    await this.dataSource.query(
      `
      INSERT INTO refresh_tokens
        (user_id, token_hash, expires_at, ip_address, user_agent, device_name, device_info, provider, last_used_at, is_deleted, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), false, NOW())
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
      ],
    );
  }

  async revokeSessionByTokenHash(tokenHash: string) {
    await this.refreshTokensRepository.update(
      { tokenHash },
      { revokedAt: new Date(), isDeleted: true },
    );
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });
  }

  async save(session: RefreshToken) {
    return this.refreshTokensRepository.save(session);
  }
}
