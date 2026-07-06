import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../../database/entities/user.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { PublicUserDto } from './dto/public-user.dto';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.keys';
import { ContentFilterService } from '../moderation/services/content-filter.service';
import { ImageModerationService } from '../moderation/services/image-moderation.service';
import { buildUpdateSet } from '../../common/utils/sql.util';
import {
  USER_COLUMNS_SQL,
  USER_AUTH_COLUMNS_SQL,
  mapUserRow,
  serializeProviders,
} from './users.sql';

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
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly contentFilter: ContentFilterService,
    private readonly imageModeration: ImageModerationService,
  ) {}

  async findById(id: string): Promise<User> {
    const rows: User[] = await this.dataSource.query(
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
    const rows: PublicUserDto[] = await this.dataSource.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", username,
              avatar_url AS "avatarUrl", last_seen AS "lastSeen"
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
         FROM workspace_members wm
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = $1 AND w.deleted_at IS NULL`,
        [id],
      ),
    ]);

    return { ...user, settings: settings[0] ?? null, workspaces: memberships };
  }

  async findByEmail(email: string): Promise<User | null> {
    // Select only auth-critical fields — avoids fetching unused columns (avatarUrl, settings, etc.)
    const rows: User[] = await this.dataSource.query(
      `SELECT ${USER_AUTH_COLUMNS_SQL} FROM users WHERE email = $1`,
      [email],
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows: User[] = await this.dataSource.query(
      `SELECT ${USER_COLUMNS_SQL} FROM users WHERE username = $1`,
      [username],
    );
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async create(data: Partial<User>): Promise<User> {
    const rows: User[] = await this.dataSource.query(
      `INSERT INTO users
         (first_name, last_name, username, email, phone_number, password_hash,
          avatar_url, language, timezone, theme, is_active, is_verified,
          providers, needs_password_setup)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7,
          COALESCE($8, 'en')::users_language_enum, COALESCE($9, 'UTC'),
          COALESCE($10, 'system')::users_theme_enum,
          COALESCE($11, true), COALESCE($12, false), $13, COALESCE($14, false))
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
    await this.dataSource.query(
      `UPDATE users SET ${setClause} WHERE id = $1`,
      [id, ...values],
    );
  }

  async updateLastSeen(userId: string): Promise<void> {
    const key = RedisKeys.lastSeen(userId);
    const client = this.redisService.getClient();
    if (client) {
      const isSet = await client.set(key, '1', 'EX', 30, 'NX');
      if (!isSet) return; // Debounce for 30 seconds
    }
    await this.dataSource.query(`UPDATE users SET last_seen = now() WHERE id = $1`, [userId]);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const texts = [dto.firstName, dto.lastName].filter(Boolean) as string[];
    for (const t of texts) {
      await this.contentFilter.filterText(t, userId, 'profile');
    }
    await this.update(userId, dto as Partial<User>);
    return this.findById(userId);
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserSettings> {
    const { setClause, values } = buildUpdateSet(dto as Record<string, unknown>, 2);
    if (setClause) {
      await this.dataSource.query(
        `UPDATE user_settings SET ${setClause} WHERE user_id = $1`,
        [userId, ...values],
      );
    }
    const rows: UserSettings[] = await this.dataSource.query(
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
    await this.dataSource.query(`UPDATE users SET avatar_url = $2 WHERE id = $1`, [
      userId,
      avatarUrl,
    ]);
    return this.findById(userId);
  }

  async softDeleteAccount(userId: string): Promise<void> {
    await this.findById(userId);
    // Block all active access tokens before revoking refresh tokens.
    // TTL covers the max access-token lifetime so no valid token can slip through.
    const accessExpires = this.configService.get<string>('jwt.accessExpires') || '25m';
    const ttlSeconds = parseExpiry(accessExpires);
    await this.redisService.blockUserSessions(userId, ttlSeconds);
    await this.dataSource.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
    await this.dataSource.query(
      `UPDATE users SET deleted_by = $1, deleted_at = now() WHERE id = $1`,
      [userId],
    );
  }
}
