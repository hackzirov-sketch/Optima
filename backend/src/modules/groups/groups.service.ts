import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Group } from '../../database/entities/group.entity';
import { GroupMember } from '../../database/entities/group-member.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { WorkspaceRole } from '../../common/enums';
import { PermissionService } from '../../common/services/permission.service';
import { isActiveEntity } from '../../common/utils/soft-delete';
import { buildUpdateSet, normalizeReturning } from '../../common/utils/sql.util';

const GROUP_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", name, slug, type, description,
  avatar_url AS "avatarUrl", created_by AS "createdById",
  created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

const GROUP_MEMBER_COLUMNS_SQL = `
  id, group_id AS "groupId", user_id AS "userId", role,
  joined_at AS "joinedAt", created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class GroupsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly permission: PermissionService,
  ) {}

  private async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const rows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, dto: CreateGroupDto): Promise<Group> {
    const wsMember = await this.getWorkspaceMember(dto.workspaceId, userId);

    if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
    this.permission.assertCanManageWorkspace(wsMember);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const slug = dto.slug
        ? dto.slug
        : dto.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
          '-' + Date.now().toString(36);

      const savedRows: Group[] = await queryRunner.query(
        `INSERT INTO groups (workspace_id, name, slug, type, description, created_by)
         VALUES ($1, $2, $3, COALESCE($4, 'general')::groups_type_enum, $5, $6)
         RETURNING ${GROUP_COLUMNS_SQL}`,
        [dto.workspaceId, dto.name, slug, dto.type ?? null, dto.description ?? null, userId],
      );
      const savedGroup = savedRows[0];

      // Creator is automatically a member
      await queryRunner.query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3::group_members_role_enum)`,
        [savedGroup.id, userId, wsMember.role],
      );

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
    const wsMember = await this.getWorkspaceMember(workspaceId, userId);

    if (!wsMember) {
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a member of this workspace' });
    }

    // All workspace members can see all groups for now, since UPZ groups are not private.
    return this.dataSource.query(
      `SELECT ${GROUP_COLUMNS_SQL} FROM groups WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId],
    );
  }

  async findById(id: string, userId: string): Promise<Group & { members: any[] }> {
    const rows: Group[] = await this.dataSource.query(
      `SELECT ${GROUP_COLUMNS_SQL} FROM groups WHERE id = $1`,
      [id],
    );
    const group = rows[0] ?? null;

    if (!isActiveEntity(group)) {
      throw new NotFoundException({ code: ErrorCode.GROUP_NOT_FOUND, message: 'Group not found' });
    }

    const memberRows: any[] = await this.dataSource.query(
      `SELECT gm.id, gm.group_id AS "groupId", gm.user_id AS "userId", gm.role,
              gm.joined_at AS "joinedAt",
              u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
              u.avatar_url AS "u_avatarUrl"
       FROM group_members gm
       LEFT JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [id],
    );

    const members = memberRows.map((m) => {
      const { u_id, u_firstName, u_lastName, u_avatarUrl, ...rest } = m;
      return { ...rest, user: u_id ? { id: u_id, firstName: u_firstName, lastName: u_lastName, avatarUrl: u_avatarUrl } : null };
    });

    return { ...group, members };
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateGroupDto,
  ): Promise<Group> {
    const group = await this.findById(id, userId);

    if (group.createdById !== userId) {
      const wsMember = await this.getWorkspaceMember(group.workspaceId, userId);
      if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
      this.permission.assertCanManageWorkspace(wsMember);
    }

    const { setClause, values } = buildUpdateSet(dto as Record<string, unknown>, 2, {
      type: 'groups_type_enum',
    });
    if (!setClause) return group;

    const rows: Group[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE groups SET ${setClause} WHERE id = $1 RETURNING ${GROUP_COLUMNS_SQL}`,
        [id, ...values],
      ),
    );
    return rows[0];
  }

  async remove(id: string, userId: string): Promise<void> {
    const group = await this.findById(id, userId);

    if (group.createdById !== userId) {
      const wsMember = await this.getWorkspaceMember(group.workspaceId, userId);
      if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
      this.permission.assertCanManageWorkspace(wsMember);
    }

    await this.dataSource.query(`UPDATE groups SET deleted_at = now(), deleted_by = $2 WHERE id = $1`, [id, userId]);
  }

  async addMember(
    id: string,
    userIdToAdd: string,
    requesterId: string,
    role?: WorkspaceRole,
  ): Promise<GroupMember> {
    const group = await this.findById(id, requesterId);

    // Only owner/admin or group creator can add members
    if (group.createdById !== requesterId) {
      const wsMember = await this.getWorkspaceMember(group.workspaceId, requesterId);
      if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
      this.permission.assertCanManageWorkspace(wsMember);
    }

    // Must be a workspace member to be added
    const targetWsMember = await this.getWorkspaceMember(group.workspaceId, userIdToAdd);

    if (!targetWsMember) {
      throw new NotFoundException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Target user is not a member of the workspace',
      });
    }

    const existingRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [id, userIdToAdd],
    );

    if (existingRows[0]) {
      throw new ConflictException({ code: ErrorCode.GROUP_ALREADY_MEMBER, message: 'User is already a member of this group' });
    }

    const rows: GroupMember[] = await this.dataSource.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3::group_members_role_enum)
       RETURNING ${GROUP_MEMBER_COLUMNS_SQL}`,
      [id, userIdToAdd, role || WorkspaceRole.JUNIOR],
    );
    return rows[0];
  }

  async removeMember(
    id: string,
    userIdToRemove: string,
    requesterId: string,
  ): Promise<void> {
    const group = await this.findById(id, requesterId);

    // User can remove themselves, otherwise must be owner or admin
    if (requesterId !== userIdToRemove && group.createdById !== requesterId) {
      const wsMember = await this.getWorkspaceMember(group.workspaceId, requesterId);
      if (!wsMember) throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' });
      this.permission.assertCanManageWorkspace(wsMember);
    }

    if (userIdToRemove === group.createdById) {
      throw new ConflictException({ code: ErrorCode.GROUP_OWNER_REMOVE, message: 'Cannot remove the group owner' });
    }

    const memberRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [id, userIdToRemove],
    );

    if (!memberRows[0]) {
      throw new NotFoundException({ code: ErrorCode.GROUP_MEMBER_NOT_FOUND, message: 'User is not a member of this group' });
    }

    await this.dataSource.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [id, userIdToRemove]);
  }
}
