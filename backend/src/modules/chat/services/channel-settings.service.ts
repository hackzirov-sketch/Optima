import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatMemberService } from './member.service';
import { RedisService } from '../../../redis/redis.service';
import { RedisKeys } from '../../../redis/redis.keys';
import { AuditService } from '../../../common/services/audit.service';
import {
  ChatEncryptionService,
  EncryptedMessage,
} from '../chat-encryption.service';

/**
 * Settings change rarely and every write drops the entry explicitly, so this
 * TTL is only a backstop against a missed invalidation, not the mechanism.
 */
const SETTINGS_TTL_SECONDS = 300;

/** Who a permission is open to, tightest first. */
export const AUDIENCES = ['owner', 'admins', 'moderators', 'members'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const COMMENT_AUDIENCES = [
  'everyone',
  'subscribers',
  'verified',
  'disabled',
] as const;
export type CommentAudience = (typeof COMMENT_AUDIENCES)[number];

export type RoomRole = 'owner' | 'admin' | 'moderator' | 'member';

/**
 * Role ranking used for every permission decision. A higher number can do
 * everything a lower one can, so a single comparison replaces the scattered
 * `['owner','admin'].includes(role)` checks that had to be kept in sync by
 * hand — and were already out of sync (message.service allowed admins where
 * room-invite.service allowed only the creator).
 */
const ROLE_RANK: Record<RoomRole, number> = {
  member: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

/** The minimum role each audience setting admits. */
const AUDIENCE_MIN_RANK: Record<Audience, number> = {
  members: 0,
  moderators: 1,
  admins: 2,
  owner: 3,
};

export function roleSatisfies(role: RoomRole, audience: Audience): boolean {
  return ROLE_RANK[role] >= AUDIENCE_MIN_RANK[audience];
}

/**
 * Every column of channel_settings, in the shape the API speaks. Sections
 * whose behaviour isn't built yet (AI, analytics, integrations, security,
 * files, meeting, education) are stored and returned faithfully — an operator
 * can express intent now and the feature starts honouring it later without a
 * migration.
 */
export interface ChannelSettings {
  roomId: string;
  bannerUrl: string | null;
  language: string | null;
  category: string | null;

  discoverable: boolean;
  allowInviteLinks: boolean;
  joinRequiresApproval: boolean;

  whoCanPost: Audience;
  whoCanComment: CommentAudience;
  whoCanUploadFiles: Audience;
  whoCanSendVoice: Audience;
  whoCanSendMedia: Audience;
  reactionsEnabled: boolean;

  autoDeleteDays: number | null;
  slowModeSeconds: number;
  spamFilter: boolean;
  linkFilter: boolean;
  badWordsFilter: boolean;
  badWords: string[];

  defaultNotifications: boolean;
  mentionNotifications: boolean;
  eventNotifications: boolean;
  emailNotifications: boolean;

  pinnedMessageId: string | null;
  welcomeMessage: string | null;
  rules: string | null;
  faq: string | null;

  maxUploadBytes: number | null;
  allowedFileTypes: string[];

  requireAdmin2fa: boolean;

  allowMeetings: boolean;
  allowLiveStream: boolean;
  allowScreenShare: boolean;
  allowRecording: boolean;
  allowMeetingChat: boolean;

  aiModeration: boolean;
  aiSummary: boolean;
  aiTags: boolean;
  aiTranslate: boolean;
  aiSpamDetect: boolean;

  courseId: string | null;
  playlistId: string | null;
  trackProgress: boolean;
  linkedProjectId: string | null;
  autoPostTasks: boolean;
  isVerified: boolean;
  minReputation: number;
  joinQuestions: string[];

  integrations: Record<string, unknown>;
}

/** Column ↔ field mapping, single source of truth for both read and write. */
const COLUMNS: Array<[keyof ChannelSettings, string]> = [
  ['bannerUrl', 'banner_url'],
  ['language', 'language'],
  ['category', 'category'],
  ['discoverable', 'discoverable'],
  ['allowInviteLinks', 'allow_invite_links'],
  ['joinRequiresApproval', 'join_requires_approval'],
  ['whoCanPost', 'who_can_post'],
  ['whoCanComment', 'who_can_comment'],
  ['whoCanUploadFiles', 'who_can_upload_files'],
  ['whoCanSendVoice', 'who_can_send_voice'],
  ['whoCanSendMedia', 'who_can_send_media'],
  ['reactionsEnabled', 'reactions_enabled'],
  ['autoDeleteDays', 'auto_delete_days'],
  ['slowModeSeconds', 'slow_mode_seconds'],
  ['spamFilter', 'spam_filter'],
  ['linkFilter', 'link_filter'],
  ['badWordsFilter', 'bad_words_filter'],
  ['badWords', 'bad_words'],
  ['defaultNotifications', 'default_notifications'],
  ['mentionNotifications', 'mention_notifications'],
  ['eventNotifications', 'event_notifications'],
  ['emailNotifications', 'email_notifications'],
  ['pinnedMessageId', 'pinned_message_id'],
  ['welcomeMessage', 'welcome_message'],
  ['rules', 'rules'],
  ['faq', 'faq'],
  ['maxUploadBytes', 'max_upload_bytes'],
  ['allowedFileTypes', 'allowed_file_types'],
  ['requireAdmin2fa', 'require_admin_2fa'],
  ['allowMeetings', 'allow_meetings'],
  ['allowLiveStream', 'allow_live_stream'],
  ['allowScreenShare', 'allow_screen_share'],
  ['allowRecording', 'allow_recording'],
  ['allowMeetingChat', 'allow_meeting_chat'],
  ['aiModeration', 'ai_moderation'],
  ['aiSummary', 'ai_summary'],
  ['aiTags', 'ai_tags'],
  ['aiTranslate', 'ai_translate'],
  ['aiSpamDetect', 'ai_spam_detect'],
  ['courseId', 'course_id'],
  ['playlistId', 'playlist_id'],
  ['trackProgress', 'track_progress'],
  ['linkedProjectId', 'linked_project_id'],
  ['autoPostTasks', 'auto_post_tasks'],
  ['isVerified', 'is_verified'],
  ['minReputation', 'min_reputation'],
  ['joinQuestions', 'join_questions'],
  ['integrations', 'integrations'],
];

const SELECT_SQL = COLUMNS.map(
  ([field, column]) => `${column} AS "${field}"`,
).join(', ');

/**
 * Fields an ordinary member is allowed to see. Everything else — moderation
 * thresholds, filters, integrations, the audit trail — is operational detail
 * that tells a would-be spammer exactly which limits to stay under.
 */
const MEMBER_VISIBLE: Array<keyof ChannelSettings> = [
  'roomId',
  'bannerUrl',
  'language',
  'category',
  'whoCanPost',
  'whoCanComment',
  'whoCanSendMedia',
  'whoCanSendVoice',
  'whoCanUploadFiles',
  'reactionsEnabled',
  'slowModeSeconds',
  'pinnedMessageId',
  'welcomeMessage',
  'rules',
  'faq',
  'isVerified',
  'defaultNotifications',
];

/** Settings only the owner may change — they redefine who holds the room. */
const OWNER_ONLY: Array<keyof ChannelSettings> = ['isVerified'];

@Injectable()
export class ChannelSettingsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly memberService: ChatMemberService,
    private readonly redis: RedisService,
    private readonly chatEncryption: ChatEncryptionService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Reads settings, creating the row on first access so every room behaves as
   * though it has always had one. `ON CONFLICT DO NOTHING` + a re-select keeps
   * two concurrent openers from racing into a unique violation.
   */
  /**
   * Read on the send-message hot path — every single message checks who may
   * post, what MIME types are allowed and whether slow mode is on — so in a
   * busy room this was one SELECT per message on a row that changes maybe
   * once a week. Cached with an explicit drop in update(), which is the only
   * thing that writes it.
   */
  async getRaw(roomId: string): Promise<ChannelSettings> {
    const cacheKey = RedisKeys.roomSettings(roomId);
    const cached = await this.redis.getJson<ChannelSettings>(cacheKey);
    if (cached) return cached;

    const read = async () =>
      (
        await this.dataSource.query<ChannelSettings>(
          `SELECT room_id AS "roomId", ${SELECT_SQL} FROM channel_settings WHERE room_id = $1`,
          [roomId],
        )
      )[0];

    const existing = await read();
    if (existing) {
      await this.redis.setJson(cacheKey, existing, SETTINGS_TTL_SECONDS);
      return existing;
    }

    await this.dataSource.query(
      `INSERT INTO channel_settings (room_id, who_can_post)
       SELECT id, CASE WHEN posting_mode = 'admins_only' THEN 'admins' ELSE 'members' END
         FROM chat_rooms WHERE id = $1
       ON CONFLICT (room_id) DO NOTHING`,
      [roomId],
    );
    const created = await read();
    if (!created)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    await this.redis.setJson(cacheKey, created, SETTINGS_TTL_SECONDS);
    return created;
  }

  async getRole(roomId: string, userId: string): Promise<RoomRole> {
    const member = await this.memberService.assertRoomMember(roomId, userId);
    return ((member as { role?: string }).role as RoomRole) ?? 'member';
  }

  /**
   * The settings a given caller may see. Members get the subset that describes
   * the room's rules to them; moderators and above get everything.
   */
  async getForUser(roomId: string, userId: string) {
    const [settings, role] = await Promise.all([
      this.getRaw(roomId),
      this.getRole(roomId, userId),
    ]);

    const canAdminister = ROLE_RANK[role] >= ROLE_RANK.moderator;
    if (canAdminister) return { role, canAdminister, settings };

    const visible = Object.fromEntries(
      MEMBER_VISIBLE.map((key) => [key, settings[key]]),
    ) as Partial<ChannelSettings>;
    return { role, canAdminister, settings: visible };
  }

  private assertCanManage(role: RoomRole, forOwnerOnly = false) {
    const required = forOwnerOnly ? ROLE_RANK.owner : ROLE_RANK.admin;
    if (ROLE_RANK[role] < required)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: forOwnerOnly
          ? 'Only the channel owner can change this'
          : 'Only channel admins can change settings',
      });
  }

  /**
   * Applies a partial update and records the diff.
   *
   * Only fields that actually changed are written or logged: a settings dialog
   * posts its whole form on every save, and an audit trail that records forty
   * unchanged values per save is one nobody can read.
   */
  async update(
    roomId: string,
    userId: string,
    patch: Partial<ChannelSettings>,
  ): Promise<{ settings: ChannelSettings; changes: Record<string, unknown> }> {
    const role = await this.getRole(roomId, userId);
    this.assertCanManage(role);

    const touchesOwnerOnly = OWNER_ONLY.some((key) => patch[key] !== undefined);
    if (touchesOwnerOnly) this.assertCanManage(role, true);

    const current = await this.getRaw(roomId);
    const changes: Record<string, unknown> = {};
    const assignments: string[] = [];
    const values: unknown[] = [roomId];

    for (const [field, column] of COLUMNS) {
      // `=== undefined`, not `in`: the ValidationPipe hands us a DTO *instance*,
      // and under ES2022 class fields every optional property is defined as
      // `undefined` on it. `in` was therefore true for all 47 settings on every
      // request, so a PATCH of one toggle was validated as though the client
      // had also sent whoCanPost: undefined — and failed on it.
      const next = patch[field];
      if (next === undefined) continue;
      if (JSON.stringify(next) === JSON.stringify(current[field])) continue;
      this.validateField(field, next);
      changes[field] = { from: current[field], to: next };
      values.push(next);
      assignments.push(`${column} = $${values.length}`);
    }

    if (assignments.length === 0) return { settings: current, changes: {} };

    const rows = await this.dataSource.query<ChannelSettings>(
      `UPDATE channel_settings SET ${assignments.join(', ')}, updated_at = now()
        WHERE room_id = $1
        RETURNING room_id AS "roomId", ${SELECT_SQL}`,
      values,
    );
    // The only write to this row, so the only place the cache can go stale.
    // Awaited before anything else observes the change — the send path reads
    // these settings on every message and must not keep enforcing the old
    // rules after an admin has tightened them.
    await this.redis.drop(RedisKeys.roomSettings(roomId));

    // posting_mode on chat_rooms drives the send path and the room listing, so
    // it has to follow whoCanPost rather than drift away from it.
    if ('whoCanPost' in changes) {
      await this.dataSource.query(
        `UPDATE chat_rooms SET posting_mode = $2 WHERE id = $1`,
        [roomId, patch.whoCanPost === 'members' ? 'members' : 'admins_only'],
      );
    }
    // Search visibility is expressed as scope, which the discovery query reads.
    if ('discoverable' in changes) {
      await this.dataSource.query(
        `UPDATE chat_rooms SET scope = $2 WHERE id = $1 AND scope <> 'group_only'`,
        [roomId, patch.discoverable ? 'public' : 'private'],
      );
    }

    // audit_logs is the platform's one trail — the same table that records a
    // group deletion or a project rename, so a room's history and a
    // group's activity feed are one query with a different filter.
    await this.audit.log({
      groupId: await this.groupOf(roomId),
      actorId: userId,
      action: 'chat_room.settings_updated',
      entityType: 'chat_room',
      entityId: roomId,
      oldValue: Object.fromEntries(
        Object.entries(changes).map(([key, diff]) => [
          key,
          (diff as { from: unknown }).from,
        ]),
      ),
      newValue: Object.fromEntries(
        Object.entries(changes).map(([key, diff]) => [
          key,
          (diff as { to: unknown }).to,
        ]),
      ),
    });

    // Everyone in the room is looking at a UI whose rules just changed —
    // whether they may post, whether reactions exist, how long slow mode is.
    this.events.emit('chat.settings_updated', {
      roomId,
      changedBy: userId,
      changes: Object.keys(changes),
    });
    return { settings: rows[0], changes };
  }

  private validateField(field: keyof ChannelSettings, value: unknown) {
    // `: never` so the compiler knows a failed check ends the branch — without
    // it, narrowing after a fail() call doesn't hold.
    const fail = (message: string): never => {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `${field}: ${message}`,
      });
    };

    const audienceFields: Array<keyof ChannelSettings> = [
      'whoCanPost',
      'whoCanUploadFiles',
      'whoCanSendVoice',
      'whoCanSendMedia',
    ];
    if (
      audienceFields.includes(field) &&
      !AUDIENCES.includes(value as Audience)
    )
      fail(`must be one of ${AUDIENCES.join(', ')}`);
    if (
      field === 'whoCanComment' &&
      !COMMENT_AUDIENCES.includes(value as CommentAudience)
    )
      fail(`must be one of ${COMMENT_AUDIENCES.join(', ')}`);
    if (
      field === 'slowModeSeconds' &&
      (typeof value !== 'number' || value < 0 || value > 3600)
    )
      fail('must be between 0 and 3600 seconds');
    if (
      field === 'autoDeleteDays' &&
      value !== null &&
      (typeof value !== 'number' || value < 1 || value > 365)
    )
      fail('must be null or between 1 and 365 days');
    if (field === 'minReputation' && (typeof value !== 'number' || value < 0))
      fail('must not be negative');
    if (
      field === 'maxUploadBytes' &&
      value !== null &&
      (typeof value !== 'number' || value <= 0)
    )
      fail('must be null or a positive byte count');
    // Free text is bounded so a settings write can't become a storage vector.
    const textLimits: Partial<Record<keyof ChannelSettings, number>> = {
      welcomeMessage: 2000,
      rules: 8000,
      faq: 8000,
      category: 40,
      language: 8,
    };
    const limit = textLimits[field];
    // Only ever applied to the string-typed fields listed above, so a
    // non-string here means a caller passed the wrong shape — reject it rather
    // than stringifying an object into the column.
    if (limit && value !== null && value !== undefined) {
      if (typeof value !== 'string') fail('must be text');
      else if (value.length > limit)
        fail(`must not exceed ${limit} characters`);
    }
  }

  /**
   * Real numbers for the Analytics section, all derived from data the platform
   * already stores — no separate analytics pipeline. Restricted to moderators
   * and above because reach and engagement describe the audience, not the room.
   */
  async getStats(roomId: string, userId: string) {
    const role = await this.getRole(roomId, userId);
    this.assertCanManage(role);

    const [totals] = await this.dataSource.query<{
      subscribers: number;
      messages: number;
      views: number;
      reach: number;
      reactions: number;
      storageBytes: string;
      files: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM chat_members
           WHERE room_id = $1 AND left_at IS NULL) AS subscribers,
         (SELECT count(*)::int FROM chat_messages
           WHERE room_id = $1 AND deleted_at IS NULL) AS messages,
         (SELECT COALESCE(sum(view_count), 0)::int FROM chat_messages
           WHERE room_id = $1 AND deleted_at IS NULL) AS views,
         -- Reach is distinct people, not view events: one person scrolling a
         -- hundred posts is one person reached, not a hundred.
         (SELECT count(DISTINCT v.user_id)::int
            FROM message_views v JOIN chat_messages m ON m.id = v.message_id
           WHERE m.room_id = $1) AS reach,
         (SELECT count(*)::int FROM chat_reactions r
            JOIN chat_messages m ON m.id = r.message_id
           WHERE m.room_id = $1) AS reactions,
         (SELECT COALESCE(sum(a.file_size), 0)::text
            FROM message_attachments a JOIN chat_messages m ON m.id = a.message_id
           WHERE m.room_id = $1) AS "storageBytes",
         (SELECT count(*)::int
            FROM message_attachments a JOIN chat_messages m ON m.id = a.message_id
           WHERE m.room_id = $1) AS files`,
      [roomId],
    );

    const topPostRows = await this.dataSource.query<{
      id: string;
      content: string | null;
      contentJson: EncryptedMessage | null;
      isE2ee: boolean;
      viewCount: number;
      createdAt: Date;
    }>(
      `SELECT id, content, content_json AS "contentJson", is_e2ee AS "isE2ee",
              view_count AS "viewCount", created_at AS "createdAt"
         FROM chat_messages
        WHERE room_id = $1 AND deleted_at IS NULL AND view_count > 0
        ORDER BY view_count DESC
        LIMIT 5`,
      [roomId],
    );
    // Message bodies are encrypted at rest, so the raw `content` column is
    // empty — reading it directly is what made every top post render blank.
    const topPosts = topPostRows.map((row) => ({
      id: row.id,
      // E2EE posts (private channels) stay ciphertext; the client opens them.
      content: row.isE2ee
        ? null
        : this.chatEncryption.safeDecrypt(row.contentJson, row.content ?? ''),
      e2ee: row.isE2ee ? row.contentJson : null,
      viewCount: row.viewCount,
      createdAt: row.createdAt,
    }));

    const growth = await this.dataSource.query<{ day: string; joined: number }>(
      `SELECT to_char(date_trunc('day', joined_at), 'YYYY-MM-DD') AS day,
              count(*)::int AS joined
         FROM chat_members
        WHERE room_id = $1 AND joined_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`,
      [roomId],
    );

    return {
      ...totals,
      storageBytes: Number(totals.storageBytes),
      // Reactions per message: the only engagement figure the stored data
      // actually supports, so it is the one reported rather than a made-up index.
      engagement:
        totals.messages > 0
          ? Math.round((totals.reactions / totals.messages) * 100) / 100
          : 0,
      topPosts,
      growth,
    };
  }

  /** A room's slice of the platform audit trail — admins and above only. */
  async listAudit(roomId: string, userId: string, limit = 50) {
    const role = await this.getRole(roomId, userId);
    this.assertCanManage(role);
    const page = await this.audit.list({
      entityType: 'chat_room',
      entityId: roomId,
      limit,
    });
    return page.items;
  }

  /**
   * The group a room belongs to, if any — channels and groups opened from
   * chat carry none, and audit_logs.group_id is nullable precisely so those
   * rows are still recorded rather than dropped.
   */
  private async groupOf(roomId: string): Promise<string | null> {
    const rows = await this.dataSource.query<{ groupId: string | null }>(
      `SELECT group_id AS "groupId" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    return rows[0]?.groupId ?? null;
  }

  /**
   * Grant or revoke a room role.
   *
   * An admin may appoint moderators and members but not other admins: letting
   * admins mint admins means any one of them can dilute the owner's control
   * and none of it is reversible by the owner alone.
   */
  async setMemberRole(
    roomId: string,
    actorId: string,
    targetUserId: string,
    role: RoomRole,
  ) {
    if (role === 'owner')
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Use ownership transfer to make someone the owner',
      });
    const actorRole = await this.getRole(roomId, actorId);
    this.assertCanManage(actorRole);
    if (actorId === targetUserId)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You cannot change your own role',
      });

    const targetRole = await this.getRole(roomId, targetUserId);
    if (targetRole === 'owner')
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: "The owner's role cannot be changed",
      });
    // You can neither appoint nor demote at or above your own level.
    if (
      ROLE_RANK[actorRole] <= ROLE_RANK[targetRole] ||
      ROLE_RANK[actorRole] <= ROLE_RANK[role]
    )
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'You can only assign roles below your own',
      });

    await this.dataSource.query(
      `UPDATE chat_members SET role = $3
        WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, targetUserId, role],
    );
    await this.memberService.invalidateRoomMember(roomId, targetUserId);
    await this.audit.log({
      groupId: await this.groupOf(roomId),
      actorId,
      action: 'chat_room.member_role_changed',
      entityType: 'chat_room',
      entityId: roomId,
      oldValue: { userId: targetUserId, role: targetRole },
      newValue: { userId: targetUserId, role },
    });
    this.events.emit('chat.member_changed', {
      roomId,
      userId: targetUserId,
      action: 'role_changed',
      role,
    });
    return { userId: targetUserId, role };
  }

  /**
   * The common half of every moderation action: who may act on whom.
   *
   * Same shape as setMemberRole's checks, for the same reason — a moderator
   * who can eject their own admin is not a moderator.
   */
  private async assertCanActOn(
    roomId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<RoomRole> {
    const actorRole = await this.getRole(roomId, actorId);
    this.assertCanManage(actorRole);
    if (actorId === targetUserId)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You cannot do that to yourself',
      });

    const targetRole = await this.getRole(roomId, targetUserId);
    if (ROLE_RANK[actorRole] <= ROLE_RANK[targetRole])
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'You can only act on members below your own level',
      });
    return targetRole;
  }

  /**
   * Remove someone from the room. They keep no access, and may come back the
   * same way anyone else would (a public join or a fresh invite) — that is
   * what makes this different from a ban.
   *
   * There was no way to do either. `is_banned` and `banned_until` have been
   * read on the send path since the columns were added, but nothing ever
   * wrote them and no endpoint removed a member, so a group owner's only
   * answer to someone flooding their room was to leave it themselves.
   */
  async removeMember(roomId: string, actorId: string, targetUserId: string) {
    await this.assertCanActOn(roomId, actorId, targetUserId);

    const rows = await this.dataSource.query<{ id: string }>(
      `UPDATE chat_members SET left_at = now()
        WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL
        RETURNING id`,
      [roomId, targetUserId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'That person is not in this room',
      });

    await this.memberService.invalidateRoomMember(roomId, targetUserId);
    await this.audit.log({
      groupId: await this.groupOf(roomId),
      actorId,
      action: 'chat_room.member_removed',
      entityType: 'chat_room',
      entityId: roomId,
      oldValue: { userId: targetUserId },
    });
    this.events.emit('chat.member_changed', {
      roomId,
      userId: targetUserId,
      action: 'left',
    });
    return { userId: targetUserId, removed: true };
  }

  /**
   * Remove someone and keep them out.
   *
   * `until` makes it a timed ban; omitting it makes it indefinite. The flag
   * outlives the membership row on purpose: it is what the rejoin paths
   * (joinPublicRoom, joinByCode) consult, so a ban survives an invite link
   * being handed to the person who was banned.
   */
  async banMember(
    roomId: string,
    actorId: string,
    targetUserId: string,
    until: Date | null = null,
  ) {
    await this.assertCanActOn(roomId, actorId, targetUserId);

    const rows = await this.dataSource.query<{ id: string }>(
      `UPDATE chat_members
          SET is_banned = true, banned_until = $3, left_at = COALESCE(left_at, now())
        WHERE room_id = $1 AND user_id = $2
        RETURNING id`,
      [roomId, targetUserId, until],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'That person has never been in this room',
      });

    await this.memberService.invalidateRoomMember(roomId, targetUserId);
    await this.audit.log({
      groupId: await this.groupOf(roomId),
      actorId,
      action: 'chat_room.member_banned',
      entityType: 'chat_room',
      entityId: roomId,
      newValue: { userId: targetUserId, until },
    });
    this.events.emit('chat.member_changed', {
      roomId,
      userId: targetUserId,
      action: 'left',
    });
    return { userId: targetUserId, banned: true, until };
  }

  /**
   * Lift a ban. Deliberately does not re-add them to the room: undoing a
   * punishment and putting someone back into a conversation are different
   * decisions, and only the first is the moderator's to make unilaterally.
   */
  async unbanMember(roomId: string, actorId: string, targetUserId: string) {
    const actorRole = await this.getRole(roomId, actorId);
    this.assertCanManage(actorRole);

    const rows = await this.dataSource.query<{ id: string }>(
      `UPDATE chat_members SET is_banned = false, banned_until = NULL
        WHERE room_id = $1 AND user_id = $2 AND (is_banned OR banned_until IS NOT NULL)
        RETURNING id`,
      [roomId, targetUserId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'That person is not banned from this room',
      });

    await this.memberService.invalidateRoomMember(roomId, targetUserId);
    await this.audit.log({
      groupId: await this.groupOf(roomId),
      actorId,
      action: 'chat_room.member_unbanned',
      entityType: 'chat_room',
      entityId: roomId,
      newValue: { userId: targetUserId },
    });
    return { userId: targetUserId, banned: false };
  }

  /**
   * Hand the room to someone else. Both writes are one transaction: an
   * interruption between them would leave the room with two owners or none.
   */
  async transferOwnership(
    roomId: string,
    actorId: string,
    targetUserId: string,
  ) {
    const actorRole = await this.getRole(roomId, actorId);
    this.assertCanManage(actorRole, true);
    await this.getRole(roomId, targetUserId); // target must be a live member

    await this.dataSource.withTransaction(async (query) => {
      await query(
        `UPDATE chat_members SET role = 'admin'
          WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
        [roomId, actorId],
      );
      await query(
        `UPDATE chat_members SET role = 'owner'
          WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
        [roomId, targetUserId],
      );
      await query(`UPDATE chat_rooms SET created_by = $2 WHERE id = $1`, [
        roomId,
        targetUserId,
      ]);
    });
    // Logged after the transaction commits: the audit entry describes a change
    // that happened, and writing it inside would claim a transfer that a
    // rollback then undid.
    // Two roles changed in that transaction — the outgoing owner became an
    // admin and the target became owner.
    await this.memberService.invalidateRoomMember(
      roomId,
      actorId,
      targetUserId,
    );
    await this.audit.log({
      groupId: await this.groupOf(roomId),
      actorId,
      action: 'chat_room.ownership_transferred',
      entityType: 'chat_room',
      entityId: roomId,
      oldValue: { ownerId: actorId },
      newValue: { ownerId: targetUserId },
    });
    this.events.emit('chat.member_changed', {
      roomId,
      userId: targetUserId,
      action: 'ownership_transferred',
      role: 'owner',
    });
    return { ownerId: targetUserId };
  }
}
