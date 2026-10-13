import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { AddReactionDto } from '../dto/add-reaction.dto';
import { CHAT_REACTION_COLUMNS_SQL } from '../chat.sql';

@Injectable()
export class ChatReactionService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly events: EventEmitter2,
  ) {}

  groupReactions(
    reactions: ChatReaction[],
  ): { emoji: string; userIds: string[] }[] {
    const map = new Map<string, string[]>();
    for (const r of reactions) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({
      emoji,
      userIds,
    }));
  }

  private async findMessage(
    messageId: string,
  ): Promise<{ id: string; roomId: string; deletedAt: Date | null } | null> {
    const rows = await this.dataSource.query<{
      id: string;
      roomId: string;
      deletedAt: Date | null;
    }>(
      `SELECT id, room_id AS "roomId", deleted_at AS "deletedAt" FROM chat_messages WHERE id = $1`,
      [messageId],
    );
    return rows[0] ?? null;
  }

  /**
   * Who reacted with what, and when — the list behind a reaction chip. In a
   * channel only its owner/admins may see it: subscribers react anonymously.
   */
  async listReactors(messageId: string, userId: string) {
    const message = await this.findMessage(messageId);
    if (!message || message.deletedAt)
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    const rows = await this.dataSource.query<{ type: string; role: string }>(
      `SELECT r.type, m.role FROM chat_rooms r
         JOIN chat_members m ON m.room_id = r.id AND m.user_id = $2
                            AND m.left_at IS NULL AND m.status = 'active'
        WHERE r.id = $1`,
      [message.roomId, userId],
    );
    const membership = rows[0];
    if (!membership)
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    if (membership.type === 'channel' && !['owner', 'admin'].includes(membership.role))
      return [];
    return this.dataSource.query<{
      userId: string;
      emoji: string;
      createdAt: Date;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      username: string | null;
    }>(
      `SELECT r.user_id AS "userId", r.emoji, r.created_at AS "createdAt",
              u.first_name AS "firstName", u.last_name AS "lastName",
              u.avatar_url AS "avatarUrl", u.username
         FROM chat_reactions r
         JOIN users u ON u.id = r.user_id
        WHERE r.message_id = $1
        ORDER BY r.created_at DESC
        LIMIT 500`,
      [messageId],
    );
  }

  private async assertMember(roomId: string, userId: string): Promise<void> {
    const rows = await this.dataSource.query<{ id: string }>(
      `SELECT id FROM chat_members
           WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }
  }

  private async findReaction(
    messageId: string,
    userId: string,
  ): Promise<ChatReaction | null> {
    const rows = await this.dataSource.query<ChatReaction>(
      `SELECT ${CHAT_REACTION_COLUMNS_SQL} FROM chat_reactions
       WHERE message_id = $1 AND user_id = $2`,
      [messageId, userId],
    );
    return rows[0] ?? null;
  }

  async addReaction(messageId: string, userId: string, dto: AddReactionDto) {
    const msg = await this.findMessage(messageId);
    if (!msg || msg.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    }

    // member check va existing reaction — parallel (roomId endi ma'lum)
    const [memberOk, existing] = await Promise.all([
      this.dataSource
        .query(
          `SELECT id FROM chat_members
           WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
          [msg.roomId, userId],
        )
        .then((rows) => rows[0]),
      this.findReaction(messageId, userId),
    ]);

    if (!memberOk) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }

    if (existing?.emoji === dto.emoji) return existing;
    const rows = await this.dataSource.query<ChatReaction>(
      `INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()
       RETURNING ${CHAT_REACTION_COLUMNS_SQL}`,
      [messageId, userId, dto.emoji],
    );
    return rows[0];
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.findMessage(messageId);
    if (!msg)
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    await this.assertMember(msg.roomId, userId);
    await this.dataSource.query(
      `DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji],
    );
    // The socket path already broadcast reaction changes; this REST path never
    // did, so removing a reaction only disappeared for the person who removed
    // it. Same event name, so the client needs no second code path.
    this.events.emit('chat.reaction_updated', {
      roomId: msg.roomId,
      messageId,
      userId,
      emoji,
      action: 'removed',
    });
  }

  /** Returns the room the reacted-to message actually lives in, so callers
   * broadcast into that room rather than one named by the client. */
  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{ action: 'added' | 'removed'; roomId: string }> {
    const msg = await this.findMessage(messageId);
    if (!msg || msg.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    }

    const [memberOk, existing] = await Promise.all([
      this.dataSource
        .query(
          `SELECT id FROM chat_members
           WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
          [msg.roomId, userId],
        )
        .then((rows) => rows[0]),
      this.findReaction(messageId, userId),
    ]);

    if (!memberOk) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }

    // A room can switch reactions off entirely (Telegram channels do). Removing
    // one stays allowed either way — turning the setting off should let people
    // clean up reactions they already left, not freeze them in place.
    if (!existing || existing.emoji !== emoji) {
      const settings = await this.dataSource.query<{
        reactionsEnabled: boolean;
      }>(
        `SELECT reactions_enabled AS "reactionsEnabled" FROM channel_settings WHERE room_id = $1`,
        [msg.roomId],
      );
      if (settings[0] && !settings[0].reactionsEnabled)
        throw new ForbiddenException({
          code: 'CHAT_REACTIONS_DISABLED',
          message: 'Reactions are turned off in this room',
        });
    }

    if (existing?.emoji === emoji) {
      await this.dataSource.query(
        `DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji],
      );
      return { action: 'removed', roomId: msg.roomId };
    }

    await this.dataSource.query(
      `INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`,
      [messageId, userId, emoji],
    );
    return { action: 'added', roomId: msg.roomId };
  }
}
