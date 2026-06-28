import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';

@Injectable()
export class ChatMemberService {
  constructor(
    @InjectRepository(ChatMember)
    private readonly memberRepo: Repository<ChatMember>,
  ) {}

  async assertRoomMember(roomId: string, userId: string): Promise<ChatMember> {
    const cm = await this.memberRepo.findOne({
      where: { roomId, userId, leftAt: IsNull() },
    });
    if (!cm) throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    return cm;
  }
}
