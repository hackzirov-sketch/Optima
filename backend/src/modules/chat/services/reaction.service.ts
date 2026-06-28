import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatMemberService } from './member.service';
import { AddReactionDto } from '../dto/add-reaction.dto';

@Injectable()
export class ChatReactionService {
  constructor(
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatReaction) private readonly reactionRepo: Repository<ChatReaction>,
    private readonly chatMemberService: ChatMemberService,
  ) {}

  groupReactions(reactions: ChatReaction[]): { emoji: string; userIds: string[] }[] {
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

  async addReaction(messageId: string, userId: string, dto: AddReactionDto) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji: dto.emoji },
    });
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
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji },
    });
    if (existing) {
      await this.reactionRepo.delete({ messageId, userId, emoji });
      return 'removed';
    }

    await this.reactionRepo.save(this.reactionRepo.create({ messageId, userId, emoji }));
    return 'added';
  }
}
