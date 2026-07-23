import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatRoomType, ChatVisibility } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { MembersService } from '../../workspaces/members.service';
import { CreateChatRoomDto } from '../dto/create-chat-room.dto';
import { CHAT_ROOM_COLUMNS_SQL, CHAT_ROOM_COLUMNS_SQL_R } from '../chat.sql';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../../common/utils/sql.util';

export interface ChatRoomDto {
  id: string;
  workspaceId: string;
  type: ChatRoomType;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  isArchived: boolean;
  isReadOnly: boolean;
  visibility: ChatVisibility;
  inviteCode: string | null;
  isMember: boolean;
  groupId: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  memberIds: string[];
  memberCount: number;
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
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly wsMembersService: MembersService,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatEncryption: ChatEncryptionService,
  ) {}

  private async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const rows: ChatRoom[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    return rows[0] ?? null;
  }

  private async fetchLastMessage(lastMessageId: string) {
    const rows: any[] = await this.dataSource.query(
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
    const members: Array<{ userId: string; lastReadSeq: number }> =
      await this.dataSource.query(
        `SELECT user_id AS "userId", last_read_seq AS "lastReadSeq"
       FROM chat_members WHERE room_id = $1 AND left_at IS NULL`,
        [room.id],
      );

    const myMembership = members.find((m) => m.userId === userId);
    let unreadCount = 0;
    if (myMembership) {
      const unreadRows = await this.dataSource.query(
        `SELECT count(*)::int AS count FROM chat_messages
         WHERE room_id = $1 AND sequence > $2 AND sender_id <> $3`,
        [room.id, myMembership.lastReadSeq, userId],
      );
      unreadCount = Number(unreadRows[0]?.count || 0);
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
      visibility: room.visibility,
      inviteCode: room.inviteCode ?? null,
      groupId: room.groupId ?? null,
      projectId: room.projectId ?? null,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberIds: members.map((m) => m.userId),
      memberCount: members.length,
      lastMessage,
      unreadCount,
      isMember: true,
    };
  }

  async listRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    const myRooms: Array<
      ChatRoom & { myLastReadSeq: number; myStatus: string }
    > = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}, cm.last_read_seq AS "myLastReadSeq", cm.status AS "myStatus",
              (SELECT count(*)::int FROM chat_messages unread
               WHERE unread.room_id = r.id AND unread.sequence > cm.last_read_seq
                 AND unread.sender_id <> $2) AS "unreadCount"
       FROM chat_rooms r
       JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $2 AND cm.left_at IS NULL
       WHERE r.workspace_id = $1`,
      [workspaceId, userId],
    );

    if (myRooms.length === 0) return [];

    const roomIds = myRooms.map((r) => r.id);

    const allMembers: Array<{ roomId: string; userId: string }> =
      await this.dataSource.query(
        `SELECT room_id AS "roomId", user_id AS "userId" FROM chat_members
       WHERE room_id = ANY($1::uuid[]) AND left_at IS NULL`,
        [roomIds],
      );

    const membersByRoom = new Map<string, string[]>();
    for (const m of allMembers) {
      if (!membersByRoom.has(m.roomId)) membersByRoom.set(m.roomId, []);
      membersByRoom.get(m.roomId)!.push(m.userId);
    }

    const lastMsgIds = myRooms
      .map((r) => r.lastMessageId)
      .filter(Boolean) as string[];

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
      const unreadCount = Math.max(0, Number((room as any).unreadCount || 0));
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
        visibility: room.visibility,
        inviteCode: room.inviteCode ?? null,
        groupId: room.groupId ?? null,
        projectId: room.projectId ?? null,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        memberIds: roomMemberIds,
        memberCount: roomMemberIds.length,
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

    const publicRooms: ChatRoom[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms
       WHERE workspace_id = $1 AND visibility = 'public' AND is_archived = false`,
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
      visibility: ChatVisibility.PUBLIC,
      isArchived: false,
      isReadOnly: r.isReadOnly,
      groupId: r.groupId ?? null,
      projectId: r.projectId ?? null,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      memberIds: [],
      memberCount: 0,
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
    if (room.visibility !== ChatVisibility.PUBLIC)
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
    dto: { visibility?: ChatVisibility; name?: string; description?: string },
  ) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    await this.chatMemberService.assertRoomMember(roomId, userId);
    if (room.createdById !== userId)
      throw new ForbiddenException({
        code: ErrorCode.ROOM_INVITE_FORBIDDEN,
        message: 'Only the creator can update room settings',
      });

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
    );
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

  async createRoom(
    workspaceId: string,
    userId: string,
    dto: CreateChatRoomDto,
  ) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    let directTargetUserId = dto.targetUserId;
    if (dto.type === ChatRoomType.DIRECT) {
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
      if (directTargetUserId === userId)
        throw new BadRequestException({
          code: ErrorCode.DM_WITH_SELF,
          message: 'Cannot create a DM with yourself',
        });
      // Removed assertMember to allow cross-workspace DMs

      const existingRows: ChatRoom[] = await this.dataSource.query(
        `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}
         FROM chat_rooms r
         JOIN chat_members cm1 ON cm1.room_id = r.id AND cm1.user_id = $2 AND cm1.left_at IS NULL
         JOIN chat_members cm2 ON cm2.room_id = r.id AND cm2.user_id = $3 AND cm2.left_at IS NULL
         WHERE r.workspace_id = $1 AND r.type = $4`,
        [workspaceId, userId, directTargetUserId, ChatRoomType.DIRECT],
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

    const savedRows: ChatRoom[] = await this.dataSource.query(
      `INSERT INTO chat_rooms (workspace_id, type, visibility, name, group_id, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
      [
        workspaceId,
        dto.type,
        dto.visibility ?? ChatVisibility.MEMBERS_ONLY,
        dto.name ?? null,
        dto.groupId ?? null,
        dto.projectId ?? null,
        userId,
      ],
    );
    const saved = savedRows[0];

    const memberIds = new Set<string>([userId]);
    if (dto.type === ChatRoomType.DIRECT && directTargetUserId) {
      memberIds.add(directTargetUserId);
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
    if (dto.type === ChatRoomType.DIRECT && directTargetUserId) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          directTargetUserId,
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

    if (room.type !== ChatRoomType.DIRECT && room.createdById !== userId) {
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
