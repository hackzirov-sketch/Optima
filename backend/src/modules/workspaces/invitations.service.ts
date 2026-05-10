import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { WorkspaceInvitation } from '../../database/entities/workspace-invitation.entity';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { InviteMemberDto } from './dto/invite-member.dto';
import { WorkspaceRole } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import * as crypto from 'crypto';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepo: Repository<WorkspaceInvitation>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(workspaceId: string, inviterId: string, dto: InviteMemberDto): Promise<WorkspaceInvitation> {
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const inviter = await this.memberRepo.findOne({ where: { workspaceId, userId: inviterId } });
    if (!inviter || (inviter.role !== WorkspaceRole.OWNER && inviter.role !== WorkspaceRole.ADMIN)) {
       throw new ConflictException({
         code: ErrorCode.INSUFFICIENT_PERMISSIONS,
         message: 'Not authorized to invite members',
       });
    }

    const existingUser = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existingUser) {
      const alreadyMember = await this.memberRepo.findOne({ where: { workspaceId, userId: existingUser.id } });
      if (alreadyMember) {
        throw new ConflictException({
          code: ErrorCode.ALREADY_MEMBER,
          message: 'User is already a member of this workspace',
        });
      }
    }

    const existingInvite = await this.invitationRepo.findOne({ 
      where: { 
        workspaceId, 
        email: dto.email,
        acceptedAt: IsNull(),
        declinedAt: IsNull(),
      } 
    });
    
    if (existingInvite && existingInvite.expiresAt > new Date()) {
       // Already invited
       return existingInvite;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invitation = this.invitationRepo.create({
      workspaceId,
      invitedById: inviterId,
      email: dto.email,
      role: dto.role,
      token,
      expiresAt,
    });

    return this.invitationRepo.save(invitation);
    // TODO: Send email
  }

  async findAllForWorkspace(workspaceId: string): Promise<WorkspaceInvitation[]> {
    return this.invitationRepo.find({
      where: { workspaceId, acceptedAt: IsNull(), declinedAt: IsNull() },
      order: { createdAt: 'DESC' }
    });
  }

  async accept(token: string, userId: string): Promise<WorkspaceMember> {
    const invitation = await this.invitationRepo.findOne({ 
      where: { token },
      relations: ['workspace'] 
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
         code: ErrorCode.INVALID_CREDENTIALS,
         message: 'Invitation email does not match user email',
       });
    }

    const alreadyMember = await this.memberRepo.findOne({ where: { workspaceId: invitation.workspaceId, userId } });
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

      await queryRunner.commitTransaction();
      return savedMember;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Failed to accept invitation');
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
         code: ErrorCode.INVALID_CREDENTIALS,
         message: 'Invitation email does not match user email',
       });
    }

    invitation.declinedAt = new Date();
    await this.invitationRepo.save(invitation);
  }

  async remove(workspaceId: string, id: string, requesterId: string): Promise<void> {
    const inviter = await this.memberRepo.findOne({ where: { workspaceId, userId: requesterId } });
    if (!inviter || (inviter.role !== WorkspaceRole.OWNER && inviter.role !== WorkspaceRole.ADMIN)) {
       throw new ConflictException({
         code: ErrorCode.INSUFFICIENT_PERMISSIONS,
         message: 'Not authorized to delete invitations',
       });
    }

    const invitation = await this.invitationRepo.findOne({ where: { id, workspaceId } });
    if (!invitation) throw new NotFoundException('Invitation not found');

    await this.invitationRepo.remove(invitation);
  }
}
