import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { AddReactionDto } from '../dto/add-reaction.dto';
import { CHAT_REACTION_COLUMNS_SQL } from '../chat.sql';

@Injectable()
export class ChatReactionService {
  constructor(
    private readonly dataSource: DatabaseService,
  ) {}

  groupReactions(reactions: ChatReaction[]): { emoji: string; userIds: string[] }[] {
    const map = new Map<string, string[]>();
    for (const r of reactions) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
  }

  private async findMessage(messageId: string): Promise<{ id: string; roomId: string; deletedAt: Date | null } | null> {
    const rows: Array<{ id: string; roomId: string; deletedAt: Date | null }> = await this.dataSource.query(
      `SELECT id, room_id AS "roomId", deleted_at AS "deletedAt" FROM chat_messages WHERE id = $1`,
      [messageId],
    );
    return rows[0] ?? null;
  }

  private async assertMember(roomId: string, userId: string): Promise<void> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    }
  }

  private async findReaction(messageId: string, userId: string, emoji: string): Promise<ChatReaction | null> {
    const rows: ChatReaction[] = await this.dataSource.query(
      `SELECT ${CHAT_REACTION_COLUMNS_SQL} FROM chat_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji],
    );
    return rows[0] ?? null;
  }

  async addReaction(messageId: string, userId: string, dto: AddReactionDto) {
    const msg = await this.findMessage(messageId);
    if (!msg || msg.deletedAt) {
      throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    }

    // member check va existing reaction — parallel (roomId endi ma'lum)
    const [memberOk, existing] = await Promise.all([
      this.dataSource
        .query(`SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`, [msg.roomId, userId])
        .then((rows) => rows[0]),
      this.findReaction(messageId, userId, dto.emoji),
    ]);

    if (!memberOk) {
      throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    }

    if (existing) return existing;

    const rows: ChatReaction[] = await this.dataSource.query(
      `INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       RETURNING ${CHAT_REACTION_COLUMNS_SQL}`,
      [messageId, userId, dto.emoji],
    );
    return rows[0];
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.findMessage(messageId);
    if (!msg) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.assertMember(msg.roomId, userId);
    await this.dataSource.query(
      `DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji],
    );
  }

  async toggleReaction(messageId: string, userId: string, emoji: string): Promise<'added' | 'removed'> {
    const msg = await this.findMessage(messageId);
    if (!msg || msg.deletedAt) {
      throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    }

    const [memberOk, existing] = await Promise.all([
      this.dataSource
        .query(`SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`, [msg.roomId, userId])
        .then((rows) => rows[0]),
      this.findReaction(messageId, userId, emoji),
    ]);

    if (!memberOk) {
      throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    }

    if (existing) {
      await this.dataSource.query(
        `DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji],
      );
      return 'removed';
    }

    await this.dataSource.query(
      `INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`,
      [messageId, userId, emoji],
    );
    return 'added';
  }
}
