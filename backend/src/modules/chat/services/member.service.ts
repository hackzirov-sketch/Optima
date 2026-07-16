import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { CHAT_MEMBER_COLUMNS_SQL } from '../chat.sql';

@Injectable()
export class ChatMemberService {
  constructor(
    private readonly dataSource: DatabaseService,
  ) {}

  async assertRoomMember(roomId: string, userId: string): Promise<ChatMember> {
    const rows: ChatMember[] = await this.dataSource.query(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, userId],
    );
    if (!rows[0]) {
      // Check if there's a pending invite
      const pendingRows: ChatMember[] = await this.dataSource.query(
        `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
         WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'pending'`,
        [roomId, userId],
      );
      if (pendingRows[0]) {
        throw new ForbiddenException({
          code: 'CHAT_INVITE_PENDING',
          message: 'You have a pending invite to this room. Please accept it first.',
        });
      }
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }
    return rows[0];
  }

  async assertRoomMemberWithUser(
    roomId: string,
    userId: string,
  ): Promise<ChatMember & { user: { id: string; firstName: string; lastName: string; avatarUrl: string | null } }> {
    const rows: any[] = await this.dataSource.query(
      `SELECT
         cm.id AS "id", cm.room_id AS "roomId", cm.user_id AS "userId",
         cm.is_muted AS "isMuted", cm.muted_until AS "mutedUntil",
         cm.last_read_at AS "lastReadAt", cm.last_read_message_id AS "lastReadMessageId",
         cm.last_read_seq AS "lastReadSeq", cm.joined_at AS "joinedAt", cm.left_at AS "leftAt",
         cm.status AS "status",
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.avatar_url AS "u_avatarUrl"
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL AND cm.status = 'active'`,
      [roomId, userId],
    );
    const row = rows[0];
    if (!row) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }
    const { u_id, u_firstName, u_lastName, u_avatarUrl, ...member } = row;
    return {
      ...member,
      user: { id: u_id, firstName: u_firstName, lastName: u_lastName, avatarUrl: u_avatarUrl },
    };
  }

  /** Accept a pending chat invite (e.g. DM request) */
  async acceptChatInvite(roomId: string, userId: string): Promise<{ message: string }> {
    const rows: ChatMember[] = await this.dataSource.query(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'pending'`,
      [roomId, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'CHAT_INVITE_NOT_FOUND',
        message: 'No pending invite found for this room',
      });
    }
    await this.dataSource.query(
      `UPDATE chat_members SET status = 'active' WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );

    // Notify the room creator
    const roomRows: any[] = await this.dataSource.query(
      `SELECT created_by AS "createdById" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    if (roomRows[0]?.createdById && roomRows[0].createdById !== userId) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, 'chat_invite_accepted', 'Taklif qabul qilindi', 'Foydalanuvchi sizning chat taklifingizni qabul qildi', 'chat_room', $3)`,
        [roomRows[0].createdById, userId, roomId],
      );
    }

    return { message: 'Chat invite accepted' };
  }

  /** Decline a pending chat invite */
  async declineChatInvite(roomId: string, userId: string): Promise<{ message: string }> {
    const rows: ChatMember[] = await this.dataSource.query(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'pending'`,
      [roomId, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'CHAT_INVITE_NOT_FOUND',
        message: 'No pending invite found for this room',
      });
    }
    await this.dataSource.query(
      `UPDATE chat_members SET left_at = now() WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );

    const roomRows: any[] = await this.dataSource.query(
      `SELECT created_by AS "createdById" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    if (roomRows[0]?.createdById && roomRows[0].createdById !== userId) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, 'chat_invite_declined', 'Taklif rad etildi', 'Foydalanuvchi sizning chat taklifingizni rad etdi', 'chat_room', $3)`,
        [roomRows[0].createdById, userId, roomId],
      );
    }

    return { message: 'Chat invite declined' };
  }

  /** List all pending chat invites for a user across all rooms */
  async listPendingInvites(userId: string) {
    const rows: any[] = await this.dataSource.query(
      `SELECT
         cm.room_id AS "roomId", r.name AS "roomName", r.type AS "roomType",
         r.scope, r.created_by AS "createdById",
         u.first_name AS "actorFirstName", u.last_name AS "actorLastName",
         u.avatar_url AS "actorAvatarUrl",
         cm.joined_at AS "invitedAt"
       FROM chat_members cm
       JOIN chat_rooms r ON r.id = cm.room_id
       JOIN users u ON u.id = r.created_by
       WHERE cm.user_id = $1 AND cm.left_at IS NULL AND cm.status = 'pending'`,
      [userId],
    );
    return rows;
  }
}
