import {
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkspaceInvitation } from '../../database/entities/workspace-invitation.entity';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { User } from '../../database/entities/user.entity';
import { InviteMemberDto } from './dto/invite-member.dto';
import { WorkspaceRole, ChatRoomType } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums';
import * as crypto from 'crypto';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepo: Repository<WorkspaceInvitation>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMember)
    private readonly chatMemberRepo: Repository<ChatMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    workspaceId: string,
    inviterId: string,
    dto: InviteMemberDto,
  ): Promise<WorkspaceInvitation> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException({ code: ErrorCode.WORKSPACE_NOT_FOUND, message: 'Workspace not found' });

    const inviter = await this.memberRepo.findOne({
      where: { workspaceId, userId: inviterId },
    });
    if (
      !inviter ||
      (inviter.role !== WorkspaceRole.OWNER &&
        inviter.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Not authorized to invite members',
      });
    }

    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      const alreadyMember = await this.memberRepo.findOne({
        where: { workspaceId, userId: existingUser.id },
      });
      if (alreadyMember) {
        throw new ConflictException({
          code: ErrorCode.ALREADY_MEMBER,
          message: 'User is already a member of this workspace',
        });
      }
    }

    const existingInvite = await this.invitationRepo
      .createQueryBuilder('i')
      .where('i.workspaceId = :workspaceId', { workspaceId })
      .andWhere('i.email = :email', { email: dto.email })
      .andWhere('i.acceptedAt IS NULL')
      .andWhere('i.declinedAt IS NULL')
      .getOne();

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      // Already invited
      return existingInvite;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 5); // 5 days

    const invitation = this.invitationRepo.create({
      workspaceId,
      invitedById: inviterId,
      email: dto.email,
      role: dto.role,
      token,
      expiresAt,
    });

    const saved = await this.invitationRepo.save(invitation);
    await this.mailService.sendInvitationEmail(dto.email, token, workspace.name);

    // Real-time notification to invited user (if they have an account)
    if (existingUser) {
      await this.notificationsService.create({
        userId: existingUser.id,
        actorId: inviterId,
        type: NotificationType.WORKSPACE_INVITE,
        title: `You've been invited to "${workspace.name}"`,
        message: `Accept the invitation to join the workspace.`,
        entityType: 'workspace',
        entityId: workspaceId,
        actionUrl: `/auth/accept-invite?token=${token}`,
      });
    }

    return saved;
  }

  async findAllForWorkspace(
    workspaceId: string,
    requesterId: string,
  ): Promise<WorkspaceInvitation[]> {
    const requester = await this.memberRepo.findOne({
      where: { workspaceId, userId: requesterId },
    });
    if (!requester) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'You are not a member of this workspace',
      });
    }
    return this.invitationRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async accept(token: string, userId: string): Promise<WorkspaceMember> {
    const invitation = await this.invitationRepo.findOne({
      where: { token },
      relations: ['workspace'],
    });

    if (!invitation) {
      throw new NotFoundException({
        code: ErrorCode.INVITATION_NOT_FOUND,
        message: 'Invitation not found',
      });
    }

    if (invitation.acceptedAt) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_ALREADY_ACCEPTED,
        message: 'Invitation already accepted',
      });
    }

    if (invitation.expiresAt < new Date()) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_EXPIRED,
        message: 'Invitation has expired',
      });
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.email !== invitation.email) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_EMAIL_MISMATCH,
        message: 'Invitation email does not match user email',
      });
    }

    const alreadyMember = await this.memberRepo.findOne({
      where: { workspaceId: invitation.workspaceId, userId },
    });
    if (alreadyMember) {
      throw new ConflictException({
        code: ErrorCode.ALREADY_MEMBER,
        message: 'User is already a member',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      invitation.acceptedAt = new Date();
      await queryRunner.manager.save(invitation);

      const newMember = this.memberRepo.create({
        workspaceId: invitation.workspaceId,
        userId: userId,
        role: invitation.role,
      });
      const savedMember = await queryRunner.manager.save(newMember);

      // Auto-join all workspace-scoped channels (e.g. #general)
      const wsRooms = await this.chatRoomRepo.find({
        where: { workspaceId: invitation.workspaceId, type: ChatRoomType.WORKSPACE },
        select: ['id'],
      });
      for (const room of wsRooms) {
        const alreadyIn = await this.chatMemberRepo.findOne({
          where: { roomId: room.id, userId },
        });
        if (!alreadyIn) {
          await queryRunner.manager.save(
            this.chatMemberRepo.create({ roomId: room.id, userId }),
          );
        }
      }

      await queryRunner.commitTransaction();

      // Notify the inviter that the invitation was accepted
      if (invitation.invitedById && invitation.invitedById !== userId) {
        const userName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
        await this.notificationsService.create({
          userId: invitation.invitedById,
          actorId: userId,
          type: NotificationType.WORKSPACE_INVITE,
          title: `${userName} accepted your invitation`,
          message: `They joined "${invitation.workspace.name}".`,
          entityType: 'workspace',
          entityId: invitation.workspaceId,
          actionUrl: `/app/teams`,
        });
      }

      return savedMember;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to accept invitation', (error as Error)?.stack);
      throw new InternalServerErrorException({ code: ErrorCode.INTERNAL_ERROR, message: 'Failed to accept invitation' });
    } finally {
      await queryRunner.release();
    }
  }

  async decline(token: string, userId: string): Promise<void> {
    const invitation = await this.invitationRepo.findOne({ where: { token } });

    if (!invitation) {
      throw new NotFoundException({
        code: ErrorCode.INVITATION_NOT_FOUND,
        message: 'Invitation not found',
      });
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.email !== invitation.email) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_EMAIL_MISMATCH,
        message: 'Invitation email does not match user email',
      });
    }

    invitation.declinedAt = new Date();
    await this.invitationRepo.save(invitation);
  }

  async remove(
    workspaceId: string,
    id: string,
    requesterId: string,
  ): Promise<void> {
    const inviter = await this.memberRepo.findOne({
      where: { workspaceId, userId: requesterId },
    });
    if (
      !inviter ||
      (inviter.role !== WorkspaceRole.OWNER &&
        inviter.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Not authorized to delete invitations',
      });
    }

    const invitation = await this.invitationRepo.findOne({
      where: { id, workspaceId },
    });
    if (!invitation) throw new NotFoundException({ code: ErrorCode.INVITATION_NOT_FOUND, message: 'Invitation not found' });

    await this.invitationRepo.remove(invitation);
  }
}