import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { AddReactionDto } from '../dto/add-reaction.dto';

@Injectable()
export class ChatReactionService {
  constructor(
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatReaction) private readonly reactionRepo: Repository<ChatReaction>,
    @InjectRepository(ChatMember) private readonly memberRepo: Repository<ChatMember>,
  ) {}

  groupReactions(reactions: ChatReaction[]): { emoji: string; userIds: string[] }[] {
    const map = new Map<string, string[]>();
    for (const r of reactions) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
  }

  async addReaction(messageId: string, userId: string, dto: AddReactionDto) {
    // 1. message topish
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) {
      throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    }

    // 2. member check va existing reaction — parallel (roomId endi ma'lum)
    const [memberRecord, existing] = await Promise.all([
      this.memberRepo.findOne({ where: { roomId: msg.roomId, userId, leftAt: IsNull() } }),
      this.reactionRepo.findOne({ where: { messageId, userId, emoji: dto.emoji } }),
    ]);

    if (!memberRecord) {
      throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    }

    if (existing) return existing;

    return this.reactionRepo.save(
      this.reactionRepo.create({ messageId, userId, emoji: dto.emoji }),
    );
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.reactionRepo.delete({ messageId, userId, emoji });
  }

  async toggleReaction(messageId: string, userId: string, emoji: string): Promise<'added' | 'removed'> {
    // 1. message topish
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) {
      throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    }

    // 2. member va existing reaction — parallel (roomId endi ma'lum)
    const [memberRecord, existing] = await Promise.all([
      this.memberRepo.findOne({ where: { roomId: msg.roomId, userId, leftAt: IsNull() } }),
      this.reactionRepo.findOne({ where: { messageId, userId, emoji } }),
    ]);

    if (!memberRecord) {
      throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    }

    if (existing) {
      await this.reactionRepo.delete({ messageId, userId, emoji });
      return 'removed';
    }

    await this.reactionRepo.save(this.reactionRepo.create({ messageId, userId, emoji }));
    return 'added';
  }
}