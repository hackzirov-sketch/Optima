import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Group } from '../../database/entities/group.entity';
import { GroupMember } from '../../database/entities/group-member.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { WorkspaceRole } from '../../common/enums';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepo: Repository<GroupMember>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateGroupDto): Promise<Group> {
    const wsMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId: dto.workspaceId, userId },
    });

    if (
      !wsMember ||
      (wsMember.role !== WorkspaceRole.OWNER &&
        wsMember.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only workspace admins or owners can create groups',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const group = this.groupRepo.create({
        workspaceId: dto.workspaceId,
        name: dto.name,
        slug: dto.slug,
        type: dto.type,
        description: dto.description,
        createdById: userId,
      });

      const savedGroup = await queryRunner.manager.save(group);

      // Creator is automatically a member
      const member = this.groupMemberRepo.create({
        groupId: savedGroup.id,
        userId: userId,
      });
      await queryRunner.manager.save(member);

      await queryRunner.commitTransaction();
      return savedGroup;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllInWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<Group[]> {
    const wsMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId },
    });

    if (!wsMember) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    const qb = this.groupRepo
      .createQueryBuilder('group')
      .leftJoin('group.members', 'member')
      .where('group.workspaceId = :workspaceId', { workspaceId })
      .andWhere('group.deletedAt IS NULL');

    // All workspace members can see all groups for now, since UPZ groups are not private
    // If needed, we can implement private group logic later.
    return qb.getMany();
  }

  async findById(id: string, userId: string): Promise<Group> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['members', 'members.user'],
    });

    if (!group || group.deletedAt) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateGroupDto,
  ): Promise<Group> {
    const group = await this.findById(id, userId);

    if (group.createdById !== userId) {
      const wsMember = await this.workspaceMemberRepo.findOne({
        where: { workspaceId: group.workspaceId, userId },
      });
      if (
        !wsMember ||
        (wsMember.role !== WorkspaceRole.OWNER &&
          wsMember.role !== WorkspaceRole.ADMIN)
      ) {
        throw new ForbiddenException(
          'Only the group owner or workspace admin can update the group',
        );
      }
    }

    Object.assign(group, dto);
    return this.groupRepo.save(group);
  }

  async remove(id: string, userId: string): Promise<void> {
    const group = await this.findById(id, userId);

    if (group.createdById !== userId) {
      const wsMember = await this.workspaceMemberRepo.findOne({
        where: { workspaceId: group.workspaceId, userId },
      });
      if (
        !wsMember ||
        (wsMember.role !== WorkspaceRole.OWNER &&
          wsMember.role !== WorkspaceRole.ADMIN)
      ) {
        throw new ForbiddenException(
          'Only the group owner or workspace admin can delete the group',
        );
      }
    }

    group.deletedAt = new Date();
    group.deletedBy = userId;
    await this.groupRepo.save(group);
  }

  async addMember(
    id: string,
    userIdToAdd: string,
    requesterId: string,
  ): Promise<GroupMember> {
    const group = await this.findById(id, requesterId);

    // Only owner/admin or group creator can add members
    if (group.createdById !== requesterId) {
      const wsMember = await this.workspaceMemberRepo.findOne({
        where: { workspaceId: group.workspaceId, userId: requesterId },
      });
      if (
        !wsMember ||
        (wsMember.role !== WorkspaceRole.OWNER &&
          wsMember.role !== WorkspaceRole.ADMIN)
      ) {
        throw new ForbiddenException(
          'Not authorized to add members to this group',
        );
      }
    }

    // Must be a workspace member to be added
    const targetWsMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId: group.workspaceId, userId: userIdToAdd },
    });

    if (!targetWsMember) {
      throw new NotFoundException(
        'Target user is not a member of the workspace',
      );
    }

    const existingMember = await this.groupMemberRepo.findOne({
      where: { groupId: id, userId: userIdToAdd },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this group');
    }

    const member = this.groupMemberRepo.create({
      groupId: id,
      userId: userIdToAdd,
    });

    return this.groupMemberRepo.save(member);
  }

  async removeMember(
    id: string,
    userIdToRemove: string,
    requesterId: string,
  ): Promise<void> {
    const group = await this.findById(id, requesterId);

    // User can remove themselves, otherwise must be owner or admin
    if (requesterId !== userIdToRemove && group.createdById !== requesterId) {
      const wsMember = await this.workspaceMemberRepo.findOne({
        where: { workspaceId: group.workspaceId, userId: requesterId },
      });
      if (
        !wsMember ||
        (wsMember.role !== WorkspaceRole.OWNER &&
          wsMember.role !== WorkspaceRole.ADMIN)
      ) {
        throw new ForbiddenException(
          'Not authorized to remove members from this group',
        );
      }
    }

    if (userIdToRemove === group.createdById) {
      throw new ConflictException('Cannot remove the group owner');
    }

    const member = await this.groupMemberRepo.findOne({
      where: { groupId: id, userId: userIdToRemove },
    });

    if (!member) {
      throw new NotFoundException('User is not a member of this group');
    }

    await this.groupMemberRepo.remove(member);
  }
}
