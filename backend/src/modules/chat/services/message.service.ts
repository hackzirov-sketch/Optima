import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { ChatReactionService } from './reaction.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
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
    
    const query = this.messageRepo.createQueryBuilder('msg')
      .where('msg.room_id = :roomId', { roomId })
      .andWhere('msg.is_deleted = false')
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

  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const room = await this.roomRepo.findOne({ where: { id: roomId }, select: ['id', 'isReadOnly'] });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    // assertRoomMemberWithUser: membership + user bir SELECT'da — keyinroq sender uchun alohida query yo'q
    const member = await this.chatMemberService.assertRoomMemberWithUser(roomId, userId);
    if (room.isReadOnly) throw new ForbiddenException({ code: ErrorCode.ROOM_READ_ONLY, message: 'Room is read-only' });

    if (!dto.content?.trim()) {
      throw new BadRequestException({ code: ErrorCode.MESSAGE_EMPTY, message: 'Message content is required' });
    }

    await this.contentFilter.filterText(dto.content, userId, 'chat');

    // 1. Idempotency Check
    if (dto.clientMessageId) {
      const existing = await this.messageRepo.findOne({
        where: { roomId, senderId: userId, clientMessageId: dto.clientMessageId },
        relations: ['sender']
      });
      if (existing) {
        // Return existing to prevent duplicate
        return this.mapToResponse(existing, existing.content ?? '');
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

    const plainText = dto.content.trim();
    let contentToSave = plainText;
    let contentType = 'text';
    let contentJson: any = null;

    // 3. Length check (4096)
    if (plainText.length > 4096) {
      contentType = 'document';
      const key = `chat-long-messages/${uuidv4()}.txt`;
      const buffer = Buffer.from(plainText, 'utf-8');
      const { url } = await this.storageService.uploadBuffer(buffer, key, 'text/plain');
      
      contentToSave = plainText.substring(0, 150) + '...'; // Preview
      contentJson = { documentUrl: url, key }; // Store URL in JSON
    } else {
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

    return this.mapToResponseWithSender(saved, plainText, senderUser);
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
    if (!msg || msg.isDeleted) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
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

  private mapToResponse(msg: ChatMessage, decryptedContent: string) {
    return this.mapToResponseWithSender(msg, decryptedContent, msg.sender ?? null);
  }

  private mapToResponseWithSender(msg: ChatMessage, decryptedContent: string, sender: any) {
    return {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      sequence: msg.sequence,
      clientMessageId: msg.clientMessageId,
      metadata: msg.metadata,
      content: msg.contentType === 'document' ? msg.content : decryptedContent,
      contentType: msg.contentType ?? 'text',
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