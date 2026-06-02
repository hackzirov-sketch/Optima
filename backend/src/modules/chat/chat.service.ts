import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { ChatReaction } from '../../database/entities/chat-reaction.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Group } from '../../database/entities/group.entity';
import { Project } from '../../database/entities/project.entity';

import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { applySoftDelete } from '../../common/utils/soft-delete';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMember)
    private readonly memberRepo: Repository<ChatMember>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatReaction)
    private readonly reactionRepo: Repository<ChatReaction>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  private async assertWsMember(workspaceId: string, userId: string) {
    const m = await this.wsMemberRepo.findOne({
      where: { workspaceId, userId },
    });
    if (!m) throw new ForbiddenException('Not a workspace member');
    return m;
  }

  private async assertRoomMember(
    roomId: string,
    userId: string,
  ): Promise<ChatMember> {
    const cm = await this.memberRepo.findOne({
      where: { roomId, userId, leftAt: IsNull() },
    });
    if (!cm) throw new ForbiddenException('Not a member of this chat room');
    return cm;
  }

  async listRooms(workspaceId: string, userId: string) {
    await this.assertWsMember(workspaceId, userId);
    const memberships = await this.memberRepo.find({
      where: { userId, leftAt: IsNull() },
      relations: ['room'],
    });
    return memberships
      .map((m) => m.room)
      .filter((r) => r && r.workspaceId === workspaceId);
  }

  async createRoom(
    workspaceId: string,
    userId: string,
    dto: CreateChatRoomDto,
  ) {
    await this.assertWsMember(workspaceId, userId);

    if (dto.groupId) {
      const g = await this.groupRepo.findOne({
        where: { id: dto.groupId, workspaceId },
      });
      if (!g) throw new BadRequestException('Group not in this workspace');
    }
    if (dto.projectId) {
      const p = await this.projectRepo.findOne({
        where: { id: dto.projectId, workspaceId },
      });
      if (!p) throw new BadRequestException('Project not in this workspace');
    }

    const room = this.roomRepo.create({
      workspaceId,
      type: dto.type,
      name: dto.name,
      groupId: dto.groupId,
      projectId: dto.projectId,
      createdById: userId,
    });
    const saved = await this.roomRepo.save(room);

    await this.memberRepo.save(
      this.memberRepo.create({ roomId: saved.id, userId }),
    );

    return saved;
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    await this.assertWsMember(room.workspaceId, userId);
    await this.assertRoomMember(roomId, userId);
    return room;
  }

  async listMessages(roomId: string, userId: string, page = 1, limit = 50) {
    await this.getRoom(roomId, userId);
    const [data, total] = await this.messageRepo.findAndCount({
      where: { roomId, isDeleted: false },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    await this.assertRoomMember(roomId, userId);
    if (room.isReadOnly) throw new ForbiddenException('Room is read-only');

    if (!dto.content?.trim()) {
      throw new BadRequestException('Message content is required');
    }

    const msg = this.messageRepo.create({
      roomId,
      senderId: userId,
      content: dto.content.trim(),
      replyToId: dto.replyToId,
    });
    const saved = await this.messageRepo.save(msg);

    await this.roomRepo.update(roomId, {
      lastMessageId: saved.id,
      lastMessageAt: saved.createdAt,
    });

    return saved;
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.assertRoomMember(msg.roomId, userId);
    if (msg.senderId !== userId)
      throw new ForbiddenException('You can only delete your own messages');
    applySoftDelete(msg);
    await this.messageRepo.save(msg);
  }

  async updateMessage(
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException('Message not found');
    await this.assertRoomMember(msg.roomId, userId);
    if (msg.senderId !== userId)
      throw new ForbiddenException('You can only edit your own messages');
    msg.content = dto.content;
    msg.isEdited = true;
    return this.messageRepo.save(msg);
  }

  async addReaction(messageId: string, userId: string, dto: AddReactionDto) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException('Message not found');
    await this.assertRoomMember(msg.roomId, userId);

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
    if (!msg) throw new NotFoundException('Message not found');
    await this.reactionRepo.delete({ messageId, userId, emoji });
  }

  /** Toggle reaction for WebSocket clients (same semantics as REST add/remove). */
  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<'added' | 'removed'> {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException('Message not found');
    await this.assertRoomMember(msg.roomId, userId);

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji },
    });
    if (existing) {
      await this.reactionRepo.delete({ messageId, userId, emoji });
      return 'removed';
    }

    await this.reactionRepo.save(
      this.reactionRepo.create({ messageId, userId, emoji }),
    );
    return 'added';
  }
}
