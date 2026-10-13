import { isSuperAdmin } from '../../../common/super-admin';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../common/services/audit.service';

import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { UserChatSettings } from '../../../database/entities/user-chat-settings.entity';
import { ChatRoomType, RoomScope } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { E2eeEnvelope, isE2eeRoom } from '../e2ee/e2ee.util';
import { ChatMemberService } from './member.service';
import { MembersService } from '../../groups/services/members.service';
import { CreateChatRoomDto } from '../dto/create-chat-room.dto';
import { CHAT_ROOM_COLUMNS_SQL, CHAT_ROOM_COLUMNS_SQL_R } from '../chat.sql';
import { buildUpdateSet } from '../../../common/utils/sql.util';

/**
 * Canonical key for a pair of users, matching chat_rooms.dm_key exactly (see
 * migration 004). Order-independent, so both sides of a conversation compute
 * the same value and find the same room.
 */
export function directPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

/** Peer identity a DM/group row needs to render — title, avatar and /u route. */
export interface MemberProfile {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  nameEmoji: string | null;
  publicId: number;
  /** 'private' accounts don't show their username to others in the UI. */
  accountVisibility?: string;
}

export interface ChatRoomDto {
  id: string;
  type: ChatRoomType;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  isArchived: boolean;
  isReadOnly: boolean;
  scope: RoomScope;
  /** DMs and non-public rooms are end-to-end encrypted; public ones are encrypted at rest. */
  e2ee: boolean;
  inviteCode: string | null;
  isMember: boolean;
  groupId: string | null;
  projectId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  memberIds: string[];
  memberProfiles: MemberProfile[];
  memberStatus: 'pending' | 'active';
  /**
   * The caller's own role in this room. The client needs it to decide whether
   * to show a composer at all: an `admins_only` channel accepts posts from
   * owners and admins only, and a UI that can't see the role has to offer the
   * input to everyone and let the send fail.
   */
  myRole: 'member' | 'admin' | 'owner';
  /** Blocked by an Optima admin: read-only shell, nothing loads. */
  blocked?: boolean;
  isMuted: boolean;
  memberCount: number;
  backgroundUrl: string | null;
  backgroundType: string;
  publicId: number;
  slug: string | null;
  isSystem: boolean;
  membershipLocked: boolean;
  postingMode: 'members' | 'admins_only';
  linkedRoomId: string | null;
  lastMessage: {
    id: string;
    content: string | null;
    e2ee: E2eeEnvelope | null;
    /** First attachment's type, so a voice note or photo still has a preview. */
    attachmentMime?: string | null;
    senderId: string;
    senderName: string | null;
    createdAt: Date;
  } | null;
  unreadCount: number;
}

