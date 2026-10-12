import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { GroupMember } from '../../../database/entities/group-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { PermissionService } from '../../../common/services/permission.service';
import { ChatMemberService } from './member.service';
import { ChatRoomService } from './room.service';
import { CreateRoomInviteDto } from '../dto/create-room-invite.dto';
import {
  CHAT_ROOM_COLUMNS_SQL,
  CHAT_ROOM_INVITE_COLUMNS_SQL,
} from '../chat.sql';

export interface RoomInviteDto {
  id: string;
  roomId: string;
  code: string;
  createdById: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  isActive: boolean;
}

interface ChatRoomInviteRow {
  id: string;
  roomId: string;
  createdById: string;
  code: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ChatRoomInviteService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
    private readonly chatMemberService: ChatMemberService,
    private readonly roomService: ChatRoomService,
  ) {}

  private toDto(invite: ChatRoomInviteRow): RoomInviteDto {
    const now = new Date();
    const isActive =
      !invite.revokedAt &&
      (!invite.expiresAt || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.usesCount < invite.maxUses);

    return {
      id: invite.id,
      roomId: invite.roomId,
      code: invite.code,
      createdById: invite.createdById,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      expiresAt: invite.expiresAt,
      revokedAt: invite.revokedAt,
      createdAt: invite.createdAt,
      isActive,
    };
  }

  private async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const rows = await this.dataSource.query<ChatRoom>(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    return rows[0] ?? null;
  }

  /**
   * Generatsiya ruxsati: assertCanCreateChatRoom darajasi (lead+) yoki room
   * creator. Aks holda → ROOM_INVITE_FORBIDDEN (system design v2 §4.1).
   */
  private async assertCanManageInvites(
    room: ChatRoom,
    userId: string,
  ): Promise<void> {
    if (room.createdById === userId) return;

    // The room's own role is the primary authority: a group or channel has no
    // group at all, so its admins would otherwise be told they are "not a
    // group member" while looking at a room they administer.
    const roomRoleRows = await this.dataSource.query<{ role: string }>(
      `SELECT role FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [room.id, userId],
    );
    if (['owner', 'admin'].includes(roomRoleRows[0]?.role)) return;

    if (!room.groupId) {
      throw new ForbiddenException({
        code: ErrorCode.ROOM_INVITE_FORBIDDEN,
        message: 'Only room admins can manage invite links',
      });
    }

    const rows = await this.dataSource.query<GroupMember>(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [room.groupId, userId],
    );
    const wsMember = rows[0];
    if (!wsMember) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'Not a group member',
      });
    }
    try {
      this.permission.assertCanCreateChatRoom(wsMember);
    } catch {
      throw new ForbiddenException({
        code: ErrorCode.ROOM_INVITE_FORBIDDEN,
        message:
          'Only the room creator or a lead/admin/owner can manage invite links',
      });
    }
  }

  private async generateUniqueCode(): Promise<string> {
    const { randomBytes } = await import('crypto');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(6).toString('base64url').slice(0, 8);
      const existing = await this.dataSource.query(
        `SELECT id FROM chat_room_invites WHERE code = $1`,
        [code],
      );
      if (!existing[0]) return code;
    }
    throw new BadRequestException({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Could not generate a unique invite code, try again',
    });
  }

  async create(
    roomId: string,
    userId: string,
    dto: CreateRoomInviteDto,
  ): Promise<RoomInviteDto> {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });

    await this.chatMemberService.assertRoomMember(roomId, userId);
    await this.assertCanManageInvites(room, userId);

    const code = await this.generateUniqueCode();
    let expiresAt: Date | null = null;
    if (dto.expiresInHours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + dto.expiresInHours);
    }

    const rows = await this.dataSource.query<ChatRoomInviteRow>(
      `INSERT INTO chat_room_invites (room_id, created_by, code, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CHAT_ROOM_INVITE_COLUMNS_SQL}`,
      [roomId, userId, code, dto.maxUses ?? null, expiresAt],
    );
    return this.toDto(rows[0]);
  }

  async list(roomId: string, userId: string): Promise<RoomInviteDto[]> {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });

    await this.assertCanManageInvites(room, userId);

    const invites = await this.dataSource.query<ChatRoomInviteRow>(
      `SELECT ${CHAT_ROOM_INVITE_COLUMNS_SQL} FROM chat_room_invites
       WHERE room_id = $1 ORDER BY created_at DESC`,
      [roomId],
    );
    return invites.map((i) => this.toDto(i));
  }

  async revoke(
    roomId: string,
    inviteId: string,
    userId: string,
  ): Promise<void> {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });

    await this.assertCanManageInvites(room, userId);

    const rows = await this.dataSource.query<ChatRoomInviteRow>(
      `SELECT ${CHAT_ROOM_INVITE_COLUMNS_SQL} FROM chat_room_invites WHERE id = $1 AND room_id = $2`,
      [inviteId, roomId],
    );
    const invite = rows[0];
    if (!invite)
      throw new NotFoundException({
        code: ErrorCode.ROOM_INVITE_NOT_FOUND,
        message: 'Invite not found',
      });
    if (invite.revokedAt) return;

    await this.dataSource.query(
      `UPDATE chat_room_invites SET revoked_at = now() WHERE id = $1`,
      [inviteId],
    );
  }

  async joinByCode(code: string, userId: string) {
    const room = await this.dataSource.withTransaction(async (query) => {
      // Checked inside the transaction, before the row is reopened below: an
      // invite link is exactly what a banned person would be handed by a
      // friend still in the room.
      const bannedRows = await query<{ bannedUntil: Date | null }>(
        `SELECT cm.banned_until AS "bannedUntil"
           FROM chat_members cm
           JOIN chat_room_invites i ON i.room_id = cm.room_id
          WHERE i.code = $1 AND cm.user_id = $2
            AND cm.is_banned = true
            AND (cm.banned_until IS NULL OR cm.banned_until > now())`,
        [code, userId],
      );
      if (bannedRows[0])
        throw new ForbiddenException({
          code: 'CHAT_MEMBER_BANNED',
          message: 'You are banned from this room',
        });

      const inviteRows: ChatRoomInviteRow[] = await query(
        `SELECT ${CHAT_ROOM_INVITE_COLUMNS_SQL} FROM chat_room_invites
         WHERE code = $1 AND revoked_at IS NULL FOR UPDATE`,
        [code],
      );
      const invite = inviteRows[0];
      if (!invite)
        throw new NotFoundException({
          code: ErrorCode.INVITE_CODE_INVALID,
          message: 'Invalid invite link',
        });
      if (invite.expiresAt && invite.expiresAt <= new Date()) {
        throw new BadRequestException({
          code: ErrorCode.INVITE_CODE_EXPIRED,
          message: 'This invite link has expired',
        });
      }

      const roomRows: ChatRoom[] = await query(
        `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
        [invite.roomId],
      );
      const lockedRoom = roomRows[0];
      if (!lockedRoom)
        throw new NotFoundException({
          code: ErrorCode.ROOM_NOT_FOUND,
          message: 'Room not found',
        });

      const existingRows = await query(
        `SELECT id, status FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [lockedRoom.id, userId],
      );
      if (existingRows[0]) {
        if (existingRows[0].status === 'pending') {
          await query(
            `UPDATE chat_members SET status = 'active' WHERE id = $1`,
            [existingRows[0].id],
          );
        }
        return lockedRoom;
      }

      if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
        throw new BadRequestException({
          code: ErrorCode.INVITE_CODE_EXHAUSTED,
          message: 'This invite link has reached its usage limit',
        });
      }

      // Private rooms (and any room with join approval switched on) never
      // let a link straight in: the holder files a request an admin answers.
      const approvalRows = await query<{ required: boolean }>(
        `SELECT join_requires_approval AS required FROM channel_settings WHERE room_id = $1`,
        [lockedRoom.id],
      );
      if (lockedRoom.scope !== 'public' || approvalRows[0]?.required) {
        await query(
          `INSERT INTO chat_join_requests (room_id, user_id, invite_id) VALUES ($1, $2, $3)
           ON CONFLICT (room_id, user_id) DO NOTHING`,
          [lockedRoom.id, userId, invite.id],
        );
        return { ...lockedRoom, joinRequested: true as const };
      }
      // A chat invite grants exactly one thing: membership of that room.
      //
      // It used to also INSERT the joiner into group_members as 'junior'.
      // Chat invite links are meant to be passed around — that is what they are
      // for — so anyone who received one silently became a member of the whole
      // group, and every group-scoped check downstream is a bare
      // assertMember(): projects, tasks, the analytics overview, the earnings
      // ledger, and the member list with everyone's email address on it. A link
      // to one room is not consent to any of that. Group membership now only
      // comes from the group invitation flow (InvitationsService), which is
      // gated on an admin actually inviting the person.
      // ON CONFLICT because the check above only looks at *open* memberships:
      // someone who left the room still has their row, so a plain INSERT hit
      // the (room_id, user_id) unique index and returned a 500 to anyone
      // rejoining by link. Same reopen semantics as joinPublicRoom.
      await query(
        `INSERT INTO chat_members (room_id, user_id, status) VALUES ($1, $2, 'active')
         ON CONFLICT (room_id, user_id)
         DO UPDATE SET left_at = NULL, status = 'active', joined_at = now()`,
        [lockedRoom.id, userId],
      );
      await query(
        `UPDATE chat_room_invites SET uses_count = uses_count + 1 WHERE id = $1`,
        [invite.id],
      );
      return lockedRoom;
    });

    if ('joinRequested' in room) {
      return {
        joinRequested: true,
        roomId: room.id,
        name: room.name,
        type: room.type,
        avatarUrl: room.avatarUrl ?? null,
      };
    }

    // After the commit, not inside it: a rollback would otherwise have left
    // the cache cleared for a join that never happened — harmless here, but
    // the ordering that is always correct is "persist, then invalidate".
    await this.chatMemberService.invalidateRoomMember(room.id, userId);

    return this.roomService.enrichRoom(room, userId);
  }

  private async assertCanReviewRequests(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    await this.assertCanManageInvites(room, userId);
    return room;
  }

  /** Pending "ask to join" requests for a room — owner/admin only. */
  async listJoinRequests(roomId: string, userId: string) {
    await this.assertCanReviewRequests(roomId, userId);
    return this.dataSource.query<{
      id: string;
      userId: string;
      firstName: string;
      lastName: string;
      username: string | null;
      avatarUrl: string | null;
      createdAt: Date;
    }>(
      `SELECT r.id, r.user_id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName",
              u.username, u.avatar_url AS "avatarUrl", r.created_at AS "createdAt"
         FROM chat_join_requests r
         JOIN users u ON u.id = r.user_id
        WHERE r.room_id = $1
        ORDER BY r.created_at`,
      [roomId],
    );
  }

  /** Approve (adds them as an active member) or decline one request. */
  async resolveJoinRequest(
    roomId: string,
    requestId: string,
    userId: string,
    approve: boolean,
  ) {
    await this.assertCanReviewRequests(roomId, userId);
    const rows = await this.dataSource.query<{ userId: string; inviteId: string | null }>(
      `DELETE FROM chat_join_requests WHERE id = $1 AND room_id = $2
       RETURNING user_id AS "userId", invite_id AS "inviteId"`,
      [requestId, roomId],
    );
    const request = rows[0];
    if (!request)
      throw new NotFoundException({
        code: 'JOIN_REQUEST_NOT_FOUND',
        message: 'Join request not found',
      });
    if (approve) {
      await this.dataSource.query(
        `INSERT INTO chat_members (room_id, user_id, status) VALUES ($1, $2, 'active')
         ON CONFLICT (room_id, user_id)
         DO UPDATE SET left_at = NULL, status = 'active', joined_at = now()`,
        [roomId, request.userId],
      );
      if (request.inviteId)
        await this.dataSource.query(
          `UPDATE chat_room_invites SET uses_count = uses_count + 1 WHERE id = $1`,
          [request.inviteId],
        );
      await this.chatMemberService.invalidateRoomMember(roomId, request.userId);
    }
    return { userId: request.userId, approved: approve };
  }
}
