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
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Reads settings, creating the row on first access so every room behaves as
   * though it has always had one. `ON CONFLICT DO NOTHING` + a re-select keeps
   * two concurrent openers from racing into a unique violation.
   */
  async getRaw(roomId: string): Promise<ChannelSettings> {
    const read = async () =>
      (
        await this.dataSource.query<ChannelSettings>(
          `SELECT room_id AS "roomId", ${SELECT_SQL} FROM channel_settings WHERE room_id = $1`,
          [roomId],
        )
      )[0];

    const existing = await read();
    if (existing) return existing;

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
        `UPDATE chat_rooms SET scope = $2 WHERE id = $1 AND scope <> 'workspace_only'`,
        [roomId, patch.discoverable ? 'public' : 'private'],
      );
    }

    await this.dataSource.query(
      `INSERT INTO channel_settings_audit (room_id, user_id, changes) VALUES ($1, $2, $3)`,
      [roomId, userId, JSON.stringify(changes)],
    );

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

    const topPosts = await this.dataSource.query<{
      id: string;
      content: string | null;
      viewCount: number;
      createdAt: Date;
    }>(
      `SELECT id, content, view_count AS "viewCount", created_at AS "createdAt"
         FROM chat_messages
        WHERE room_id = $1 AND deleted_at IS NULL AND view_count > 0
        ORDER BY view_count DESC
        LIMIT 5`,
      [roomId],
    );

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

  /** The audit trail — admins only, since it names who changed what. */
  async listAudit(roomId: string, userId: string, limit = 50) {
    const role = await this.getRole(roomId, userId);
    this.assertCanManage(role);
    return this.dataSource.query<{
      id: string;
      userId: string | null;
      changes: Record<string, unknown>;
      createdAt: Date;
      firstName: string | null;
      lastName: string | null;
    }>(
      `SELECT a.id, a.user_id AS "userId", a.changes, a.created_at AS "createdAt",
              u.first_name AS "firstName", u.last_name AS "lastName"
         FROM channel_settings_audit a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.room_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2`,
      [roomId, Math.min(Math.max(limit, 1), 200)],
    );
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
        WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, targetUserId, role],
    );
    await this.dataSource.query(
      `INSERT INTO channel_settings_audit (room_id, user_id, changes) VALUES ($1, $2, $3)`,
      [
        roomId,
        actorId,
        JSON.stringify({
          memberRole: { userId: targetUserId, from: targetRole, to: role },
        }),
      ],
    );
    this.events.emit('chat.member_changed', {
      roomId,
      userId: targetUserId,
      action: 'role_changed',
      role,
    });
    return { userId: targetUserId, role };
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
          WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, actorId],
      );
      await query(
        `UPDATE chat_members SET role = 'owner'
          WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, targetUserId],
      );
      await query(`UPDATE chat_rooms SET created_by = $2 WHERE id = $1`, [
        roomId,
        targetUserId,
      ]);
      await query(
        `INSERT INTO channel_settings_audit (room_id, user_id, changes) VALUES ($1, $2, $3)`,
        [
          roomId,
          actorId,
          JSON.stringify({ ownership: { from: actorId, to: targetUserId } }),
        ],
      );
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
