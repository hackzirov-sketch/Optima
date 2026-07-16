import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { Group } from '../../../database/entities/group.entity';
import { GroupMember } from '../../../database/entities/group-member.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { WorkspaceRole } from '../../../common/enums';
import { CreateGroupDto } from '../schemas/create-group.schema';
import { buildUpdateSet, normalizeReturning } from '../../../common/utils/sql.util';
import { GROUP_COLUMNS_SQL, GROUP_MEMBER_COLUMNS_SQL } from './groups.sql';

@Injectable()
export class GroupsRepository {
  constructor(private readonly dataSource: DatabaseService) {}

  async findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const rows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    return rows[0] ?? null;
  }

  async create(dto: CreateGroupDto, creatorId: string, creatorRole: WorkspaceRole): Promise<Group> {
    return this.dataSource.withTransaction(async (query) => {
      const slug = dto.slug
        ? dto.slug
        : dto.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
          '-' + Date.now().toString(36);

      const savedRows: Group[] = await query(
        `INSERT INTO groups (workspace_id, name, slug, type, description, created_by)
         VALUES ($1, $2, $3, COALESCE($4, 'general')::groups_type_enum, $5, $6)
         RETURNING ${GROUP_COLUMNS_SQL}`,
        [dto.workspaceId, dto.name, slug, dto.type ?? null, dto.description ?? null, creatorId],
      );
      const savedGroup = savedRows[0];

      // Creator is automatically a member
      await query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3::group_members_role_enum)`,
        [savedGroup.id, creatorId, creatorRole],
      );

      return savedGroup;
    });
  }

  async findAllInWorkspace(workspaceId: string): Promise<Group[]> {
    return this.dataSource.query(
      `SELECT ${GROUP_COLUMNS_SQL} FROM groups WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [workspaceId],
    );
  }

  async findById(id: string): Promise<Group | null> {
    const rows: Group[] = await this.dataSource.query(
      `SELECT ${GROUP_COLUMNS_SQL} FROM groups WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findMembersWithUser(groupId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT gm.id, gm.group_id AS "groupId", gm.user_id AS "userId", gm.role,
              gm.joined_at AS "joinedAt",
              u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
              u.avatar_url AS "u_avatarUrl"
       FROM group_members gm
       LEFT JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [groupId],
    );
  }

  async update(id: string, dto: Record<string, unknown>): Promise<Group | null> {
    const { setClause, values } = buildUpdateSet(dto, 2, { type: 'groups_type_enum' });
    if (!setClause) return this.findById(id);

    const rows: Group[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE groups SET ${setClause} WHERE id = $1 RETURNING ${GROUP_COLUMNS_SQL}`,
        [id, ...values],
      ),
    );
    return rows[0] ?? null;
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE groups SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
      [id, deletedBy],
    );
  }

  async findMembership(groupId: string, userId: string): Promise<{ id: string } | null> {
    const rows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    return rows[0] ?? null;
  }

  async addMember(groupId: string, userId: string, role: WorkspaceRole): Promise<GroupMember> {
    const rows: GroupMember[] = await this.dataSource.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3::group_members_role_enum)
       RETURNING ${GROUP_MEMBER_COLUMNS_SQL}`,
      [groupId, userId, role],
    );
    return rows[0];
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
  }
}
