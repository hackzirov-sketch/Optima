import { isSuperAdmin } from '../../../common/super-admin';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { User } from '../../../database/entities/user.entity';
import { UserSettings } from '../../../database/entities/user-settings.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { UpdateProfileDto } from '../schemas/update-profile.schema';
import { UpdateSettingsDto } from '../schemas/update-settings.schema';
import { PublicUserDto } from '../schemas/public-user.schema';
import { RedisService } from '../../../redis/redis.service';
import { RedisKeys } from '../../../redis/redis.keys';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { ImageModerationService } from '../../moderation/services/image-moderation.service';
import { buildUpdateSet } from '../../../common/utils/sql.util';
import {
  USER_COLUMNS_SQL,
  USER_AUTH_COLUMNS_SQL,
  mapUserRow,
  serializeProviders,
} from '../repositories/users.sql';

function parseExpiry(s: string): number {
  const n = parseInt(s, 10);
  if (s.endsWith('d')) return n * 86400;
  if (s.endsWith('h')) return n * 3600;
  if (s.endsWith('m')) return n * 60;
  return n;
}

@Injectable()
export class UsersService {
  constructor(
    private dataSource: DatabaseService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly contentFilter: ContentFilterService,
    private readonly imageModeration: ImageModerationService,
  ) {}

