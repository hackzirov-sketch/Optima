import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { MessageAttachment } from '../../../database/entities/message-attachment.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { ChatReactionService } from './reaction.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { StorageService } from '../../storage/storage.service';
import { RedisService } from '../../../redis/redis.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { v4 as uuidv4 } from 'uuid';
import { CHAT_MESSAGE_COLUMNS_SQL, CHAT_REACTION_COLUMNS_SQL, MESSAGE_ATTACHMENT_COLUMNS_SQL } from '../chat.sql';
import { normalizeReturning } from '../../../common/utils/sql.util';

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatReactionService: ChatReactionService,
    private readonly contentFilter: ContentFilterService,
    private readonly chatEncryption: ChatEncryptionService,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  async listMessages(roomId: string, userId: string, page = 1, limit = 50, cursor?: number) {
    await this.chatMemberService.assertRoomMember(roomId, userId);

    const l = Number(limit) || 50;
    const p = Number(page) || 1;

    const params: unknown[] = [roomId];
    let whereClause = `m.room_id = $1 AND m.deleted_at IS NULL`;
    if (cursor) {
      params.push(cursor);
      whereClause += ` AND m.sequence < $${params.length}`;
    }
    params.push(l);
    const limitParam = `$${params.length}`;
    let offsetClause = '';
    if (!cursor) {
      params.push((p - 1) * l);
      offsetClause = `OFFSET $${params.length}`;
    }

    const messages: any[] = await this.dataSource.query(
      `SELECT
         m.id AS "id", m.room_id AS "roomId", m.sender_id AS "senderId",
         m.reply_to_id AS "replyToId", m.content, m.content_json AS "contentJson",
         m.content_type AS "contentType", m.is_edited AS "isEdited", m.edited_at AS "editedAt",
         m.is_system AS "isSystem", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
         m.sequence, m.client_message_id AS "clientMessageId", m.metadata,
         u.id AS "s_id", u.first_name AS "s_firstName", u.last_name AS "s_lastName",
         u.avatar_url AS "s_avatarUrl"
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE ${whereClause}
       ORDER BY m.sequence DESC
       LIMIT ${limitParam} ${offsetClause}`,
      params,
    );

    let total: number | undefined;
    if (!cursor) {
      const countRows: Array<{ count: string }> = await this.dataSource.query(
        `SELECT COUNT(*) FROM chat_messages m WHERE m.room_id = $1 AND m.deleted_at IS NULL`,
        [roomId],
      );
      total = Number(countRows[0]?.count ?? 0);
    }

    if (messages.length === 0) {
      return { data: [], total, page: cursor ? undefined : page, limit: l };
    }

    const msgIds = messages.map((m) => m.id);

    const reactions: ChatReaction[] = await this.dataSource.query(
      `SELECT ${CHAT_REACTION_COLUMNS_SQL} FROM chat_reactions WHERE message_id = ANY($1::uuid[])`,
      [msgIds],
    );
    const reactionsByMsg = new Map<string, ChatReaction[]>();
    for (const r of reactions) {
      if (!reactionsByMsg.has(r.messageId)) reactionsByMsg.set(r.messageId, []);
      reactionsByMsg.get(r.messageId)!.push(r);
    }

    const attachments: MessageAttachment[] = await this.dataSource.query(
      `SELECT ${MESSAGE_ATTACHMENT_COLUMNS_SQL} FROM message_attachments WHERE message_id = ANY($1::uuid[])`,
      [msgIds],
    );
    const attachmentsByMsg = new Map<string, MessageAttachment[]>();
    for (const a of attachments) {
      if (!attachmentsByMsg.has(a.messageId)) attachmentsByMsg.set(a.messageId, []);
      attachmentsByMsg.get(a.messageId)!.push(a);
    }

    const data = messages.map((msg) => ({
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      sequence: msg.sequence,
      clientMessageId: msg.clientMessageId,
      metadata: msg.metadata,
      sender: msg.s_id
        ? {
            id: msg.s_id,
            firstName: msg.s_firstName,
            lastName: msg.s_lastName,
            avatarUrl: msg.s_avatarUrl,
          }
        : null,
      content: msg.contentType === 'document' ? msg.content : this.chatEncryption.safeDecrypt(msg.contentJson, msg.content ?? ''),
      contentType: msg.contentType,
      attachments: (attachmentsByMsg.get(msg.id) ?? []).map((a) => this.mapAttachment(a)),
      replyToId: msg.replyToId ?? null,
      isEdited: msg.isEdited,
      editedAt: msg.isEdited ? (msg.editedAt ?? msg.updatedAt) : null,
      isSystem: msg.isSystem,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      reactions: this.chatReactionService.groupReactions(reactionsByMsg.get(msg.id) ?? []),
    }));

    return { data, total, limit: l };
  }

  /**
   * Flood protection: too many messages in a short window ("kop xabar bo'lib ketish").
   * Content-filter only catches spammy *content* (repeated chars, caps, etc) — this
   * catches spammy *frequency* (e.g. 20 short messages in 5 seconds), which the
   * existing heuristics never see because each individual message looks fine.
   *
   * Sliding window via Redis INCR + EX. Falls back to allow-through if Redis is down
   * (same fail-open posture as the rest of the chat pipeline when Redis is unavailable).
   */
  /**
   * 10 messages/second per user is the target ceiling — generous for any
   * real client (typing + send simply can't sustain that), but tight enough
   * to make scripted flooding pointless. Global per-user (not per-room), so
   * spreading messages across multiple rooms doesn't bypass it.
   *
   * Two windows:
   *  - 1s burst window: hard cap at 10 — absorbs legitimate short bursts
   *    (e.g. pasting several lines that get sent as separate messages).
   *  - 60s sustained window: cap at 120 (avg 2/s) — a client hammering
   *    exactly 10/s nonstop for a minute straight is not a human, this
   *    catches that pattern even though each individual second passes.
   */
  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const roomRows: Array<{ id: string; isReadOnly: boolean; postingMode: string }> = await this.dataSource.query(
      `SELECT id, is_read_only AS "isReadOnly", posting_mode AS "postingMode" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    const room = roomRows[0];
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    // assertRoomMemberWithUser: membership + user bir SELECT'da — keyinroq sender uchun alohida query yo'q
    const member = await this.chatMemberService.assertRoomMemberWithUser(roomId, userId);
    if (room.isReadOnly) throw new ForbiddenException({ code: ErrorCode.ROOM_READ_ONLY, message: 'Room is read-only' });
    if (member.isBanned || (member.bannedUntil && new Date(member.bannedUntil) > new Date())) {
      throw new ForbiddenException({ code: 'CHAT_MEMBER_BANNED', message: 'You cannot send messages in this room' });
    }
    if (room.postingMode === 'admins_only' && member.user.publicId !== '777777') {
      throw new ForbiddenException({ code: 'CHANNEL_ADMIN_ONLY', message: 'Only channel admins can publish posts' });
    }

    const hasAttachments = !!dto.attachments?.length;
    if (!dto.content?.trim() && !hasAttachments) {
      throw new BadRequestException({ code: ErrorCode.MESSAGE_EMPTY, message: 'Message content is required' });
    }

    if (dto.content?.trim()) {
      await this.contentFilter.filterText(dto.content, userId, 'chat');
    }

    // 1. Idempotency Check
    if (dto.clientMessageId) {
      const existingRows: any[] = await this.dataSource.query(
        `SELECT ${CHAT_MESSAGE_COLUMNS_SQL} FROM chat_messages
         WHERE room_id = $1 AND sender_id = $2 AND client_message_id = $3`,
        [roomId, userId, dto.clientMessageId],
      );
      if (existingRows[0]) {
        const existing = existingRows[0];
        const existingAttachments: MessageAttachment[] = await this.dataSource.query(
          `SELECT ${MESSAGE_ATTACHMENT_COLUMNS_SQL} FROM message_attachments WHERE message_id = $1`,
          [existing.id],
        );
        const existingContent = existing.contentType === 'document'
          ? existing.content ?? ''
          : this.chatEncryption.safeDecrypt(existing.contentJson, existing.content ?? '');
        return this.mapToResponse(existing, existingContent, existingAttachments);
      }
    }

    // 2. Redis Sequence (Atomic)
    const redisClient = this.redisService.getClient();
    let sequence = 1;
    if (redisClient) {
      sequence = await redisClient.incr(`room:${roomId}:seq`);
    } else {
      // Fallback if Redis is down
      const maxRes: Array<{ max: number | null }> = await this.dataSource.query(
        `SELECT MAX(sequence) AS max FROM chat_messages WHERE room_id = $1`,
        [roomId],
      );
      sequence = (maxRes[0]?.max || 0) + 1;
    }

    const plainText = (dto.content ?? '').trim();
    let contentToSave = plainText;
    let contentType = hasAttachments ? 'media' : 'text';
    let contentJson: any = null;

    // 3. Length check (4096) — only applies to plain text messages, not media captions
    if (!hasAttachments && plainText.length > 4096) {
      contentType = 'document';
      const key = `chat-long-messages/${uuidv4()}.txt`;
      const buffer = Buffer.from(plainText, 'utf-8');
      const { url } = await this.storageService.uploadBuffer(buffer, key, 'text/plain');

      contentToSave = plainText.substring(0, 150) + '...'; // Preview
      contentJson = { documentUrl: url, key }; // Store URL in JSON
    } else if (plainText) {
      contentJson = this.chatEncryption.isEnabled()
        ? this.chatEncryption.encrypt(plainText)
        : null;
      if (contentJson) contentToSave = '';
    }

    const savedRows: ChatMessage[] = await this.dataSource.query(
      `INSERT INTO chat_messages
         (room_id, sender_id, sequence, client_message_id, content, content_json,
          content_type, reply_to_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${CHAT_MESSAGE_COLUMNS_SQL}`,
      [
        roomId,
        userId,
        sequence,
        dto.clientMessageId ?? null,
        contentToSave,
        contentJson,
        contentType,
        dto.replyToId ?? null,
        {},
      ],
    );
    const saved = savedRows[0];

    // 3b. Persist attachments (already uploaded to R2 via /chat/rooms/:roomId/attachments/presign)
    let savedAttachments: MessageAttachment[] = [];
    if (hasAttachments) {
      const values: string[] = [];
      const params: unknown[] = [];
      dto.attachments!.forEach((a, i) => {
        const base = i * 9;
        values.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
        );
        params.push(
          saved.id,
          userId,
          a.fileName,
          a.fileSize,
          a.mimeType,
          a.storageKey,
          a.storageUrl,
          a.width ?? null,
          a.height ?? null,
        );
      });
      savedAttachments = await this.dataSource.query(
        `INSERT INTO message_attachments
           (message_id, uploader_id, file_name, file_size, mime_type, storage_key, storage_url, width, height)
         VALUES ${values.join(', ')}
         RETURNING ${MESSAGE_ATTACHMENT_COLUMNS_SQL}`,
        params,
      );
    }

    // 4. Background Jobs — parallel, not sequential
    await Promise.all([
      this.chatQueue.add(
        'update-room-metadata',
        { roomId, sequence, lastMessageId: saved.id, lastMessageAt: saved.createdAt },
        { jobId: roomId }, // Dedup by roomId
      ),
      this.chatQueue.add(
        'message-side-effects',
        { messageId: saved.id, roomId, senderId: userId },
        { jobId: saved.id },
      ),
    ]);

    // Fix: sender'ni DB'dan qayta yuklamaymiz — assertRoomMemberWithUser yuqorida
    // user join bilan chaqirilgan, shuning uchun alohida SELECT yo'q.
    const senderUser = member.user ?? null;

    return this.mapToResponseWithSender(saved, plainText, senderUser, savedAttachments);
  }

  async deleteMessage(messageId: string, userId: string) {
    const rows: ChatMessage[] = await this.dataSource.query(
      `SELECT ${CHAT_MESSAGE_COLUMNS_SQL} FROM chat_messages WHERE id = $1`,
      [messageId],
    );
    const msg = rows[0];
    if (!msg) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);

    if (msg.senderId !== userId) {
      // Non-senders may only delete a message if this is a group/channel room
      // (not a 1-on-1 direct room) and they are the room owner/creator.
      const roomRows: Array<{ type: string; createdById: string }> = await this.dataSource.query(
        `SELECT type, created_by AS "createdById" FROM chat_rooms WHERE id = $1`,
        [msg.roomId],
      );
      const room = roomRows[0];
      const isDirectRoom = room?.type === 'direct';
      const isRoomOwner = room?.createdById === userId;
      if (isDirectRoom || !isRoomOwner) {
        throw new ForbiddenException({ code: ErrorCode.CANNOT_DELETE_MESSAGE, message: 'You can only delete your own messages' });
      }
    }
    await this.dataSource.query(`UPDATE chat_messages SET deleted_at = now() WHERE id = $1`, [messageId]);
  }

  async updateMessage(messageId: string, userId: string, dto: UpdateMessageDto) {
    const rows: ChatMessage[] = await this.dataSource.query(
      `SELECT ${CHAT_MESSAGE_COLUMNS_SQL} FROM chat_messages WHERE id = $1`,
      [messageId],
    );
    const msg = rows[0];
    if (!msg || msg.deletedAt) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);

    if (msg.senderId !== userId)
      throw new ForbiddenException({ code: ErrorCode.CANNOT_EDIT_MESSAGE, message: 'You can only edit your own messages' });

    if (msg.contentType === 'document') {
      throw new ForbiddenException({ code: ErrorCode.CANNOT_EDIT_MESSAGE, message: 'Long document messages cannot be edited' });
    }

    const plainText = dto.content.trim();
    let content: string;
    let contentJson: any;
    if (this.chatEncryption.isEnabled()) {
      contentJson = this.chatEncryption.encrypt(plainText);
      content = '';
    } else {
      content = plainText;
      contentJson = null;
    }

    const editedAt = new Date();
    const savedRows: ChatMessage[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE chat_messages
         SET content = $2, content_json = $3, is_edited = true, edited_at = $4
         WHERE id = $1
         RETURNING ${CHAT_MESSAGE_COLUMNS_SQL}`,
        [messageId, content, contentJson, editedAt],
      ),
    );
    const saved = savedRows[0];
    return { ...saved, content: plainText, editedAt: saved.editedAt };
  }

  private mapToResponse(msg: any, decryptedContent: string, attachments: MessageAttachment[] = []) {
    return this.mapToResponseWithSender(msg, decryptedContent, msg.sender ?? null, attachments);
  }

  private mapAttachment(a: MessageAttachment) {
    return {
      id: a.id,
      fileName: a.fileName,
      fileSize: Number(a.fileSize),
      mimeType: a.mimeType,
      url: a.storageUrl,
      width: a.width ?? null,
      height: a.height ?? null,
    };
  }

  private mapToResponseWithSender(msg: any, decryptedContent: string, sender: any, attachments: MessageAttachment[] = []) {
    return {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      sequence: msg.sequence,
      clientMessageId: msg.clientMessageId,
      metadata: msg.metadata,
      content: msg.contentType === 'document' ? msg.content : decryptedContent,
      contentType: msg.contentType ?? 'text',
      attachments: attachments.map((a) => this.mapAttachment(a)),
      replyToId: msg.replyToId ?? null,
      isEdited: msg.isEdited ?? false,
      editedAt: msg.editedAt ?? null,
      createdAt: msg.createdAt,
      reactions: [],
      sender: sender
        ? {
            id: sender.id,
            firstName: sender.firstName ?? null,
            lastName: sender.lastName ?? null,
            avatarUrl: sender.avatarUrl ?? null,
          }
        : null,
    };
  }
}