@Injectable()
export class ChatRoomService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly wsMembersService: MembersService,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatEncryption: ChatEncryptionService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  private async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const rows = await this.dataSource.query<ChatRoom>(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    return rows[0] ?? null;
  }

  /** Sidebar preview: plaintext for public rooms, the untouched envelope for E2EE ones. */
  private lastMessageBody(msg: {
    isE2ee?: boolean;
    content?: string | null;
    contentJson?: any;
  }): { content: string | null; e2ee: E2eeEnvelope | null } {
    if (msg.isE2ee) return { content: null, e2ee: msg.contentJson ?? null };
    return {
      content: this.chatEncryption.safeDecrypt(
        msg.contentJson,
        msg.content ?? '',
      ),
      e2ee: null,
    };
  }

  private async fetchLastMessage(lastMessageId: string) {
    const rows = await this.dataSource.query<any>(
      `SELECT m.id, m.content, m.content_json AS "contentJson", m.is_e2ee AS "isE2ee", m.sender_id AS "senderId",
              m.created_at AS "createdAt",
              (SELECT a.mime_type FROM message_attachments a WHERE a.message_id = m.id LIMIT 1) AS "attachmentMime",
              u.first_name AS "senderFirstName", u.last_name AS "senderLastName"
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1`,
      [lastMessageId],
    );
    const msg = rows[0];
    if (!msg) return null;
    return {
      id: msg.id,
      ...this.lastMessageBody(msg),
      attachmentMime: msg.attachmentMime ?? null,
      senderId: msg.senderId,
      senderName: msg.senderFirstName
        ? `${msg.senderFirstName ?? ''} ${msg.senderLastName ?? ''}`.trim()
        : null,
      createdAt: msg.createdAt,
    };
  }

  async enrichRoom(room: ChatRoom, userId: string): Promise<ChatRoomDto> {
    const members = await this.dataSource.query<{
      userId: string;
      lastReadSeq: number;
      status: string;
      role: string;
      isMuted: boolean;
      firstName: string;
      lastName: string;
      username: string | null;
      nickname: string | null;
      avatarUrl: string | null;
      nameEmoji: string | null;
      publicId: number;
    }>(
      `SELECT cm.user_id AS "userId", cm.last_read_seq AS "lastReadSeq", cm.status,
              cm.role, cm.is_muted AS "isMuted",
              u.first_name AS "firstName", u.last_name AS "lastName",
              u.username, u.nickname, u.avatar_url AS "avatarUrl", u.name_emoji AS "nameEmoji", u.public_id AS "publicId",
              u.account_visibility AS "accountVisibility"
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1 AND cm.left_at IS NULL`,
      [room.id],
    );

    const myMembership = members.find((m) => m.userId === userId);
    let unreadCount = 0;
    if (myMembership) {
      unreadCount = Math.max(0, room.messageSeq - myMembership.lastReadSeq);
    }

    const lastMessage = room.lastMessageId
      ? await this.fetchLastMessage(room.lastMessageId)
      : null;

    // Channel subscribers are private to its admins (the count stays public).
    const visibleMembers =
      room.type === 'channel' && !['owner', 'admin'].includes(myMembership?.role ?? '')
        ? []
        : members;
    return {
      id: room.id,
      type: room.type,
      name: room.name ?? null,
      avatarUrl: room.avatarUrl ?? null,
      description: room.description ?? null,
      isArchived: room.isArchived,
      isReadOnly: room.isReadOnly,
      scope: room.scope,
      e2ee: isE2eeRoom(room),
      inviteCode: room.inviteCode ?? null,
      groupId: room.groupId ?? null,
      projectId: room.projectId ?? null,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberIds: visibleMembers.map((m) => m.userId),
      memberProfiles: visibleMembers.map((m) => ({
        id: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        username: m.username ?? null,
        nickname: m.nickname ?? null,
        avatarUrl: m.avatarUrl ?? null,
        nameEmoji: m.nameEmoji ?? null,
        accountVisibility: (m as { accountVisibility?: string }).accountVisibility,
        publicId: m.publicId,
      })),
      memberStatus: (myMembership?.status as 'pending' | 'active') ?? 'active',
      myRole: isSuperAdmin(userId)
        ? 'owner'
        : (myMembership?.role as 'member' | 'admin' | 'owner' | undefined) ??
          'member',
      blocked: Boolean((room as { blockedAt?: Date | null }).blockedAt),
      isMuted: myMembership?.isMuted ?? false,
      memberCount: members.length,
      backgroundUrl: room.backgroundUrl ?? null,
      backgroundType: room.backgroundType ?? 'DEFAULT',
      publicId: room.publicId,
      slug: room.slug ?? null,
      isSystem: room.isSystem ?? false,
      membershipLocked: room.membershipLocked ?? false,
      postingMode: room.postingMode ?? 'members',
      linkedRoomId: room.linkedRoomId ?? null,
      lastMessage,
      unreadCount,
      isMember: true,
    };
  }

  /**
   * Every room the caller belongs to, group or not — the JWT is the only
   * authorisation needed, since membership in chat_members is itself the
   * permission. This is the primary listing; the group-scoped variant
   * below is a filtered view of the same data.
   */
  async listUserRooms(userId: string) {
    return this.queryRooms(userId, null);
  }

  async listRooms(groupId: string, userId: string) {
    await this.wsMembersService.assertMember(groupId, userId);
    return this.queryRooms(userId, groupId);
  }

  /**
   * @param groupId when set, restricts to that group's rooms — except
   *   direct/group/channel rooms, which are user-owned and carry no group,
   *   so filtering them out would hide the user's own conversations.
   */
  private async queryRooms(userId: string, groupId: string | null) {
    const myRooms = await this.dataSource.query<
      ChatRoom & {
        myLastReadSeq: number;
        myStatus: string;
        myRole: string;
        myIsMuted: boolean;
      }
    >(
      // $1 NULL = no group filter at all. When a group *is* given, the
      // user-owned kinds still come through: a DM, group or channel belongs to
      // its members, not to an organisation, so filtering them by group
      // hid conversations from whichever side didn't share the creator's one.
      `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}, cm.last_read_seq AS "myLastReadSeq", cm.status AS "myStatus",
              cm.role AS "myRole", cm.is_muted AS "myIsMuted"
       FROM chat_rooms r
       JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $2 AND cm.left_at IS NULL
       WHERE ($1::uuid IS NULL OR r.group_id = $1 OR r.type = ANY($3::chat_rooms_type_enum[]))`,
      [
        groupId,
        userId,
        [ChatRoomType.DIRECT, ChatRoomType.GROUP, ChatRoomType.CHANNEL],
      ],
    );

    if (myRooms.length === 0) return [];

    const roomIds = myRooms.map((r) => r.id);

    // The user profile is joined in here on purpose: a DM's title, avatar and
    // /u/<username> route all come from the peer, who is frequently *not* a
    // member of the caller's group, so the group member list can't
    // supply them.
    const allMembers = await this.dataSource.query<{
      roomId: string;
      userId: string;
      firstName: string;
      lastName: string;
      username: string | null;
      nickname: string | null;
      avatarUrl: string | null;
      nameEmoji: string | null;
      publicId: number;
    }>(
      `SELECT cm.room_id AS "roomId", cm.user_id AS "userId",
              u.first_name AS "firstName", u.last_name AS "lastName",
              u.username, u.nickname, u.avatar_url AS "avatarUrl", u.name_emoji AS "nameEmoji", u.public_id AS "publicId",
              u.account_visibility AS "accountVisibility"
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = ANY($1::uuid[]) AND cm.left_at IS NULL`,
      [roomIds],
    );

    const membersByRoom = new Map<string, string[]>();
    const profilesByRoom = new Map<string, MemberProfile[]>();
    for (const m of allMembers) {
      if (!membersByRoom.has(m.roomId)) {
        membersByRoom.set(m.roomId, []);
        profilesByRoom.set(m.roomId, []);
      }
      membersByRoom.get(m.roomId)!.push(m.userId);
      profilesByRoom.get(m.roomId)!.push({
        id: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        username: m.username ?? null,
        nickname: m.nickname ?? null,
        avatarUrl: m.avatarUrl ?? null,
        nameEmoji: m.nameEmoji ?? null,
        accountVisibility: (m as { accountVisibility?: string }).accountVisibility,
        publicId: m.publicId,
      });
    }

    const lastMsgIds = myRooms.map((r) => r.lastMessageId).filter(Boolean);

    const lastMessages: any[] =
      lastMsgIds.length > 0
        ? await this.dataSource.query(
            `SELECT m.id, m.content, m.content_json AS "contentJson", m.is_e2ee AS "isE2ee", m.sender_id AS "senderId",
                    m.created_at AS "createdAt",
                    (SELECT a.mime_type FROM message_attachments a WHERE a.message_id = m.id LIMIT 1) AS "attachmentMime",
                    u.first_name AS "senderFirstName", u.last_name AS "senderLastName"
             FROM chat_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.id = ANY($1::uuid[])`,
            [lastMsgIds],
          )
        : [];
    const lastMsgMap = new Map(lastMessages.map((m) => [m.id, m]));

    const hideSubscribers = (room: { type: string; myRole?: string | null }) =>
      room.type === 'channel' && !['owner', 'admin'].includes(room.myRole ?? '');
    return myRooms.map((room) => {
      const roomMemberIds = membersByRoom.get(room.id) ?? [];
      const unreadCount = Math.max(0, room.messageSeq - room.myLastReadSeq);
      const lastMsg = room.lastMessageId
        ? lastMsgMap.get(room.lastMessageId)
        : null;

      return {
        id: room.id,
        type: room.type,
        name: room.name ?? null,
        avatarUrl: room.avatarUrl ?? null,
        description: room.description ?? null,
        isArchived: room.isArchived,
        isReadOnly: room.isReadOnly,
        scope: room.scope,
        e2ee: isE2eeRoom(room),
        inviteCode: room.inviteCode ?? null,
        groupId: room.groupId ?? null,
        projectId: room.projectId ?? null,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        // Channel subscribers are private to its admins (count stays public).
        memberIds: hideSubscribers(room) ? [] : roomMemberIds,
        memberProfiles: hideSubscribers(room) ? [] : profilesByRoom.get(room.id) ?? [],
        memberStatus: (room.myStatus as 'pending' | 'active') ?? 'active',
        myRole: isSuperAdmin(userId)
          ? 'owner'
          : (room.myRole as 'member' | 'admin' | 'owner' | undefined) ?? 'member',
        blocked: Boolean((room as { blockedAt?: Date | null }).blockedAt),
        isMuted: room.myIsMuted ?? false,
        memberCount: roomMemberIds.length,
        backgroundUrl: room.backgroundUrl ?? null,
        backgroundType: room.backgroundType ?? 'DEFAULT',
        publicId: room.publicId,
        slug: room.slug ?? null,
        isSystem: room.isSystem ?? false,
        membershipLocked: room.membershipLocked ?? false,
        postingMode: room.postingMode ?? 'members',
        linkedRoomId: room.linkedRoomId ?? null,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              ...this.lastMessageBody(lastMsg),
              attachmentMime: lastMsg.attachmentMime ?? null,
              senderId: lastMsg.senderId,
              senderName: lastMsg.senderFirstName
                ? `${lastMsg.senderFirstName ?? ''} ${lastMsg.senderLastName ?? ''}`.trim()
                : null,
              createdAt: lastMsg.createdAt,
            }
          : null,
        unreadCount,
        isMember: true,
      };
    });
  }

  /**
   * Global discovery for the sidebar search box: public channels and groups
   * the caller has *not* joined yet.
   *
   * `listPublicRooms` below only ever looked inside one group, so a
   * channel opened from chat — which carries no group at all — could not
   * be found by anyone who wasn't already a member. Visibility here is
   * `scope = 'public'` plus one of:
   *   - no group: user-owned channels/groups, public to the whole platform;
   *   - a group the caller belongs to: keeps a group's internal rooms
   *     from leaking to outsiders, which is what "public" means inside one.
   *
   * An all-numeric query also matches `public_id` exactly, so the 6-digit id
   * from a /ch or /g link resolves here as well as by name.
   */
  async discoverRooms(userId: string, rawQuery: string, limit = 20) {
    const q = rawQuery.trim();
    if (q.length < 2) return [];

    // Same escaping as users.searchPublic: without it a query of `%` matches
    // every public room in the table.
    const term = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const exactPublicId = /^\d+$/.test(q) ? Number(q) : null;
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    return this.dataSource.query<{
      id: string;
      type: ChatRoomType;
      name: string | null;
      description: string | null;
      avatarUrl: string | null;
      slug: string | null;
      publicId: number;
      memberCount: number;
    }>(
      `SELECT r.id, r.type, r.name, r.description, r.avatar_url AS "avatarUrl",
              r.slug, r.public_id AS "publicId",
              (SELECT count(*)::int FROM chat_members cm2
                WHERE cm2.room_id = r.id AND cm2.left_at IS NULL) AS "memberCount"
       FROM chat_rooms r
       WHERE r.scope = 'public'
         AND r.is_archived = false
         AND r.type = ANY($1::chat_rooms_type_enum[])
         AND (
           r.group_id IS NULL
           OR r.group_id IN (
             SELECT group_id FROM group_members WHERE user_id = $2
           )
         )
         AND (
           r.name ILIKE $3 ESCAPE '\\'
           OR r.description ILIKE $3 ESCAPE '\\'
           OR r.slug ILIKE $3 ESCAPE '\\'
           OR ($4::int IS NOT NULL AND r.public_id = $4)
         )
         AND NOT EXISTS (
           SELECT 1 FROM chat_members cm
           WHERE cm.room_id = r.id AND cm.user_id = $2 AND cm.left_at IS NULL
         )
       ORDER BY "memberCount" DESC, r.name ASC
       LIMIT $5`,
      [
        [ChatRoomType.CHANNEL, ChatRoomType.GROUP],
        userId,
        term,
        exactPublicId,
        safeLimit,
      ],
    );
  }

  async listPublicRooms(groupId: string, userId: string) {
    await this.wsMembersService.assertMember(groupId, userId);

    const memberRoomIds: string[] = (
      await this.dataSource.query(
        `SELECT room_id AS "roomId" FROM chat_members WHERE user_id = $1 AND left_at IS NULL`,
        [userId],
      )
    ).map((m: any) => m.roomId);

    const publicRooms = await this.dataSource.query<ChatRoom>(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms
       WHERE group_id = $1 AND scope = 'public' AND is_archived = false`,
      [groupId],
    );

    const nonMemberRooms = publicRooms.filter(
      (r) => !memberRoomIds.includes(r.id),
    );
    return nonMemberRooms.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name ?? null,
      avatarUrl: r.avatarUrl ?? null,
      description: r.description ?? null,
      scope: RoomScope.PUBLIC,
      isArchived: false,
      isReadOnly: r.isReadOnly,
      groupId: r.groupId ?? null,
      projectId: r.projectId ?? null,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      memberIds: [],
      memberCount: 0,
      publicId: r.publicId,
      slug: r.slug ?? null,
      lastMessage: null,
      unreadCount: 0,
      isMember: false,
    }));
  }

  /**
   * A ban has to be checked by everything that lets someone *in*, not only by
   * the send path — otherwise being banned from a public room means waiting
   * for the join button, and being banned from a private one means waiting
   * for anybody to paste an invite link.
   *
   * The row survives the removal (banMember only closes `left_at`), so this
   * reads it whether or not they are currently a member.
   */
  async assertNotBanned(roomId: string, userId: string): Promise<void> {
    const rows = await this.dataSource.query<{ bannedUntil: Date | null }>(
      `SELECT banned_until AS "bannedUntil" FROM chat_members
        WHERE room_id = $1 AND user_id = $2
          AND is_banned = true
          AND (banned_until IS NULL OR banned_until > now())`,
      [roomId, userId],
    );
    if (!rows[0]) return;
    throw new ForbiddenException({
      code: 'CHAT_MEMBER_BANNED',
      message: rows[0].bannedUntil
        ? `You are banned from this room until ${new Date(rows[0].bannedUntil).toISOString()}`
        : 'You are banned from this room',
    });
  }

  async joinPublicRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    if (room.scope !== RoomScope.PUBLIC)
      throw new ForbiddenException({
        code: ErrorCode.ROOM_NOT_PUBLIC,
        message: 'Room is not public',
      });
    if ((room as { blockedAt?: Date | null }).blockedAt)
      throw new ForbiddenException({ code: 'ROOM_BLOCKED', message: 'This chat has been blocked by Optima' });

    // "Public" inside a group means public *to that group* — which is
    // exactly how discoverRooms and listPublicRooms present it. This endpoint
    // took only a roomId and skipped the check, so the one door that actually
    // admits people was the one that didn't ask. Group-less channels and
    // groups are public to the whole platform and stay that way.
    if (room.groupId) {
      await this.wsMembersService.assertMember(room.groupId, userId);
    }

    await this.assertNotBanned(roomId, userId);

    const existingRows = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId],
    );
    if (existingRows[0])
      throw new BadRequestException({
        code: ErrorCode.ALREADY_ROOM_MEMBER,
        message: 'Already a member',
      });

    // Joining a public room needs no approval, so the membership is 'active'
    // outright — leaving it to the column default meant a joiner could land in
    // 'pending' and see nothing. `ON CONFLICT` covers both re-joining after a
    // leave (the row still exists with left_at set) and two clicks racing.
    await this.dataSource.query(
      `INSERT INTO chat_members (room_id, user_id, status, role)
       VALUES ($1, $2, 'active', 'member')
       ON CONFLICT (room_id, user_id)
       DO UPDATE SET left_at = NULL, status = 'active', joined_at = now()`,
      [roomId, userId],
    );
    // Awaited, not left to the event below: the emit is fire-and-forget, and
    // an authorization cache must be correct by the time this call returns.
    await this.chatMemberService.invalidateRoomMember(roomId, userId);
    this.events.emit('chat.member_changed', {
      roomId,
      userId,
      action: 'joined',
    });
    return this.enrichRoom(room, userId);
  }

  async updateRoomSettings(
    roomId: string,
    userId: string,
    dto: {
      scope?: RoomScope;
      name?: string;
      description?: string;
      avatarUrl?: string | null;
      backgroundUrl?: string | null;
      backgroundType?: 'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN';
      slug?: string | null;
    },
  ) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    const member = await this.chatMemberService.assertRoomMember(
      roomId,
      userId,
    );
    const isBackgroundOnlyChange =
      dto.backgroundUrl !== undefined || dto.backgroundType !== undefined;
    const isPrivileged =
      room.createdById === userId ||
      member.role === 'owner' ||
      member.role === 'admin';
    if (!isPrivileged)
      throw new ForbiddenException({
        code: ErrorCode.ROOM_INVITE_FORBIDDEN,
        message: isBackgroundOnlyChange
          ? 'Only the room owner/admin can change the background'
          : 'Only the creator can update room settings',
      });
    if (dto.slug !== undefined && dto.slug !== null) {
      const slug = dto.slug.trim().toLowerCase();
      if (!/^[a-z0-9-]{3,60}$/.test(slug))
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Slug must be 3-60 lowercase letters, digits or hyphens',
        });
      const clash = await this.dataSource.query(
        `SELECT id FROM chat_rooms WHERE lower(slug) = $1 AND id != $2`,
        [slug, roomId],
      );
      if (clash[0])
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'This slug is already taken',
        });
      dto.slug = slug;
      if (room.slug && room.slug !== slug) {
        await this.dataSource.query(
          `INSERT INTO chat_room_slug_history (room_id, old_slug) VALUES ($1, $2)`,
          [roomId, room.slug],
        );
      }
    }
    if (
      dto.backgroundType &&
      !['DEFAULT', 'IMAGE', 'COLOR', 'GRADIENT', 'PATTERN'].includes(
        dto.backgroundType,
      )
    )
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid backgroundType',
      });

    // This body has no DTO class, so the global ValidationPipe never inspects
    // it — an unrecognised scope would otherwise reach the enum column and come
    // back as an opaque 500.
    if (
      dto.scope !== undefined &&
      !Object.values(RoomScope).includes(dto.scope)
    )
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `scope must be one of: ${Object.values(RoomScope).join(', ')}`,
      });
    if (dto.scope === RoomScope.GROUP_ONLY && !room.groupId)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This room has no group, so it cannot be group-only',
      });
    if (
      dto.name !== undefined &&
      (dto.name.trim().length < 1 || dto.name.trim().length > 200)
    )
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Room name must be 1-200 characters',
      });
    if (dto.description !== undefined && dto.description.length > 1000)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Description must not exceed 1000 characters',
      });
    if (dto.avatarUrl !== undefined && dto.avatarUrl !== null) {
      try {
        const avatar = new URL(dto.avatarUrl);
        if (avatar.protocol !== 'https:') throw new Error();
      } catch {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Avatar URL must be a valid HTTPS URL',
        });
      }
    }
    const allowedUpdates = {
      scope: dto.scope,
      name: dto.name?.trim(),
      description: dto.description?.trim(),
      avatarUrl: dto.avatarUrl,
      backgroundUrl: dto.backgroundUrl,
      backgroundType: dto.backgroundType,
      slug: dto.slug,
    };
    const { setClause, values } = buildUpdateSet(allowedUpdates, 2);
    let updated = room;
    if (setClause) {
      const rows: ChatRoom[] = await this.dataSource.query(
        `UPDATE chat_rooms SET ${setClause} WHERE id = $1 RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
        [roomId, ...values],
      );
      updated = rows[0];
    }
    return this.enrichRoom(updated, userId);
  }

  /**
   * Resolves a group/channel route identifier (slug, falling back to the
   * 6-digit public_id) to its internal room — the only place `/g/:x` and
   * `/ch/:x` should ever be turned into a UUID. Also checks
   * chat_room_slug_history so a stale link after an admin rename still lands
   * somewhere (as a redirect) instead of 404ing.
   */
  async resolveRoomIdentifier(
    identifier: string,
    userId: string,
  ): Promise<
    | { roomId: string; type: string; slug: string | null; publicId: number }
    | { redirectSlug: string }
  > {
    const isNumeric = /^\d+$/.test(identifier);
    const rows = await this.dataSource.query<ChatRoom>(
      isNumeric
        ? `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE public_id = $1`
        : `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE lower(slug) = lower($1)`,
      [isNumeric ? Number(identifier) : identifier],
    );
    const room = rows[0];

    if (!room && !isNumeric) {
      const history = await this.dataSource.query(
        `SELECT room_id AS "roomId" FROM chat_room_slug_history
         WHERE lower(old_slug) = lower($1) ORDER BY created_at DESC LIMIT 1`,
        [identifier],
      );
      if (history[0]) {
        const current = await this.findRoomById(history[0].roomId);
        if (current?.slug) return { redirectSlug: current.slug };
      }
    }

    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });

    const membership = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [room.id, userId],
    );
    if (!membership[0] && room.scope !== RoomScope.PUBLIC) {
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    }

    return {
      roomId: room.id,
      type: room.type,
      slug: room.slug ?? null,
      publicId: room.publicId,
    };
  }

  /**
   * Per-user wallpaper/theme/font-size/compact-mode/animation override for a room.
   * Takes priority over the room's `backgroundUrl` — see SYSTEM_DESIGN.md §14.10.
   */
  async getUserChatSettings(
    roomId: string,
    userId: string,
  ): Promise<UserChatSettings | null> {
    const rows = await this.dataSource.query<UserChatSettings>(
      `SELECT id, user_id AS "userId", room_id AS "roomId",
              background_url AS "backgroundUrl", background_type AS "backgroundType", theme,
              font_size AS "fontSize", compact_mode AS "compactMode",
              animation_enabled AS "animationEnabled",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM user_chat_settings WHERE user_id = $1 AND room_id = $2`,
      [userId, roomId],
    );
    return rows[0] ?? null;
  }

  async upsertUserChatSettings(
    roomId: string,
    userId: string,
    dto: {
      backgroundUrl?: string | null;
      backgroundType?:
        'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN' | null;
      theme?: string | null;
      fontSize?: number | null;
      compactMode?: boolean;
      animationEnabled?: boolean;
    },
  ): Promise<UserChatSettings> {
    await this.chatMemberService.assertRoomMember(roomId, userId);
    const existing = await this.getUserChatSettings(roomId, userId);
    const merged = {
      backgroundUrl:
        dto.backgroundUrl !== undefined
          ? dto.backgroundUrl
          : (existing?.backgroundUrl ?? null),
      backgroundType:
        dto.backgroundType !== undefined
          ? dto.backgroundType
          : (existing?.backgroundType ?? null),
      theme: dto.theme !== undefined ? dto.theme : (existing?.theme ?? null),
      fontSize:
        dto.fontSize !== undefined
          ? dto.fontSize
          : (existing?.fontSize ?? null),
      compactMode:
        dto.compactMode !== undefined
          ? dto.compactMode
          : (existing?.compactMode ?? false),
      animationEnabled:
        dto.animationEnabled !== undefined
          ? dto.animationEnabled
          : (existing?.animationEnabled ?? true),
    };
    const rows = await this.dataSource.query<UserChatSettings>(
      `INSERT INTO user_chat_settings
         (user_id, room_id, background_url, background_type, theme, font_size, compact_mode, animation_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, room_id) DO UPDATE SET
         background_url = $3, background_type = $4, theme = $5, font_size = $6,
         compact_mode = $7, animation_enabled = $8, updated_at = now()
       RETURNING id, user_id AS "userId", room_id AS "roomId",
                 background_url AS "backgroundUrl", background_type AS "backgroundType", theme,
                 font_size AS "fontSize", compact_mode AS "compactMode",
                 animation_enabled AS "animationEnabled",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        userId,
        roomId,
        merged.backgroundUrl,
        merged.backgroundType,
        merged.theme,
        merged.fontSize,
        merged.compactMode,
        merged.animationEnabled,
      ],
    );
    return rows[0];
  }

  /**
   * Creates a direct/group/channel room.
   *
   * Group is optional by design: a user opens a group or channel straight
   * from chat, authorised by their JWT alone (see the group-less
   * `POST /chat/rooms` route). `groupId` is only an association for rooms
   * that genuinely belong to one, and is verified when present. DMs never
   * carry a group at all — a conversation belongs to the two people in it,
   * not to an organisation, and scoping them by group is what previously
   * hid a DM from whichever side didn't share the creator's group.
   *
   * The whole write runs in one transaction: room, members and notification
   * land together or not at all. Without it a failure between the inserts left
   * a memberless room stranded in chat_rooms.
   */
  async createRoom(
    groupId: string | null,
    userId: string,
    dto: CreateChatRoomDto,
  ) {
    const isDirect = dto.type === ChatRoomType.DIRECT;
    // A DM is never group-scoped; the unique dm_key spans the whole table.
    const effectiveGroupId = isDirect ? null : groupId;
    const scope =
      dto.scope ??
      (effectiveGroupId ? RoomScope.GROUP_ONLY : RoomScope.PRIVATE);

    if (scope === RoomScope.GROUP_ONLY && !effectiveGroupId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'group_only rooms require a group',
      });
    }
    if ((dto.groupId || dto.projectId) && !effectiveGroupId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Group/project rooms require a group',
      });
    }
    if (effectiveGroupId) {
      await this.wsMembersService.assertMember(effectiveGroupId, userId);
    }
    if (
      !isDirect &&
      dto.type !== ChatRoomType.GROUP &&
      dto.type !== ChatRoomType.CHANNEL &&
      !dto.groupId &&
      !dto.projectId
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Only direct, group and channel rooms can be created',
      });
    }
    if (!isDirect && !dto.name?.trim()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A name is required for group and channel rooms',
      });
    }

    if (isDirect) {
      let directTargetUserId = dto.targetUserId;
      if (!directTargetUserId && dto.targetPublicId) {
        const targetRows = await this.dataSource.query(
          `SELECT id FROM users WHERE public_id = $1 AND deleted_at IS NULL`,
          [dto.targetPublicId],
        );
        directTargetUserId = targetRows[0]?.id;
      }
      if (!directTargetUserId)
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A valid direct message recipient is required',
        });
      dto.targetUserId = directTargetUserId;
      if (dto.targetUserId === userId)
        throw new BadRequestException({
          code: ErrorCode.DM_WITH_SELF,
          message: 'Cannot create a DM with yourself',
        });
      // Removed assertMember to allow cross-group DMs

      // A DM is unique per *pair of people*, never per group. Looked up by
      // the same canonical dm_key the unique index is built on, so this check
      // and the constraint can never disagree.
      const existingRows = await this.dataSource.query<ChatRoom>(
        `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE dm_key = $1`,
        [directPairKey(userId, dto.targetUserId)],
      );
      if (existingRows[0]) {
        // Re-opening a conversation the caller had deleted for themselves
        // (see deleteDirectRoomForMe) reinstates their membership — the room
        // still exists, so without this they'd be handed back a DM they are
        // no longer a member of and locked out of their own chat.
        await this.dataSource.query(
          `INSERT INTO chat_members (room_id, user_id, status, role)
           VALUES ($1, $2, 'active', 'member')
           ON CONFLICT (room_id, user_id)
           DO UPDATE SET left_at = NULL, status = 'active'
           WHERE chat_members.left_at IS NOT NULL`,
          [existingRows[0].id, userId],
        );
        await this.chatMemberService.invalidateRoomMember(
          existingRows[0].id,
          userId,
        );
        return this.enrichRoom(existingRows[0], userId);
      }
    }

    if (dto.projectId) {
      const p = await this.dataSource.query(
        `SELECT id FROM projects WHERE id = $1 AND group_id = $2`,
        [dto.projectId, effectiveGroupId],
      );
      if (!p[0])
        throw new BadRequestException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not in this group',
        });
    }

    // Derive type from the scoping fields where it's unambiguous, rather than
    // trusting dto.type outright — group_id/project_id/targetUserId are the
    // real source of truth, so a client sending a mismatched type can't drift
    // the stored value away from what the room actually is.
    const derivedType = dto.targetUserId
      ? ChatRoomType.DIRECT
      : dto.groupId
        ? ChatRoomType.GROUP
        : dto.projectId
          ? ChatRoomType.PROJECT
          : dto.type;

    const memberIds = new Set<string>([userId]);
    if (isDirect && dto.targetUserId) memberIds.add(dto.targetUserId);
    if (!isDirect && dto.memberIds?.length) {
      dto.memberIds
        .filter((id) => id !== userId)
        .forEach((id) => memberIds.add(id));
    }

    // A channel's creator owns it; groups follow the same rule so the room
    // always has someone who can rename or delete it.
    const ownerRole = 'owner';

    let saved: ChatRoom;
    try {
      saved = await this.dataSource.withTransaction(async (query) => {
        const savedRows = await query<ChatRoom>(
          `INSERT INTO chat_rooms (group_id, type, scope, name, description, project_id, created_by, posting_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
          [
            effectiveGroupId,
            derivedType,
            scope,
            dto.name?.trim() ?? null,
            dto.description?.trim() ?? null,
            dto.projectId ?? null,
            userId,
            // Channels broadcast: only admins post unless explicitly opened up.
            derivedType === ChatRoomType.CHANNEL ? 'admins_only' : 'members',
          ],
        );
        const room = savedRows[0];

        const values: string[] = [];
        const params: unknown[] = [];
        Array.from(memberIds).forEach((id, i) => {
          // DMs open immediately for both sides (Telegram-style) — only group
          // and channel invitees have to accept before the room is readable.
          const status = id === userId || isDirect ? 'active' : 'pending';
          const role = id === userId ? ownerRole : 'member';
          values.push(
            `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
          );
          params.push(room.id, id, status, role);
        });
        await query(
          `INSERT INTO chat_members (room_id, user_id, status, role) VALUES ${values.join(', ')}`,
          params,
        );

        // Everyone who didn't create the room hears about it.
        const invitees = Array.from(memberIds).filter((id) => id !== userId);
        if (invitees.length) {
          const notification = isDirect
            ? {
                title: 'Sizga yangi shaxsiy xabar keldi',
                message: 'Yangi suhbat ochildi',
              }
            : {
                title: 'Sizni suhbatga taklif qilishdi',
                message: `"${dto.name?.trim() ?? ''}" ga qo'shildingiz`,
              };
          await query(
            `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
             SELECT unnest($1::uuid[]), $2, 'chat_invite', $3, $4, 'chat_room', $5`,
            [
              invitees,
              userId,
              notification.title,
              notification.message,
              room.id,
            ],
          );
        }

        return room;
      });
    } catch (err) {
      // Two clients can still race between the dm_key lookup above and this
      // insert; the unique index settles it, and the loser simply adopts the
      // room the winner created rather than surfacing a 500.
      if (isDirect && isUniqueViolation(err)) {
        const rows = await this.dataSource.query<ChatRoom>(
          `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE dm_key = $1`,
          [directPairKey(userId, dto.targetUserId!)],
        );
        if (rows[0]) return this.enrichRoom(rows[0], userId);
      }
      throw err;
    }

    // Everyone else in the room learns about it now rather than on their next
    // reload — the notification row alone never reached the open client, which
    // is why a new DM only showed up for the person who started it.
    this.events.emit('chat.room_created', {
      roomId: saved.id,
      memberIds: Array.from(memberIds).filter((id) => id !== userId),
      createdBy: userId,
    });
    return this.enrichRoom(saved, userId);
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    await this.chatMemberService.assertRoomMember(roomId, userId);
    return this.enrichRoom(room, userId);
  }

  /**
   * Leaves a group/channel without deleting it for anyone else — the
   * counterpart to deleteRoom, which is what a DM offers instead. System rooms
   * (#general and the OTIMA community pair) are membership-locked and can't be
   * left, and a DM has no "leave" at all: there'd be nothing left to rejoin.
   */
  async leaveRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    if (room.type === ChatRoomType.DIRECT)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Direct conversations are deleted, not left',
      });

    const flagRows = await this.dataSource.query<{
      isSystem: boolean;
      membershipLocked: boolean;
    }>(
      `SELECT is_system AS "isSystem", membership_locked AS "membershipLocked"
       FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    if (flagRows[0]?.isSystem || flagRows[0]?.membershipLocked)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'You cannot leave this room',
      });

    const rows = await this.dataSource.query(
      `UPDATE chat_members SET left_at = now()
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL
       RETURNING id`,
      [roomId, userId],
    );
    await this.chatMemberService.invalidateRoomMember(roomId, userId);
    if (!rows[0])
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    this.events.emit('chat.member_changed', {
      roomId,
      userId,
      action: 'left',
    });
    return { left: true };
  }

  async deleteRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });

    if (room.type === ChatRoomType.DIRECT) {
      return this.deleteDirectRoomForMe(room, userId);
    }

    if (room.createdById !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only creator can delete this room',
      });
    }

    await this.dataSource.query(`DELETE FROM chat_rooms WHERE id = $1`, [
      roomId,
    ]);

    // Destructive and irreversible — the row cascades every message with it,
    // so the audit entry is the only record that the room ever existed.
    await this.audit.log({
      groupId: room.groupId,
      actorId: userId,
      action: 'chat_room.deleted',
      entityType: 'chat_room',
      entityId: roomId,
      oldValue: { name: room.name, type: room.type, slug: room.slug },
    });
  }

  /**
   * "Delete chat" on a DM removes it for the person who asked, not for both.
   *
   * It used to run the same `DELETE FROM chat_rooms` as a group, which
   * cascades every message in the conversation — so either side could
   * unilaterally and irreversibly destroy the other's copy of a history they
   * both took part in, with no warning and nothing to restore from. Closing
   * the caller's own membership gives them the same result they were after
   * (the conversation is gone from their list, and assertRoomMember now
   * refuses them the history) while leaving the other side's intact.
   *
   * The row itself is only physically removed once nobody is left on either
   * side, which is what keeps deleted DMs from accumulating forever.
   */
  private async deleteDirectRoomForMe(room: ChatRoom, userId: string) {
    await this.chatMemberService.assertRoomMember(room.id, userId);

    await this.dataSource.query(
      `UPDATE chat_members SET left_at = now()
        WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [room.id, userId],
    );
    await this.chatMemberService.invalidateRoomMember(room.id, userId);

    const remaining = await this.dataSource.query<{ count: string }>(
      `SELECT count(*) FROM chat_members WHERE room_id = $1 AND left_at IS NULL`,
      [room.id],
    );
    if (Number(remaining[0]?.count ?? 0) > 0) return;

    await this.dataSource.query(`DELETE FROM chat_rooms WHERE id = $1`, [
      room.id,
    ]);
    await this.audit.log({
      groupId: room.groupId,
      actorId: userId,
      action: 'chat_room.deleted',
      entityType: 'chat_room',
      entityId: room.id,
      oldValue: { name: room.name, type: room.type, slug: room.slug },
    });
  }
}
