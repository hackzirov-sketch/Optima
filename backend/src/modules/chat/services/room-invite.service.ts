import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { ChatRoomInvite } from '../../../database/entities/chat-room-invite.entity';
import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { PermissionService } from '../../../common/services/permission.service';
import { MembersService } from '../../workspaces/members.service';
import { ChatMemberService } from './member.service';
import { ChatRoomService } from './room.service';
import { CreateRoomInviteDto } from '../dto/create-room-invite.dto';

export interface RoomInviteDto {
  id: string;
  roomId: string;
  code: string;
  createdById: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  isActive: boolean;
}

@Injectable()
export class ChatRoomInviteService {
  constructor(
    @InjectRepository(ChatRoomInvite)
    private readonly inviteRepo: Repository<ChatRoomInvite>,
    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMember)
    private readonly chatMemberRepo: Repository<ChatMember>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    private readonly permission: PermissionService,
    private readonly wsMembersService: MembersService,
    private readonly chatMemberService: ChatMemberService,
    private readonly roomService: ChatRoomService,
  ) {}

  private toDto(invite: ChatRoomInvite): RoomInviteDto {
    const now = new Date();
    const isActive =
      !invite.revokedAt &&
      (!invite.expiresAt || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.usesCount < invite.maxUses);

    return {
      id: invite.id,
      roomId: invite.roomId,
      code: invite.code,
      createdById: invite.createdById,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      expiresAt: invite.expiresAt,
      revokedAt: invite.revokedAt,
      createdAt: invite.createdAt,
      isActive,
    };
  }

  /**
   * Generatsiya ruxsati: assertCanCreateChatRoom darajasi (lead+) yoki room
   * creator. Aks holda → ROOM_INVITE_FORBIDDEN (system design v2 §4.1).
   */
  private async assertCanManageInvites(room: ChatRoom, userId: string): Promise<void> {
    if (room.createdById === userId) return;

    const wsMember = await this.wsMemberRepo.findOne({
      where: { workspaceId: room.workspaceId, userId },
    });
    if (!wsMember) {
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
    }
    try {
      this.permission.assertCanCreateChatRoom(wsMember);
    } catch {
      throw new ForbiddenException({
        code: ErrorCode.ROOM_INVITE_FORBIDDEN,
        message: 'Only the room creator or a lead/admin/owner can manage invite links',
      });
    }
  }

  private async generateUniqueCode(): Promise<string> {
    const { randomBytes } = await import('crypto');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(6).toString('base64url').slice(0, 8);
      const existing = await this.inviteRepo.findOne({ where: { code } });
      if (!existing) return code;
    }
    throw new BadRequestException({ code: ErrorCode.INTERNAL_ERROR, message: 'Could not generate a unique invite code, try again' });
  }

  async create(roomId: string, userId: string, dto: CreateRoomInviteDto): Promise<RoomInviteDto> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });

    await this.chatMemberService.assertRoomMember(roomId, userId);
    await this.assertCanManageInvites(room, userId);

    const code = await this.generateUniqueCode();
    let expiresAt: Date | null = null;
    if (dto.expiresInHours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + dto.expiresInHours);
    }

    const invite = this.inviteRepo.create({
      roomId,
      createdById: userId,
      code,
      maxUses: dto.maxUses ?? null,
      expiresAt,
    });
    const saved = await this.inviteRepo.save(invite);
    return this.toDto(saved);
  }

  async list(roomId: string, userId: string): Promise<RoomInviteDto[]> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });

    await this.assertCanManageInvites(room, userId);

    const invites = await this.inviteRepo.find({
      where: { roomId },
      order: { createdAt: 'DESC' },
    });
    return invites.map((i) => this.toDto(i));
  }

  async revoke(roomId: string, inviteId: string, userId: string): Promise<void> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });

    await this.assertCanManageInvites(room, userId);

    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, roomId } });
    if (!invite) throw new NotFoundException({ code: ErrorCode.ROOM_INVITE_NOT_FOUND, message: 'Invite not found' });
    if (invite.revokedAt) return;

    invite.revokedAt = new Date();
    await this.inviteRepo.save(invite);
  }

  async joinByCode(code: string, userId: string) {
    const invite = await this.inviteRepo.findOne({ where: { code, revokedAt: IsNull() } });
    if (!invite) {
      throw new NotFoundException({ code: ErrorCode.INVITE_CODE_INVALID, message: 'Invalid invite link' });
    }
    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      throw new BadRequestException({ code: ErrorCode.INVITE_CODE_EXPIRED, message: 'This invite link has expired' });
    }
    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new BadRequestException({ code: ErrorCode.INVITE_CODE_EXHAUSTED, message: 'This invite link has reached its usage limit' });
    }

    const room = await this.roomRepo.findOne({ where: { id: invite.roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });

    const existing = await this.chatMemberRepo.findOne({
      where: { roomId: room.id, userId, leftAt: IsNull() },
    });
    if (existing) return this.roomService.enrichRoom(room, userId);

    // Joining a room requires workspace membership; chat invites don't bypass
    // workspace access control, only room-level access within the workspace.
    await this.wsMembersService.assertMember(room.workspaceId, userId);

    const member = this.chatMemberRepo.create({ roomId: room.id, userId });
    await this.chatMemberRepo.save(member);

    // Atomic increment to avoid race conditions on concurrent joins.
    await this.inviteRepo.increment({ id: invite.id }, 'usesCount', 1);

    return this.roomService.enrichRoom(room, userId);
  }
}
