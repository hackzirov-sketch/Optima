import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Group } from '../../../database/entities/group.entity';
import { GroupMember } from '../../../database/entities/group-member.entity';
import { CreateGroupDto } from '../schemas/create-group.schema';
import { UpdateGroupDto } from '../schemas/update-group.schema';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { WorkspaceRole } from '../../../common/enums';
import { PermissionService } from '../../../common/services/permission.service';
import { isActiveEntity } from '../../../common/utils/soft-delete';
import { GroupsRepository } from '../repositories/groups.repository';

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupsRepository: GroupsRepository,
    private readonly permission: PermissionService,
  ) {}

  async create(userId: string, dto: CreateGroupDto): Promise<Group> {
    const wsMember = await this.groupsRepository.findWorkspaceMember(dto.workspaceId, userId);

    if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
    this.permission.assertCanManageWorkspace(wsMember);

    return this.groupsRepository.create(dto, userId, wsMember.role);
  }

  async findAllInWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<Group[]> {
    const wsMember = await this.groupsRepository.findWorkspaceMember(workspaceId, userId);

    if (!wsMember) {
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a member of this workspace' });
    }

    // All workspace members can see all groups for now, since UPZ groups are not private.
    return this.groupsRepository.findAllInWorkspace(workspaceId);
  }

  async findById(id: string, userId: string): Promise<Group & { members: any[] }> {
    const group = await this.groupsRepository.findById(id);

    if (!isActiveEntity(group)) {
      throw new NotFoundException({ code: ErrorCode.GROUP_NOT_FOUND, message: 'Group not found' });
    }

    const memberRows = await this.groupsRepository.findMembersWithUser(id);

    const members = memberRows.map((m) => {
      const { u_id, u_firstName, u_lastName, u_avatarUrl, ...rest } = m;
      return { ...rest, user: u_id ? { id: u_id, firstName: u_firstName, lastName: u_lastName, avatarUrl: u_avatarUrl } : null };
    });

    return { ...group, members };
  }

  private async assertCanManage(group: Group, requesterId: string): Promise<void> {
    if (group.createdById !== requesterId) {
      const wsMember = await this.groupsRepository.findWorkspaceMember(group.workspaceId, requesterId);
      if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
      this.permission.assertCanManageWorkspace(wsMember);
    }
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateGroupDto,
  ): Promise<Group> {
    const group = await this.findById(id, userId);
    await this.assertCanManage(group, userId);

    const updated = await this.groupsRepository.update(id, dto as Record<string, unknown>);
    return updated ?? group;
  }

  async remove(id: string, userId: string): Promise<void> {
    const group = await this.findById(id, userId);
    await this.assertCanManage(group, userId);

    await this.groupsRepository.softDelete(id, userId);
  }

  async addMember(
    id: string,
    userIdToAdd: string,
    requesterId: string,
    role?: WorkspaceRole,
  ): Promise<GroupMember> {
    const group = await this.findById(id, requesterId);
    await this.assertCanManage(group, requesterId);

    // Must be a workspace member to be added
    const targetWsMember = await this.groupsRepository.findWorkspaceMember(group.workspaceId, userIdToAdd);

    if (!targetWsMember) {
      throw new NotFoundException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Target user is not a member of the workspace',
      });
    }

    const existing = await this.groupsRepository.findMembership(id, userIdToAdd);

    if (existing) {
      throw new ConflictException({ code: ErrorCode.GROUP_ALREADY_MEMBER, message: 'User is already a member of this group' });
    }

    return this.groupsRepository.addMember(id, userIdToAdd, role || WorkspaceRole.JUNIOR);
  }

  async removeMember(
    id: string,
    userIdToRemove: string,
    requesterId: string,
  ): Promise<void> {
    const group = await this.findById(id, requesterId);

    // User can remove themselves, otherwise must be owner or admin
    if (requesterId !== userIdToRemove) {
      await this.assertCanManage(group, requesterId);
    }

    if (userIdToRemove === group.createdById) {
      throw new ConflictException({ code: ErrorCode.GROUP_OWNER_REMOVE, message: 'Cannot remove the group owner' });
    }

    const membership = await this.groupsRepository.findMembership(id, userIdToRemove);

    if (!membership) {
      throw new NotFoundException({ code: ErrorCode.GROUP_MEMBER_NOT_FOUND, message: 'User is not a member of this group' });
    }

    await this.groupsRepository.removeMember(id, userIdToRemove);
  }
}
