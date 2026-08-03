import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { UserChatSettings } from '../../../database/entities/user-chat-settings.entity';
import { ChatRoomType, RoomScope } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { MembersService } from '../../workspaces/services/members.service';
import { CreateChatRoomDto } from '../dto/create-chat-room.dto';
import { CHAT_ROOM_COLUMNS_SQL, CHAT_ROOM_COLUMNS_SQL_R } from '../chat.sql';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../../common/utils/sql.util';

export interface ChatRoomDto {
  id: string;
  workspaceId: string | null;
  type: ChatRoomType;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  isArchived: boolean;
  isReadOnly: boolean;
  scope: RoomScope;
  inviteCode: string | null;
  isMember: boolean;
  groupId: string | null;
  projectId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  memberIds: string[];
  memberCount: number;
  backgroundUrl: string | null;
  backgroundType: string;
  publicId: number;
  slug: string | null;
  lastMessage: {
    id: string;
    content: string;
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
  ) {}

  private async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const rows = await this.dataSource.query<ChatRoom>(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    return rows[0] ?? null;
  }

  private async fetchLastMessage(lastMessageId: string) {
    const rows = await this.dataSource.query<any>(
      `SELECT m.id, m.content, m.content_json AS "contentJson", m.sender_id AS "senderId",
              m.created_at AS "createdAt",
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
      content: this.chatEncryption.safeDecrypt(
        msg.contentJson,
        msg.content ?? '',
      ),
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
    }>(
      `SELECT user_id AS "userId", last_read_seq AS "lastReadSeq"
       FROM chat_members WHERE room_id = $1 AND left_at IS NULL`,
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

    return {
      id: room.id,
      workspaceId: room.workspaceId,
      type: room.type,
      name: room.name ?? null,
      avatarUrl: room.avatarUrl ?? null,
      description: room.description ?? null,
      isArchived: room.isArchived,
      isReadOnly: room.isReadOnly,
      scope: room.scope,
      inviteCode: room.inviteCode ?? null,
      groupId: room.groupId ?? null,
      projectId: room.projectId ?? null,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberIds: members.map((m) => m.userId),
      memberCount: members.length,
      backgroundUrl: room.backgroundUrl ?? null,
      backgroundType: room.backgroundType ?? 'DEFAULT',
      publicId: room.publicId,
      slug: room.slug ?? null,
      lastMessage,
      unreadCount,
      isMember: true,
    };
  }

  async listRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    const myRooms = await this.dataSource.query<
      ChatRoom & { myLastReadSeq: number; myStatus: string }
    >(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}, cm.last_read_seq AS "myLastReadSeq", cm.status AS "myStatus"
       FROM chat_rooms r
       JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $2 AND cm.left_at IS NULL
       WHERE r.workspace_id = $1`,
      [workspaceId, userId],
    );

    if (myRooms.length === 0) return [];

    const roomIds = myRooms.map((r) => r.id);

    const allMembers = await this.dataSource.query<{
      roomId: string;
      userId: string;
    }>(
      `SELECT room_id AS "roomId", user_id AS "userId" FROM chat_members
       WHERE room_id = ANY($1::uuid[]) AND left_at IS NULL`,
      [roomIds],
    );

    const membersByRoom = new Map<string, string[]>();
    for (const m of allMembers) {
      if (!membersByRoom.has(m.roomId)) membersByRoom.set(m.roomId, []);
      membersByRoom.get(m.roomId)!.push(m.userId);
    }

    const lastMsgIds = myRooms.map((r) => r.lastMessageId).filter(Boolean);

    const lastMessages: any[] =
      lastMsgIds.length > 0
        ? await this.dataSource.query(
            `SELECT m.id, m.content, m.content_json AS "contentJson", m.sender_id AS "senderId",
                    m.created_at AS "createdAt",
                    u.first_name AS "senderFirstName", u.last_name AS "senderLastName"
             FROM chat_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.id = ANY($1::uuid[])`,
            [lastMsgIds],
          )
        : [];
    const lastMsgMap = new Map(lastMessages.map((m) => [m.id, m]));

    return myRooms.map((room) => {
      const roomMemberIds = membersByRoom.get(room.id) ?? [];
      const unreadCount = Math.max(0, room.messageSeq - room.myLastReadSeq);
      const lastMsg = room.lastMessageId
        ? lastMsgMap.get(room.lastMessageId)
        : null;

      return {
        id: room.id,
        workspaceId: room.workspaceId,
        type: room.type,
        name: room.name ?? null,
        avatarUrl: room.avatarUrl ?? null,
        description: room.description ?? null,
        isArchived: room.isArchived,
        isReadOnly: room.isReadOnly,
        scope: room.scope,
        inviteCode: room.inviteCode ?? null,
        groupId: room.groupId ?? null,
        projectId: room.projectId ?? null,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        memberIds: roomMemberIds,
        memberCount: roomMemberIds.length,
        backgroundUrl: room.backgroundUrl ?? null,
        backgroundType: room.backgroundType ?? 'DEFAULT',
        publicId: room.publicId,
        slug: room.slug ?? null,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              content: this.chatEncryption.safeDecrypt(
                lastMsg.contentJson,
                lastMsg.content ?? '',
              ),
              senderId: lastMsg.senderId,
              senderName: lastMsg.senderFirstName
                ? `${lastMsg.senderFirstName ?? ''} ${lastMsg.senderLastName ?? ''}`.trim()
                : null,
              createdAt: lastMsg.createdAt,
            }
          : null,
        unreadCount,
        isMember: true,
        memberStatus: (room as any).myStatus ?? 'active',
      };
    });
  }

  async listPublicRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    const memberRoomIds: string[] = (
      await this.dataSource.query(
        `SELECT room_id AS "roomId" FROM chat_members WHERE user_id = $1 AND left_at IS NULL`,
        [userId],
      )
    ).map((m: any) => m.roomId);

    const publicRooms = await this.dataSource.query<ChatRoom>(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms
       WHERE workspace_id = $1 AND scope = 'public' AND is_archived = false`,
      [workspaceId],
    );

    const nonMemberRooms = publicRooms.filter(
      (r) => !memberRoomIds.includes(r.id),
    );
    return nonMemberRooms.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
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

    const existingRows = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId],
    );
    if (existingRows[0])
      throw new BadRequestException({
        code: ErrorCode.ALREADY_ROOM_MEMBER,
        message: 'Already a member',
      });

    await this.dataSource.query(
      `INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2)`,
      [roomId, userId],
    );
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
      const rows: ChatRoom[] = normalizeReturning(
        await this.dataSource.query(
          `UPDATE chat_rooms SET ${setClause} WHERE id = $1 RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
          [roomId, ...values],
        ),
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

  async createRoom(
    workspaceId: string | null,
    userId: string,
    dto: CreateChatRoomDto,
  ) {
    const scope = dto.scope ?? RoomScope.WORKSPACE_ONLY;
    if (scope === RoomScope.WORKSPACE_ONLY && !workspaceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'workspace_only rooms require a workspace',
      });
    }
    if ((dto.groupId || dto.projectId) && !workspaceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Group/project rooms require a workspace',
      });
    }
    if (workspaceId) {
      await this.wsMembersService.assertMember(workspaceId, userId);
    }

    if (dto.type === ChatRoomType.DIRECT) {
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
      // Removed assertMember to allow cross-workspace DMs

      const existingRows = await this.dataSource.query<ChatRoom>(
        `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}
         FROM chat_rooms r
         JOIN chat_members cm1 ON cm1.room_id = r.id AND cm1.user_id = $2 AND cm1.left_at IS NULL
         JOIN chat_members cm2 ON cm2.room_id = r.id AND cm2.user_id = $3 AND cm2.left_at IS NULL
         WHERE r.workspace_id IS NOT DISTINCT FROM $1 AND r.type = $4`,
        [workspaceId, userId, dto.targetUserId, ChatRoomType.DIRECT],
      );
      if (existingRows[0]) return this.enrichRoom(existingRows[0], userId);
    }

    if (dto.groupId) {
      const g = await this.dataSource.query(
        `SELECT id FROM groups WHERE id = $1 AND workspace_id = $2`,
        [dto.groupId, workspaceId],
      );
      if (!g[0])
        throw new BadRequestException({
          code: ErrorCode.GROUP_NOT_FOUND,
          message: 'Group not in this workspace',
        });
    }
    if (dto.projectId) {
      const p = await this.dataSource.query(
        `SELECT id FROM projects WHERE id = $1 AND workspace_id = $2`,
        [dto.projectId, workspaceId],
      );
      if (!p[0])
        throw new BadRequestException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not in this workspace',
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

    const savedRows = await this.dataSource.query<ChatRoom>(
      `INSERT INTO chat_rooms (workspace_id, type, scope, name, group_id, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
      [
        workspaceId,
        derivedType,
        scope,
        dto.name ?? null,
        dto.groupId ?? null,
        dto.projectId ?? null,
        userId,
      ],
    );
    const saved = savedRows[0];

    const memberIds = new Set<string>([userId]);
    if (dto.type === ChatRoomType.DIRECT && dto.targetUserId) {
      memberIds.add(dto.targetUserId);
    }
    if (dto.type !== ChatRoomType.DIRECT && dto.memberIds?.length) {
      dto.memberIds
        .filter((id) => id !== userId)
        .forEach((id) => memberIds.add(id));
    }

    const values: string[] = [];
    const params: unknown[] = [];
    Array.from(memberIds).forEach((id, i) => {
      const status = id === userId ? 'active' : 'pending';
      values.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
      params.push(saved.id, id, status);
    });
    await this.dataSource.query(
      `INSERT INTO chat_members (room_id, user_id, status) VALUES ${values.join(', ')}`,
      params,
    );

    // Create notification for target user
    if (dto.type === ChatRoomType.DIRECT && dto.targetUserId) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          dto.targetUserId,
          userId,
          'chat_invite',
          'Sizni suhbatga taklif qilishdi',
          'Sizga yangi shaxsiy xabar keldi',
          'chat_room',
          saved.id,
        ],
      );
    }

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

  async deleteRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });

    if (room.type === ChatRoomType.DIRECT) {
      await this.chatMemberService.assertRoomMember(roomId, userId);
    } else if (room.createdById !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only creator can delete this room',
      });
    }

    await this.dataSource.query(`DELETE FROM chat_rooms WHERE id = $1`, [
      roomId,
    ]);
  }
}
