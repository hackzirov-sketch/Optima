import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { MessageAttachment } from '../../../database/entities/message-attachment.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { ChatReactionService } from './reaction.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { ViolationService } from '../../moderation/services/violation.service';
import { StorageService } from '../../storage/storage.service';
import { RedisService } from '../../../redis/redis.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { applySoftDelete } from '../../../common/utils/soft-delete';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatRoom) private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatReaction) private readonly reactionRepo: Repository<ChatReaction>,
    @InjectRepository(MessageAttachment) private readonly attachmentRepo: Repository<MessageAttachment>,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatReactionService: ChatReactionService,
    private readonly contentFilter: ContentFilterService,
    private readonly violationService: ViolationService,
    private readonly chatEncryption: ChatEncryptionService,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  async listMessages(roomId: string, userId: string, page = 1, limit = 50, cursor?: number) {
    await this.chatMemberService.assertRoomMember(roomId, userId);

    const l = Number(limit) || 50;
    
    const query = this.messageRepo.createQueryBuilder('msg')
      .where('msg.room_id = :roomId', { roomId })
      .andWhere('msg.deletedAt IS NULL')
      .leftJoinAndSelect('msg.sender', 'sender')
      .orderBy('msg.sequence', 'DESC')
      .take(l);

    if (cursor) {
      query.andWhere('msg.sequence < :cursor', { cursor });
    } else {
      const p = Number(page) || 1;
      query.skip((p - 1) * l); // Fallback to offset if no cursor provided (for backward compat)
    }

    // cursor mode'da count kerak emas — extra DB work oldini olamiz
    let messages: ChatMessage[];
    let total: number | undefined;
    if (cursor) {
      messages = await query.getMany();
      total = undefined;
    } else {
      [messages, total] = await query.getManyAndCount();
    }

    if (messages.length === 0) {
      return { data: [], total, page: cursor ? undefined : page, limit: l };
    }

    const msgIds = messages.map((m) => m.id);
    // Fix: OR chain o'rniga bitta IN query
    const reactions = await this.reactionRepo
      .createQueryBuilder('r')
      .where('r.message_id IN (:...msgIds)', { msgIds })
      .getMany();

    const reactionsByMsg = new Map<string, ChatReaction[]>();
    for (const r of reactions) {
      if (!reactionsByMsg.has(r.messageId)) reactionsByMsg.set(r.messageId, []);
      reactionsByMsg.get(r.messageId)!.push(r);
    }

    const attachments = await this.attachmentRepo
      .createQueryBuilder('a')
      .where('a.message_id IN (:...msgIds)', { msgIds })
      .getMany();

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
      sender: msg.sender
        ? {
            id: msg.sender.id,
            firstName: msg.sender.firstName,
            lastName: msg.sender.lastName,
            avatarUrl: msg.sender.avatarUrl,
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
  private async assertNotFlooding(userId: string, roomId: string): Promise<void> {
    const redisClient = this.redisService.getClient();
    if (!redisClient) return;

    const WINDOW_SECONDS = 10;
    const MAX_MESSAGES = 12; // ~1.2 msg/sec sustained is already very fast for a human typist

    const key = `flood:chat:${userId}:${roomId}`;
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, WINDOW_SECONDS);
    }

    if (count > MAX_MESSAGES) {
      await this.violationService.assertNotBlocked(userId);
      await this.violationService.recordViolation(userId, 'spam', 'message flood (too many messages in a short time)');
      throw new BadRequestException({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'You are sending messages too fast. Please slow down.',
      });
    }
  }

  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const room = await this.roomRepo.findOne({ where: { id: roomId }, select: ['id', 'isReadOnly'] });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    // assertRoomMemberWithUser: membership + user bir SELECT'da — keyinroq sender uchun alohida query yo'q
    const member = await this.chatMemberService.assertRoomMemberWithUser(roomId, userId);
    if (room.isReadOnly) throw new ForbiddenException({ code: ErrorCode.ROOM_READ_ONLY, message: 'Room is read-only' });

    const hasAttachments = !!dto.attachments?.length;
    if (!dto.content?.trim() && !hasAttachments) {
      throw new BadRequestException({ code: ErrorCode.MESSAGE_EMPTY, message: 'Message content is required' });
    }

    await this.assertNotFlooding(userId, roomId);

    if (dto.content?.trim()) {
      await this.contentFilter.filterText(dto.content, userId, 'chat');
    }

    // 1. Idempotency Check
    if (dto.clientMessageId) {
      const existing = await this.messageRepo.findOne({
        where: { roomId, senderId: userId, clientMessageId: dto.clientMessageId },
        relations: ['sender']
      });
      if (existing) {
        // Return existing to prevent duplicate
        const existingAttachments = await this.attachmentRepo.find({ where: { messageId: existing.id } });
        return this.mapToResponse(existing, existing.content ?? '', existingAttachments);
      }
    }

    // 2. Redis Sequence (Atomic)
    const redisClient = this.redisService.getClient();
    let sequence = 1;
    if (redisClient) {
      sequence = await redisClient.incr(`room:${roomId}:seq`);
    } else {
      // Fallback if Redis is down
      const maxRes = await this.messageRepo.createQueryBuilder('msg')
        .select('MAX(msg.sequence)', 'max')
        .where('msg.room_id = :roomId', { roomId })
        .getRawOne();
      sequence = (maxRes?.max || 0) + 1;
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

    const msg = this.messageRepo.create({
      roomId,
      senderId: userId,
      sequence,
      clientMessageId: dto.clientMessageId,
      content: contentToSave,
      contentJson,
      contentType,
      replyToId: dto.replyToId,
      metadata: {}, // Extract mentions here if needed
    });
    const saved = await this.messageRepo.save(msg);

    // 3b. Persist attachments (already uploaded to R2 via /chat/rooms/:roomId/attachments/presign)
    let savedAttachments: MessageAttachment[] = [];
    if (hasAttachments) {
      const rows = dto.attachments!.map((a) =>
        this.attachmentRepo.create({
          messageId: saved.id,
          uploaderId: userId,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          storageKey: a.storageKey,
          storageUrl: a.storageUrl,
          width: a.width ?? null,
          height: a.height ?? null,
        }),
      );
      savedAttachments = await this.attachmentRepo.save(rows);
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

    // Fix: sender'ni DB'dan qayta yuklamaymiz — assertRoomMember (yuqorida) relations: ['user'] bilan
    // chaqirilgan, shuning uchun alohida SELECT yo'q.
    const senderUser = (member as any).user ?? null;

    return this.mapToResponseWithSender(saved, plainText, senderUser, savedAttachments);
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);
    if (msg.senderId !== userId)
      throw new ForbiddenException({ code: ErrorCode.CANNOT_DELETE_MESSAGE, message: 'You can only delete your own messages' });
    applySoftDelete(msg);
    await this.messageRepo.save(msg);
  }

  async updateMessage(messageId: string, userId: string, dto: UpdateMessageDto) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.deletedAt) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);
    
    if (msg.senderId !== userId)
      throw new ForbiddenException({ code: ErrorCode.CANNOT_EDIT_MESSAGE, message: 'You can only edit your own messages' });
      
    if (msg.contentType === 'document') {
      throw new ForbiddenException({ code: ErrorCode.CANNOT_EDIT_MESSAGE, message: 'Long document messages cannot be edited' });
    }

    const plainText = dto.content.trim();
    if (this.chatEncryption.isEnabled()) {
      msg.contentJson = this.chatEncryption.encrypt(plainText);
      msg.content = '';
    } else {
      msg.content = plainText;
      msg.contentJson = null;
    }
    msg.isEdited = true;
    msg.editedAt = new Date();
    const saved = await this.messageRepo.save(msg);
    return { ...saved, content: plainText, editedAt: saved.editedAt };
  }

  private mapToResponse(msg: ChatMessage, decryptedContent: string, attachments: MessageAttachment[] = []) {
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

  private mapToResponseWithSender(msg: ChatMessage, decryptedContent: string, sender: any, attachments: MessageAttachment[] = []) {
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