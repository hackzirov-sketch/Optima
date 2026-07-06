import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { CHAT_MEMBER_COLUMNS_SQL } from '../chat.sql';

@Injectable()
export class ChatMemberService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async assertRoomMember(roomId: string, userId: string): Promise<ChatMember> {
    const rows: ChatMember[] = await this.dataSource.query(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId],
    );
    if (!rows[0]) {
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
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.avatar_url AS "u_avatarUrl"
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL`,
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
}
