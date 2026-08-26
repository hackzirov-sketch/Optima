import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Project } from '../../database/entities/project.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { GroupMember } from '../../database/entities/group-member.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { MemberRole, TaskStatus } from '../../common/enums';
import { isActiveEntity } from '../../common/utils/soft-delete';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { ContentFilterService } from '../moderation/services/content-filter.service';
import { PermissionService } from '../../common/services/permission.service';
import { AuditService } from '../../common/services/audit.service';
import {
  PROJECT_COLUMNS_SQL,
  PROJECT_COLUMNS_SQL_P,
  PROJECT_COLUMN_COLUMNS_SQL,
} from './projects.sql';
import { buildUpdateSet } from '../../common/utils/sql.util';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly contentFilter: ContentFilterService,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
  ) {}

  private async findProjectRow(id: string): Promise<Project | null> {
    const rows = await this.dataSource.query<Project>(
      `SELECT ${PROJECT_COLUMNS_SQL} FROM projects WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async getGroupMember(
    groupId: string,
    userId: string,
  ): Promise<GroupMember | null> {
    const rows = await this.dataSource.query<GroupMember>(
      `SELECT id, group_id AS "groupId", user_id AS "userId", role,
              joined_at AS "joinedAt", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    return rows[0] ?? null;
  }

  private async checkProjectAccess(
    projectId: string,
    userId: string,
    requireAdmin = false,
  ): Promise<Project> {
    const project = await this.findProjectRow(projectId);

    if (!isActiveEntity(project)) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found',
      });
    }

    const wsMember = await this.getGroupMember(project.groupId, userId);

    if (!wsMember) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_ACCESS_DENIED,
        message: 'You do not have access to this group',
      });
    }

    if (requireAdmin && project.createdById !== userId) {
      this.permission.assertCanManageProject(wsMember);
    }

    const isAdminOrOwner = this.permission.isAtLeast(
      wsMember,
      MemberRole.ADMIN,
    );

    if (project.groupId && !isAdminOrOwner) {
      const groupMemberRows = await this.dataSource.query(
        `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [project.groupId, userId],
      );
      if (!groupMemberRows[0]) {
        throw new ForbiddenException({
          code: ErrorCode.PROJECT_ACCESS_DENIED,
          message: 'You do not have access to this group project',
        });
      }
    }

    return project;
  }

  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    await this.contentFilter.filterText(dto.name, userId, 'project_name');
    if (dto.description) {
      await this.contentFilter.filterText(
        dto.description,
        userId,
        'project_description',
      );
    }

    const wsMember = await this.getGroupMember(dto.groupId, userId);

    if (!wsMember) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_ACCESS_DENIED,
        message: 'You do not have access to this group',
      });
    }

    if (dto.groupId) {
      if (!this.permission.isAtLeast(wsMember, MemberRole.ADMIN)) {
        const groupMemberRows = await this.dataSource.query(
          `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
          [dto.groupId, userId],
        );
        if (!groupMemberRows[0]) {
          throw new ForbiddenException({
            code: ErrorCode.GROUP_ACCESS_DENIED,
            message: 'You do not have access to this group',
          });
        }
      }
    }

    const slug = dto.slug
      ? dto.slug
      : dto.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') +
        '-' +
        Date.now().toString(36);

    const existingProject = await this.dataSource.query(
      `SELECT id FROM projects WHERE group_id = $1 AND slug = $2`,
      [dto.groupId, slug],
    );

    if (existingProject[0]) {
      throw new ConflictException({
        code: ErrorCode.PROJECT_SLUG_TAKEN,
        message: 'Project with this slug already exists in the group',
      });
    }

    const savedProject = await this.dataSource.withTransaction(
      async (query) => {
        const savedRows: Project[] = await query(
          `INSERT INTO projects
           (group_id, name, slug, description,
            status, priority, start_date, deadline, created_by)
         VALUES ($1, $2, $3, $4,
                 COALESCE($5, 'planning')::projects_status_enum,
                 COALESCE($6, 'medium')::projects_priority_enum,
                 $7, $8, $9)
         RETURNING ${PROJECT_COLUMNS_SQL}`,
          [
            dto.groupId,
            dto.name,
            slug,
            dto.description ?? null,
            dto.status ?? null,
            dto.priority ?? null,
            dto.startDate ?? null,
            dto.deadline ?? null,
            userId,
          ],
        );
        const savedProject = savedRows[0];

        // Create default columns
        const defaultColumns = [
          {
            name: 'To Do',
            position: 0,
            isDefault: true,
            mapsToStatus: TaskStatus.TODO,
          },
          {
            name: 'In Progress',
            position: 1,
            isDefault: true,
            mapsToStatus: TaskStatus.IN_PROGRESS,
          },
          {
            name: 'Review',
            position: 2,
            isDefault: false,
            mapsToStatus: TaskStatus.REVIEW,
          },
          {
            name: 'Done',
            position: 3,
            isDefault: true,
            mapsToStatus: TaskStatus.DONE,
          },
        ];

        for (const col of defaultColumns) {
          await query(
            `INSERT INTO project_columns (project_id, name, position, is_default, maps_to_status)
           VALUES ($1, $2, $3, $4, $5::project_columns_maps_to_status_enum)`,
            [
              savedProject.id,
              col.name,
              col.position,
              col.isDefault,
              col.mapsToStatus,
            ],
          );
        }

        return savedProject;
      },
    );
    return this.findById(savedProject.id, userId);
  }

  async findAllInGroup(groupId: string, userId: string): Promise<Project[]> {
    const wsMember = await this.getGroupMember(groupId, userId);

    if (!wsMember)
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'Not a member of this group',
      });

    // Non-admins only see projects with no group, or group projects they belong to
    if (!this.permission.isAtLeast(wsMember, MemberRole.ADMIN)) {
      return this.dataSource.query(
        `SELECT ${PROJECT_COLUMNS_SQL_P}
         FROM projects p
         LEFT JOIN group_members gm ON gm.group_id = p.group_id AND gm.user_id = $2
         WHERE p.group_id = $1 AND p.deleted_at IS NULL
           AND (p.group_id IS NULL OR gm.id IS NOT NULL)`,
        [groupId, userId],
      );
    }

    return this.dataSource.query(
      `SELECT ${PROJECT_COLUMNS_SQL} FROM projects WHERE group_id = $1 AND deleted_at IS NULL`,
      [groupId],
    );
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<Project & { columns: ProjectColumn[] }> {
    await this.checkProjectAccess(id, userId);
    const project = await this.findProjectRow(id);

    if (!project)
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found',
      });

    const columns = await this.dataSource.query<ProjectColumn>(
      `SELECT ${PROJECT_COLUMN_COLUMNS_SQL} FROM project_columns WHERE project_id = $1 ORDER BY position ASC`,
      [id],
    );

    return { ...project, columns };
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    const project = await this.checkProjectAccess(id, userId, true);

    if (dto.slug && dto.slug !== project.slug) {
      const existingProject = await this.dataSource.query(
        `SELECT id FROM projects WHERE group_id = $1 AND slug = $2`,
        [project.groupId, dto.slug],
      );
      if (existingProject[0]) {
        throw new ConflictException({
          code: ErrorCode.PROJECT_SLUG_TAKEN,
          message: 'Project with this slug already exists in the group',
        });
      }
    }

    const { setClause, values } = buildUpdateSet(
      { ...dto, updatedById: userId },
      2,
      { status: 'projects_status_enum', priority: 'projects_priority_enum' },
    );
    if (!setClause) return project;

    const rows: Project[] = await this.dataSource.query(
      `UPDATE projects SET ${setClause} WHERE id = $1 RETURNING ${PROJECT_COLUMNS_SQL}`,
      [id, ...values],
    );
    return rows[0];
  }

  async remove(id: string, userId: string): Promise<void> {
    const project = await this.checkProjectAccess(id, userId, true);
    await this.dataSource.query(
      `UPDATE projects SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
      [id, userId],
    );
    await this.audit.log({
      groupId: project.groupId,
      actorId: userId,
      action: 'project.deleted',
      entityType: 'project',
      entityId: id,
      oldValue: { name: project.name },
    });
  }

  // Columns Management
  async createColumn(
    projectId: string,
    userId: string,
    dto: CreateColumnDto,
  ): Promise<ProjectColumn> {
    await this.checkProjectAccess(projectId, userId, true);

    const existingColumns = await this.dataSource.query<ProjectColumn>(
      `SELECT position FROM project_columns WHERE project_id = $1`,
      [projectId],
    );
    const maxPosition = existingColumns.reduce(
      (max, col) => (col.position > max ? col.position : max),
      -1,
    );

    const rows = await this.dataSource.query<ProjectColumn>(
      `INSERT INTO project_columns (project_id, name, color, maps_to_status, position)
       VALUES ($1, $2, $3, $4::project_columns_maps_to_status_enum, $5)
       RETURNING ${PROJECT_COLUMN_COLUMNS_SQL}`,
      [
        projectId,
        dto.name,
        dto.color ?? null,
        dto.mapsToStatus ?? null,
        maxPosition + 1,
      ],
    );
    return rows[0];
  }

  async updateColumn(
    projectId: string,
    columnId: string,
    userId: string,
    dto: UpdateColumnDto,
  ): Promise<ProjectColumn> {
    await this.checkProjectAccess(projectId, userId, true);

    const columnRows = await this.dataSource.query<ProjectColumn>(
      `SELECT ${PROJECT_COLUMN_COLUMNS_SQL} FROM project_columns WHERE id = $1 AND project_id = $2`,
      [columnId, projectId],
    );
    if (!columnRows[0])
      throw new NotFoundException({
        code: ErrorCode.COLUMN_NOT_FOUND,
        message: 'Column not found',
      });

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
      {
        maps_to_status: 'project_columns_maps_to_status_enum',
      },
    );
    if (!setClause) return columnRows[0];

    const rows: ProjectColumn[] = await this.dataSource.query(
      `UPDATE project_columns SET ${setClause} WHERE id = $1 RETURNING ${PROJECT_COLUMN_COLUMNS_SQL}`,
      [columnId, ...values],
    );
    return rows[0];
  }

  async deleteColumn(
    projectId: string,
    columnId: string,
    userId: string,
  ): Promise<void> {
    await this.checkProjectAccess(projectId, userId, true);

    const columnRows = await this.dataSource.query(
      `SELECT id, is_default AS "isDefault" FROM project_columns WHERE id = $1 AND project_id = $2`,
      [columnId, projectId],
    );
    const column = columnRows[0];
    if (!column)
      throw new NotFoundException({
        code: ErrorCode.COLUMN_NOT_FOUND,
        message: 'Column not found',
      });

    if (column.isDefault) {
      throw new ConflictException({
        code: ErrorCode.COLUMN_DEFAULT_DELETE,
        message: 'Cannot delete a default column',
      });
    }

    await this.dataSource.query(`DELETE FROM project_columns WHERE id = $1`, [
      columnId,
    ]);
  }
}
