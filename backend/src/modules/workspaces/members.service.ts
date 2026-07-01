import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Workspace } from '../../database/entities/workspace.entity';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { WorkspaceRole } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { PermissionService } from '../../common/services/permission.service';
import { AuditService } from '../../common/services/audit.service';
import { ROLE_LEVEL } from '../../common/constants/role-levels';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async assertMember(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.memberRepo.findOne({ where: { workspaceId, userId } });
    if (!member) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });
    }
    return member;
  }

  async findAll(workspaceId: string, requesterId: string): Promise<WorkspaceMember[]> {
    const requester = await this.memberRepo.findOne({
      where: { workspaceId, userId: requesterId },
    });
    if (!requester) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'You are not a member of this workspace',
      });
    }
    return this.memberRepo.find({
      where: { workspaceId },
      relations: ['user'],
    });
  }

  async findOne(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId },
      relations: ['user'],
    });

    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member not found in this workspace',
      });
    }

    return member;
  }

  async updateRole(
    workspaceId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    requesterId: string,
  ): Promise<WorkspaceMember> {
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException({ code: ErrorCode.WORKSPACE_NOT_FOUND, message: 'Workspace not found' });

    const requester = await this.memberRepo.findOne({ where: { workspaceId, userId: requesterId } });
    if (!requester) {
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Requester not found in workspace' });
    }

    // Must be ADMIN or OWNER; ADMIN can only assign ≤ LEAD
    this.permission.assertCanChangeRoleTo(requester, dto.role);

    // Workspace billing owner's role cannot be changed by anyone else
    if (workspace.ownerId === targetUserId && requesterId !== targetUserId) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Cannot change the role of the workspace owner',
      });
    }

    // Prevent self-promotion: cannot assign yourself a role higher than your own
    if (requesterId === targetUserId && requester.role !== WorkspaceRole.OWNER) {
      if (ROLE_LEVEL[dto.role] > ROLE_LEVEL[requester.role]) {
        throw new ForbiddenException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'Cannot promote yourself' });
      }
    }

    const member = await this.findOne(workspaceId, targetUserId);
    const oldRole = member.role;
    member.role = dto.role;
    const saved = await this.memberRepo.save(member);
    await this.audit.log({
      workspaceId,
      actorId: requesterId,
      action: 'member.role_changed',
      entityType: 'workspace_member',
      entityId: targetUserId,
      oldValue: { role: oldRole },
      newValue: { role: dto.role },
    });
    return saved;
  }

  async remove(
    workspaceId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException({ code: ErrorCode.WORKSPACE_NOT_FOUND, message: 'Workspace not found' });

    const requester = await this.memberRepo.findOne({ where: { workspaceId, userId: requesterId } });
    if (!requester) {
      throw new NotFoundException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Requester not found in workspace' });
    }

    // User can remove themselves (leave); otherwise must be ADMIN or OWNER
    if (requesterId !== targetUserId) {
      this.permission.assertCanManageWorkspace(requester);
    }

    if (workspace.ownerId === targetUserId) {
      throw new ConflictException({
        code: ErrorCode.CANNOT_REMOVE_OWNER,
        message: 'The workspace owner cannot be removed',
      });
    }

    const member = await this.findOne(workspaceId, targetUserId);
    await this.memberRepo.remove(member);
    await this.audit.log({
      workspaceId,
      actorId: requesterId,
      action: requesterId === targetUserId ? 'member.left' : 'member.removed',
      entityType: 'workspace_member',
      entityId: targetUserId,
      oldValue: { role: member.role },
    });
  }
}
