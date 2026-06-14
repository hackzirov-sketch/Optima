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

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
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
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
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
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const requester = await this.memberRepo.findOne({
      where: { workspaceId, userId: requesterId },
    });
    if (
      !requester ||
      (requester.role !== WorkspaceRole.OWNER &&
        requester.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Not authorized to change roles',
      });
    }

    if (workspace.ownerId === targetUserId && requesterId !== targetUserId) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Cannot change the role of the workspace owner',
      });
    }

    const member = await this.findOne(workspaceId, targetUserId);
    member.role = dto.role;
    return this.memberRepo.save(member);
  }

  async remove(
    workspaceId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const requester = await this.memberRepo.findOne({
      where: { workspaceId, userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException('Requester not found in workspace');
    }

    // A user can remove themselves (leave), or an owner/admin can remove them
    if (requesterId !== targetUserId) {
      if (
        requester.role !== WorkspaceRole.OWNER &&
        requester.role !== WorkspaceRole.ADMIN
      ) {
        throw new ConflictException({
          code: ErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Not authorized to remove members',
        });
      }
    }

    if (workspace.ownerId === targetUserId) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'The workspace owner cannot be removed',
      });
    }

    const member = await this.findOne(workspaceId, targetUserId);
    await this.memberRepo.remove(member);
  }
}