  async findById(id: string): Promise<User> {
    const rows = await this.dataSource.query<User>(
      `SELECT ${USER_COLUMNS_SQL} FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const user = rows[0] && mapUserRow(rows[0]);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }

  async findPublicById(id: string): Promise<PublicUserDto> {
    const rows = await this.dataSource.query<PublicUserDto>(
      `SELECT id, public_id::text AS "publicId", first_name AS "firstName", last_name AS "lastName", username, nickname,
              avatar_url AS "avatarUrl", name_emoji AS "nameEmoji", bio, last_seen AS "lastSeen"
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const user = rows[0];
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }

  /** Ported from main — looks up a public profile by @username or numeric public_id. */
  async findPublic(identifier: string): Promise<PublicUserDto> {
    const normalized = identifier.replace(/^@/, '');
    const isNumeric = /^\d+$/.test(normalized);
    // The internal id too: chat messages carry the sender's id and nothing
    // else, and that is where most profile cards are opened from.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized);
    const rows = await this.dataSource.query<PublicUserDto>(
      isUuid
        ? `SELECT id, public_id::text AS "publicId", first_name AS "firstName", last_name AS "lastName",
                  username, nickname, avatar_url AS "avatarUrl", name_emoji AS "nameEmoji", bio, last_seen AS "lastSeen",
                  account_visibility AS "accountVisibility"
           FROM users WHERE id = $1 AND deleted_at IS NULL`
        : isNumeric
        ? `SELECT id, public_id::text AS "publicId", first_name AS "firstName", last_name AS "lastName",
                  username, nickname, avatar_url AS "avatarUrl", name_emoji AS "nameEmoji", bio, last_seen AS "lastSeen",
                  account_visibility AS "accountVisibility"
           FROM users WHERE public_id = $1 AND deleted_at IS NULL`
        : `SELECT id, public_id::text AS "publicId", first_name AS "firstName", last_name AS "lastName",
                  username, nickname, avatar_url AS "avatarUrl", name_emoji AS "nameEmoji", bio, last_seen AS "lastSeen",
                  account_visibility AS "accountVisibility"
           FROM users WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
      [isUuid ? normalized : isNumeric ? Number(normalized) : normalized],
    );
    const user = rows[0];
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    user.isSuperAdmin = isSuperAdmin(user.id) || undefined;
    // Only public channels with a username (slug): those are the ones with a
    // shareable address, the same rule the room drawer uses for its link.
    user.channels = await this.dataSource.query(
      `SELECT r.id, r.name, r.slug, r.avatar_url AS "avatarUrl",
              (SELECT COUNT(*)::int FROM chat_members m
                WHERE m.room_id = r.id AND m.left_at IS NULL AND m.status = 'active') AS "memberCount"
         FROM chat_rooms r
        WHERE r.created_by = $1 AND r.type = 'channel' AND r.scope = 'public'
          AND r.slug IS NOT NULL AND r.is_archived = false
        ORDER BY r.created_at
        LIMIT 5`,
      [user.id],
    );
    return user;
  }

  async findByIdWithRelations(id: string) {
    const user = await this.findById(id);

    const [settings, memberships] = await Promise.all([
      this.dataSource.query(
        `SELECT id, user_id AS "userId", notifications_enabled AS "notificationsEnabled",
                email_notifications AS "emailNotifications", push_notifications AS "pushNotifications",
                notify_task_assigned AS "notifyTaskAssigned", notify_push_reviewed AS "notifyPushReviewed",
                notify_pr_events AS "notifyPrEvents", notify_mentions AS "notifyMentions",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM user_settings WHERE user_id = $1`,
        [id],
      ),
      this.dataSource.query(
        `SELECT
           wm.role AS "role", wm.joined_at AS "joinedAt",
           w.id AS "id", w.owner_id AS "ownerId", w.name AS "name", w.slug AS "slug",
           w.description AS "description", w.avatar_url AS "avatarUrl",
           w.visibility AS "visibility", w.max_members AS "maxMembers",
           w.max_projects AS "maxProjects", w.created_at AS "createdAt",
           w.updated_at AS "updatedAt"
         FROM group_members wm
         JOIN groups w ON w.id = wm.group_id
         WHERE wm.user_id = $1 AND w.deleted_at IS NULL`,
        [id],
      ),
    ]);

    // isSuperAdmin: from the server env (see common/super-admin), so the app
    // can show the admin panel; the server checks it again on every call.
    return { ...user, settings: settings[0] ?? null, groups: memberships, isSuperAdmin: isSuperAdmin(user.id) };
  }

  /** Bulk last_seen lookup — the durable "history" half of presence (see ChatPresenceService for the live half). */
  async getLastSeenBulk(
    userIds: string[],
  ): Promise<Record<string, string | null>> {
    if (userIds.length === 0) return {};
    const rows = await this.dataSource.query<{
      id: string;
      lastSeen: string | null;
    }>(
      `SELECT id, last_seen AS "lastSeen" FROM users WHERE id = ANY($1::uuid[])`,
      [userIds],
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.lastSeen]));
  }

  /**
   * Fuzzy user search for the "start a DM" / member picker. Respects account
   * privacy: a PRIVATE account is excluded from fuzzy matches (name/username/
   * email substring), but still resolves on an *exact* @username or public_id
   * match — the "findable by direct link, not by browsing" rule.
   */
  async searchPublic(q: string, limit = 20) {
    // `\%` in a JS string literal is just `%` — there is no such escape
    // sequence — so the previous version escaped nothing and left both LIKE
    // wildcards live: searching `%` matched every row in the table. Escape the
    // backslash itself, and declare it with ESCAPE so Postgres honours it.
    const term = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const exactUsername = q.replace(/^@/, '');
    const exactPublicId = /^\d+$/.test(q) ? Number(q) : null;
    // If the query looks like an email, include email search (exact match or ILIKE)
    const isEmail = q.includes('@');
    const rows: any[] = isEmail
      ? await this.dataSource.query(
          // `email = $1`, not `email ILIKE $1`. Two separate problems lived in
          // that one operator: the parameter was the raw query string, so a
          // search for `%@%` matched every address in the table and turned this
          // into a bulk directory dump; and a substring match on an address is
          // an oracle — `?q=someone@example.com` answering with a row confirms
          // that address is registered, which is exactly what the login flow
          // goes out of its way not to reveal. An exact match is what the
          // "I know their address" case actually needs, and lower() keeps it
          // case-insensitive without reintroducing wildcards.
          `SELECT id, first_name AS "firstName", last_name AS "lastName", username, avatar_url AS "avatarUrl"
           FROM users
           WHERE deleted_at IS NULL AND (lower(email) = lower($1) OR first_name ILIKE $2 ESCAPE '\\' OR last_name ILIKE $2 ESCAPE '\\' OR username ILIKE $2 ESCAPE '\\')
             AND (account_visibility = 'public' OR lower(username) = lower($4) OR public_id = $5)
           ORDER BY CASE WHEN lower(email) = lower($1) THEN 0 WHEN username ILIKE $2 ESCAPE '\\' THEN 1 ELSE 2 END, last_name ASC
           LIMIT $3`,
          [q, term, limit, exactUsername, exactPublicId],
        )
      : await this.dataSource.query(
          `SELECT id, first_name AS "firstName", last_name AS "lastName", username, avatar_url AS "avatarUrl"
           FROM users
           WHERE deleted_at IS NULL AND (first_name ILIKE $1 ESCAPE '\\' OR last_name ILIKE $1 ESCAPE '\\' OR username ILIKE $1 ESCAPE '\\')
             AND (account_visibility = 'public' OR lower(username) = lower($3) OR public_id = $4)
           ORDER BY CASE WHEN username ILIKE $1 ESCAPE '\\' THEN 0 ELSE 1 END, last_name ASC
           LIMIT $2`,
          [term, limit, exactUsername, exactPublicId],
        );
    return rows;
  }

  async updateAccountVisibility(
    userId: string,
    visibility: 'public' | 'private',
  ): Promise<User> {
    await this.dataSource.query(
      `UPDATE users SET account_visibility = $2 WHERE id = $1`,
      [userId, visibility],
    );
    await this.invalidateUserCache(userId);
    return this.findById(userId);
  }

  async findByEmail(email: string): Promise<User | null> {
    // Select only auth-critical fields — avoids fetching unused columns (avatarUrl, settings, etc.)
    const rows = await this.dataSource.query<User>(
      `SELECT ${USER_AUTH_COLUMNS_SQL} FROM users WHERE email = $1`,
      [email],
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows = await this.dataSource.query<User>(
      `SELECT ${USER_COLUMNS_SQL} FROM users WHERE username = $1`,
      [username],
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async create(data: Partial<User>): Promise<User> {
    const rows = await this.dataSource.query<User>(
      `INSERT INTO users
         (first_name, last_name, username, email, phone_number, password_hash,
          avatar_url, language, timezone, theme, occupation, is_active, is_verified,
          providers, needs_password_setup)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7,
          COALESCE($8, 'en')::users_language_enum, COALESCE($9, 'UTC'),
          COALESCE($10, 'system')::users_theme_enum,
          $11,
          COALESCE($12, true), COALESCE($13, false), $14, COALESCE($15, false))
       RETURNING ${USER_COLUMNS_SQL}`,
      [
        data.firstName,
        data.lastName,
        data.username,
        data.email,
        data.phoneNumber ?? null,
        data.passwordHash ?? null,
        data.avatarUrl ?? null,
        data.language ?? null,
        data.timezone ?? null,
        data.theme ?? null,
        data.occupation ?? null,
        data.isActive ?? null,
        data.isVerified ?? null,
        serializeProviders(data.providers) ?? 'local',
        data.needsPasswordSetup ?? null,
      ],
    );
    return mapUserRow(rows[0]);
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    const patch: Record<string, unknown> = { ...data };
    if (data.providers !== undefined) {
      patch.providers = serializeProviders(data.providers);
    }
    const { setClause, values } = buildUpdateSet(patch, 2, {
      language: 'users_language_enum',
      theme: 'users_theme_enum',
    });
    if (!setClause) return;
    await this.dataSource.query(`UPDATE users SET ${setClause} WHERE id = $1`, [
      id,
      ...values,
    ]);
    await this.invalidateUserCache(id);
  }

  /**
   * JwtStrategy caches the user row for 30s to keep auth off the hot path.
   * Nothing was clearing it, so a change that has to take effect *now* —
   * deactivating an account above all, but also a profile or provider update —
   * silently didn't for up to half a minute. Every write path that touches the
   * cached shape drops the entry.
   *
   * Failures are swallowed: the cache is an optimisation with a short TTL, and
   * a Redis blip shouldn't turn a successful profile update into a 500.
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    await this.redisService.clearCachedUser(userId).catch(() => null);
  }

  /**
   * Records that a user was just active. Called from every socket heartbeat
   * and every login, so it is the highest-frequency write in the app.
   *
   * It does not touch Postgres. The 30-second debounce it used to rely on
   * still meant one UPDATE per active user per 30 seconds — at a thousand
   * concurrent users that is ~33 writes/second spent entirely on a
   * "last seen" timestamp, each one a row lock, a WAL record and an index
   * update. The timestamp is instead staged in a Redis hash and written back
   * in a single statement by flushLastSeen() below.
   *
   * If Redis is unavailable the write goes straight to Postgres, keeping the
   * old behaviour rather than losing the column entirely.
   */
  async updateLastSeen(userId: string): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) {
      await this.dataSource.query(
        `UPDATE users SET last_seen = now() WHERE id = $1`,
        [userId],
      );
      return;
    }
    await client.hset(RedisKeys.lastSeenPending, userId, Date.now());
  }

  /**
   * Drains the staged last_seen timestamps into one bulk UPDATE.
   *
   * The drain is atomic (see RedisService.drainHash), so overlapping ticks —
   * or several API instances flushing at once — can't take the same batch
   * twice, and a heartbeat arriving mid-drain lands in the next batch rather
   * than being dropped. The unnest form keeps this to a single statement
   * however many users are in it.
   *
   * Losing a batch to a crash costs at most one interval of "last seen"
   * accuracy, which is the right trade for taking the write off the hot path.
   */
  async flushLastSeen(): Promise<number> {
    const staged = await this.redisService.drainHash(RedisKeys.lastSeenPending);
    const userIds = Object.keys(staged);
    if (userIds.length === 0) return 0;

    const timestamps = userIds.map((id) =>
      new Date(Number(staged[id])).toISOString(),
    );
    await this.dataSource.query(
      `UPDATE users u SET last_seen = v.seen
         FROM (SELECT * FROM unnest($1::uuid[], $2::timestamptz[]) AS t(id, seen)) v
        WHERE u.id = v.id AND (u.last_seen IS NULL OR u.last_seen < v.seen)`,
      [userIds, timestamps],
    );
    return userIds.length;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const texts = [dto.firstName, dto.lastName, dto.nickname, dto.bio].filter(
      Boolean,
    ) as string[];
    for (const t of texts) {
      await this.contentFilter.filterText(t, userId, 'profile');
    }
    try {
      await this.update(userId, dto);
    } catch (error) {
      if (
        (error as { code?: string })?.code === '23505' &&
        dto.username !== undefined
      ) {
        throw new ConflictException({
          code: 'USERNAME_TAKEN',
          message: 'Username is already taken',
        });
      }
      throw error;
    }
    return this.findById(userId);
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<UserSettings> {
    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
    );
    if (setClause) {
      await this.dataSource.query(
        `UPDATE user_settings SET ${setClause} WHERE user_id = $1`,
        [userId, ...values],
      );
    }
    const rows = await this.dataSource.query<UserSettings>(
      `SELECT id, user_id AS "userId", notifications_enabled AS "notificationsEnabled",
              email_notifications AS "emailNotifications", push_notifications AS "pushNotifications",
              notify_task_assigned AS "notifyTaskAssigned", notify_push_reviewed AS "notifyPushReviewed",
              notify_pr_events AS "notifyPrEvents", notify_mentions AS "notifyMentions",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Settings not found',
      });
    }
    return rows[0];
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    await this.imageModeration.filterImageUrl(avatarUrl, userId);
    await this.dataSource.query(
      `UPDATE users SET avatar_url = $2 WHERE id = $1`,
      [userId, avatarUrl],
    );
    await this.invalidateUserCache(userId);
    return this.findById(userId);
  }

  async updateBackground(
    userId: string,
    backgroundUrl: string | null,
  ): Promise<User> {
    if (backgroundUrl) {
      await this.imageModeration.filterImageUrl(backgroundUrl, userId);
    }
    await this.dataSource.query(
      `UPDATE users SET background_url = $2 WHERE id = $1`,
      [userId, backgroundUrl],
    );
    await this.invalidateUserCache(userId);
    return this.findById(userId);
  }

  async softDeleteAccount(userId: string): Promise<void> {
    await this.findById(userId);
    // Block all active access tokens before revoking refresh tokens.
    // TTL covers the max access-token lifetime so no valid token can slip through.
    const accessExpires =
      this.configService.get<string>('jwt.accessExpires') || '25m';
    const ttlSeconds = parseExpiry(accessExpires);
    await this.redisService.blockUserSessions(userId, ttlSeconds);
    await this.dataSource.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [userId],
    );
    await this.dataSource.query(
      `UPDATE users SET deleted_by = $1, deleted_at = now() WHERE id = $1`,
      [userId],
    );
    await this.invalidateUserCache(userId);
  }
}
