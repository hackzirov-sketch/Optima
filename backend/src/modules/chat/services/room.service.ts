import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, MoreThan } from 'typeorm';

import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { Group } from '../../../database/entities/group.entity';
import { Project } from '../../../database/entities/project.entity';
import { ChatRoomType } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { MembersService } from '../../workspaces/members.service';
import { CreateChatRoomDto } from '../dto/create-chat-room.dto';

export interface ChatRoomDto {
  id: string;
  workspaceId: string;
  type: ChatRoomType;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  isArchived: boolean;
  isReadOnly: boolean;
  isPublic: boolean;
  inviteCode: string | null;
  isMember: boolean;
  groupId: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  memberIds: string[];
  memberCount: number;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    senderName: string | null;
    createdAt: Date;
  } | null;
  unreadCount: number;
}

@Injectable()
export class ChatRoomService {
  constructor(
    @InjectRepository(ChatRoom) private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMember) private readonly chatMemberRepo: Repository<ChatMember>,
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(Group) private readonly groupRepo: Repository<Group>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    private readonly wsMembersService: MembersService,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatEncryption: ChatEncryptionService,
  ) {}

  async enrichRoom(room: ChatRoom, userId: string): Promise<ChatRoomDto> {
    const members = await this.chatMemberRepo.find({
      where: { roomId: room.id, leftAt: IsNull() },
      select: ['userId', 'lastReadSeq'],
    });

    const myMembership = members.find((m) => m.userId === userId);
    let unreadCount = 0;
    if (myMembership) {
      unreadCount = Math.max(0, room.messageSeq - myMembership.lastReadSeq);
    }

    let lastMessage: ChatRoomDto['lastMessage'] = null;
    if (room.lastMessageId) {
      const msg = await this.messageRepo.findOne({
        where: { id: room.lastMessageId },
        relations: ['sender'],
      });
      if (msg) {
        lastMessage = {
          id: msg.id,
          content: this.chatEncryption.safeDecrypt(msg.contentJson, msg.content ?? ''),
          senderId: msg.senderId,
          senderName: msg.sender
            ? `${msg.sender.firstName ?? ''} ${msg.sender.lastName ?? ''}`.trim()
            : null,
          createdAt: msg.createdAt,
        };
      }
    }

    return {
      id: room.id,
      workspaceId: room.workspaceId,
      type: room.type,
      name: room.name ?? null,
      avatarUrl: room.avatarUrl ?? null,
      description: room.description ?? null,
      isArchived: room.isArchived,
      isReadOnly: room.isReadOnly,
      isPublic: room.isPublic,
      inviteCode: room.inviteCode ?? null,
      groupId: room.groupId ?? null,
      projectId: room.projectId ?? null,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberIds: members.map((m) => m.userId),
      memberCount: members.length,
      lastMessage,
      unreadCount,
      isMember: true,
    };
  }

  async listRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    const memberships = await this.chatMemberRepo.find({
      where: { userId, leftAt: IsNull() },
      relations: ['room'],
    });

    const myRooms = memberships
      .map((m) => m.room)
      .filter((r) => r && r.workspaceId === workspaceId);

    if (myRooms.length === 0) return [];

    const roomIds = myRooms.map((r) => r.id);

    const allMembers = await this.chatMemberRepo.find({
      where: { roomId: In(roomIds), leftAt: IsNull() },
      select: ['roomId', 'userId'],
    });

    const membersByRoom = new Map<string, string[]>();
    for (const m of allMembers) {
      if (!membersByRoom.has(m.roomId)) membersByRoom.set(m.roomId, []);
      membersByRoom.get(m.roomId)!.push(m.userId);
    }

    const lastMsgIds = myRooms
      .map((r) => r.lastMessageId)
      .filter(Boolean) as string[];

    const lastMessages = lastMsgIds.length > 0
        ? await this.messageRepo.find({
            where: { id: In(lastMsgIds) },
            relations: ['sender'],
          })
        : [];
    const lastMsgMap = new Map(lastMessages.map((m) => [m.id, m]));
    const membershipMap = new Map(memberships.map((m) => [m.roomId, m]));

    return myRooms.map((room) => {
      const roomMemberIds = membersByRoom.get(room.id) ?? [];
      const myMembership = membershipMap.get(room.id);
      
      const unreadCount = myMembership ? Math.max(0, room.messageSeq - myMembership.lastReadSeq) : 0;

      const lastMsg = room.lastMessageId ? lastMsgMap.get(room.lastMessageId) : null;

      return {
        id: room.id,
        workspaceId: room.workspaceId,
        type: room.type,
        name: room.name ?? null,
        avatarUrl: room.avatarUrl ?? null,
        description: room.description ?? null,
        isArchived: room.isArchived,
        isReadOnly: room.isReadOnly,
        isPublic: room.isPublic,
        inviteCode: room.inviteCode ?? null,
        groupId: room.groupId ?? null,
        projectId: room.projectId ?? null,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        memberIds: roomMemberIds,
        memberCount: roomMemberIds.length,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              content: this.chatEncryption.safeDecrypt(lastMsg.contentJson, lastMsg.content ?? ''),
              senderId: lastMsg.senderId,
              senderName: lastMsg.sender
                ? `${lastMsg.sender.firstName ?? ''} ${lastMsg.sender.lastName ?? ''}`.trim()
                : null,
              createdAt: lastMsg.createdAt,
            }
          : null,
        unreadCount,
        isMember: true,
      };
    });
  }

  async listPublicRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    const memberRoomIds = (await this.chatMemberRepo.find({
      where: { userId, leftAt: IsNull() },
      select: ['roomId'],
    })).map((m) => m.roomId);

    const publicRooms = await this.roomRepo.find({
      where: { workspaceId, isPublic: true, isArchived: false },
    });

    const nonMemberRooms = publicRooms.filter((r) => !memberRoomIds.includes(r.id));
    return nonMemberRooms.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      type: r.type,
      name: r.name ?? null,
      avatarUrl: r.avatarUrl ?? null,
      description: r.description ?? null,
      isPublic: true,
      isArchived: false,
      isReadOnly: r.isReadOnly,
      groupId: r.groupId ?? null,
      projectId: r.projectId ?? null,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      memberIds: [],
      memberCount: 0,
      lastMessage: null,
      unreadCount: 0,
      isMember: false,
    }));
  }

  async joinPublicRoom(roomId: string, userId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    if (!room.isPublic) throw new ForbiddenException({ code: ErrorCode.ROOM_NOT_PUBLIC, message: 'Room is not public' });

    const existing = await this.chatMemberRepo.findOne({ where: { roomId, userId, leftAt: IsNull() } });
    if (existing) throw new BadRequestException({ code: ErrorCode.ALREADY_ROOM_MEMBER, message: 'Already a member' });

    const member = this.chatMemberRepo.create({ roomId, userId });
    await this.chatMemberRepo.save(member);
    return this.enrichRoom(room, userId);
  }

  async getOrCreateInviteCode(roomId: string, userId: string): Promise<{ code: string }> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });

    await this.chatMemberService.assertRoomMember(roomId, userId);
    
    if (room.createdById !== userId && room.type !== ChatRoomType.GROUP) {
      throw new ForbiddenException({ code: ErrorCode.ROOM_INVITE_FORBIDDEN, message: 'Only the creator can manage invite links' });
    }

    if (room.inviteCode) return { code: room.inviteCode };

    const { randomBytes } = await import('crypto');
    const code = randomBytes(9).toString('base64url').slice(0, 12);
    await this.roomRepo.update(roomId, { inviteCode: code });
    return { code };
  }

  async revokeInviteCode(roomId: string, userId: string): Promise<void> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    if (room.createdById !== userId)
      throw new ForbiddenException({ code: ErrorCode.ROOM_INVITE_FORBIDDEN, message: 'Only the creator can revoke invite links' });
    await this.roomRepo.update(roomId, { inviteCode: null });
  }

  async joinByInviteCode(code: string, userId: string) {
    const room = await this.roomRepo.findOne({ where: { inviteCode: code } });
    if (!room) throw new NotFoundException({ code: ErrorCode.INVITE_CODE_INVALID, message: 'Invalid invite link' });

    const existing = await this.chatMemberRepo.findOne({ where: { roomId: room.id, userId, leftAt: IsNull() } });
    if (existing) return this.enrichRoom(room, userId);

    await this.wsMembersService.assertMember(room.workspaceId, userId);

    const member = this.chatMemberRepo.create({ roomId: room.id, userId });
    await this.chatMemberRepo.save(member);
    return this.enrichRoom(room, userId);
  }

  async updateRoomSettings(roomId: string, userId: string, dto: { isPublic?: boolean; name?: string; description?: string }) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    await this.chatMemberService.assertRoomMember(roomId, userId);
    if (room.createdById !== userId)
      throw new ForbiddenException({ code: ErrorCode.ROOM_INVITE_FORBIDDEN, message: 'Only the creator can update room settings' });

    if (dto.isPublic !== undefined) room.isPublic = dto.isPublic;
    if (dto.name !== undefined) room.name = dto.name;
    if (dto.description !== undefined) room.description = dto.description;
    await this.roomRepo.save(room);
    return this.enrichRoom(room, userId);
  }

  async createRoom(workspaceId: string, userId: string, dto: CreateChatRoomDto) {
    await this.wsMembersService.assertMember(workspaceId, userId);

    if (dto.type === ChatRoomType.DIRECT) {
      if (!dto.targetUserId) throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'targetUserId is required for direct rooms' });
      if (dto.targetUserId === userId) throw new BadRequestException({ code: ErrorCode.DM_WITH_SELF, message: 'Cannot create a DM with yourself' });
      await this.wsMembersService.assertMember(workspaceId, dto.targetUserId);

      const existing = await this.roomRepo
        .createQueryBuilder('r')
        .innerJoin('chat_members', 'cm1', 'cm1.room_id = r.id AND cm1.user_id = :userId AND cm1.left_at IS NULL', { userId })
        .innerJoin('chat_members', 'cm2', 'cm2.room_id = r.id AND cm2.user_id = :targetId AND cm2.left_at IS NULL', { targetId: dto.targetUserId })
        .where('r.workspace_id = :workspaceId', { workspaceId })
        .andWhere('r.type = :type', { type: ChatRoomType.DIRECT })
        .getOne();

      if (existing) return this.enrichRoom(existing, userId);
    }

    if (dto.groupId) {
      const g = await this.groupRepo.findOne({ where: { id: dto.groupId, workspaceId } });
      if (!g) throw new BadRequestException({ code: ErrorCode.GROUP_NOT_FOUND, message: 'Group not in this workspace' });
    }
    if (dto.projectId) {
      const p = await this.projectRepo.findOne({ where: { id: dto.projectId, workspaceId } });
      if (!p) throw new BadRequestException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not in this workspace' });
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

    await this.chatMemberRepo.save(this.chatMemberRepo.create({ roomId: saved.id, userId }));

    if (dto.type === ChatRoomType.DIRECT && dto.targetUserId) {
      await this.chatMemberRepo.save(this.chatMemberRepo.create({ roomId: saved.id, userId: dto.targetUserId }));
    }

    if (dto.type !== ChatRoomType.DIRECT && dto.memberIds?.length) {
      const others = dto.memberIds.filter((id) => id !== userId);
      if (others.length) {
        await this.chatMemberRepo.save(others.map((id) => this.chatMemberRepo.create({ roomId: saved.id, userId: id })));
      }
    }

    return this.enrichRoom(saved, userId);
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    await this.chatMemberService.assertRoomMember(roomId, userId);
    return this.enrichRoom(room, userId);
  }
}
