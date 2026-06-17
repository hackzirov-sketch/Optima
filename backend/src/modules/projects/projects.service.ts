import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Project } from '../../database/entities/project.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { GroupMember } from '../../database/entities/group-member.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { WorkspaceRole, TaskStatus } from '../../common/enums';
import {
  applySoftDelete,
  isActiveEntity,
} from '../../common/utils/soft-delete';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { ContentFilterService } from '../moderation/services/content-filter.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectColumn)
    private readonly columnRepo: Repository<ProjectColumn>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepo: Repository<GroupMember>,
    private readonly dataSource: DataSource,
    private readonly contentFilter: ContentFilterService,
  ) {}

  private async checkProjectAccess(
    projectId: string,
    userId: string,
    requireAdmin = false,
  ): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['workspace', 'group'],
    });

    if (!isActiveEntity(project)) {
      throw new NotFoundException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not found' });
    }

    const wsMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId: project.workspaceId, userId },
    });

    if (!wsMember) {
      throw new ForbiddenException({ code: ErrorCode.WORKSPACE_ACCESS_DENIED, message: 'You do not have access to this workspace' });
    }

    const isAdminOrOwner =
      wsMember.role === WorkspaceRole.OWNER ||
      wsMember.role === WorkspaceRole.ADMIN;

    if (requireAdmin && !isAdminOrOwner && project.createdById !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.WORKSPACE_ACCESS_DENIED,
        message: 'Only workspace admins, owners, or the project creator can perform this action',
      });
    }

    if (project.groupId && !isAdminOrOwner) {
      const groupMember = await this.groupMemberRepo.findOne({
        where: { groupId: project.groupId, userId },
      });
      if (!groupMember) {
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
      await this.contentFilter.filterText(dto.description, userId, 'project_description');
    }

    const wsMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId: dto.workspaceId, userId },
    });

    if (!wsMember) {
      throw new ForbiddenException({ code: ErrorCode.WORKSPACE_ACCESS_DENIED, message: 'You do not have access to this workspace' });
    }

    if (dto.groupId) {
      const isAdminOrOwner =
        wsMember.role === WorkspaceRole.OWNER ||
        wsMember.role === WorkspaceRole.ADMIN;
      if (!isAdminOrOwner) {
        const groupMember = await this.groupMemberRepo.findOne({
          where: { groupId: dto.groupId, userId },
        });
        if (!groupMember) {
          throw new ForbiddenException({ code: ErrorCode.GROUP_ACCESS_DENIED, message: 'You do not have access to this group' });
        }
      }
    }

    const slug = dto.slug
      ? dto.slug
      : dto.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
        '-' + Date.now().toString(36);

    const existingProject = await this.projectRepo.findOne({
      where: { workspaceId: dto.workspaceId, slug },
    });

    if (existingProject) {
      throw new ConflictException(
        { code: ErrorCode.PROJECT_SLUG_TAKEN, message: 'Project with this slug already exists in the workspace' },
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const project = this.projectRepo.create({
        ...dto,
        slug,
        createdById: userId,
      });

      const savedProject = await queryRunner.manager.save(project);

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
        const column = this.columnRepo.create({
          projectId: savedProject.id,
          ...col,
        });
        await queryRunner.manager.save(column);
      }

      await queryRunner.commitTransaction();
      return this.findById(savedProject.id, userId);
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
  ): Promise<Project[]> {
    const wsMember = await this.workspaceMemberRepo.findOne({
      where: { workspaceId, userId },
    });

    if (!wsMember)
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a member of this workspace' });

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .where('project.workspaceId = :workspaceId', { workspaceId })
      .andWhere('project.deletedAt IS NULL');

    // If not admin, only show projects with no group OR projects where user is in the group
    if (
      wsMember.role !== WorkspaceRole.OWNER &&
      wsMember.role !== WorkspaceRole.ADMIN
    ) {
      qb.leftJoin(
        'group_members',
        'gm',
        'gm.group_id = project.group_id AND gm.user_id = :userId',
        { userId },
      );
      qb.andWhere('(project.group_id IS NULL OR gm.id IS NOT NULL)');
    }

    return qb.getMany();
  }

  async findById(id: string, userId: string): Promise<Project> {
    await this.checkProjectAccess(id, userId);
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['columns'],
      order: {
        columns: { position: 'ASC' },
      },
    });

    if (!project) throw new NotFoundException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not found' });
    return project;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    const project = await this.checkProjectAccess(id, userId, true);

    if (dto.slug && dto.slug !== project.slug) {
      const existingProject = await this.projectRepo.findOne({
        where: { workspaceId: project.workspaceId, slug: dto.slug },
      });
      if (existingProject) {
        throw new ConflictException(
          { code: ErrorCode.PROJECT_SLUG_TAKEN, message: 'Project with this slug already exists in the workspace' },
        );
      }
    }

    Object.assign(project, dto);
    project.updatedById = userId;
    return this.projectRepo.save(project);
  }

  async remove(id: string, userId: string): Promise<void> {
    const project = await this.checkProjectAccess(id, userId, true);
    applySoftDelete(project, userId);
    await this.projectRepo.save(project);
  }

  // Columns Management
  async createColumn(
    projectId: string,
    userId: string,
    dto: CreateColumnDto,
  ): Promise<ProjectColumn> {
    await this.checkProjectAccess(projectId, userId, true);

    const existingColumns = await this.columnRepo.find({
      where: { projectId },
    });
    const maxPosition = existingColumns.reduce(
      (max, col) => (col.position > max ? col.position : max),
      -1,
    );

    const column = this.columnRepo.create({
      projectId,
      name: dto.name,
      color: dto.color,
      mapsToStatus: dto.mapsToStatus,
      position: maxPosition + 1,
    });

    return this.columnRepo.save(column);
  }

  async updateColumn(
    projectId: string,
    columnId: string,
    userId: string,
    dto: UpdateColumnDto,
  ): Promise<ProjectColumn> {
    await this.checkProjectAccess(projectId, userId, true);

    const column = await this.columnRepo.findOne({
      where: { id: columnId, projectId },
    });
    if (!column) throw new NotFoundException({ code: ErrorCode.COLUMN_NOT_FOUND, message: 'Column not found' });

    Object.assign(column, dto);
    return this.columnRepo.save(column);
  }

  async deleteColumn(
    projectId: string,
    columnId: string,
    userId: string,
  ): Promise<void> {
    await this.checkProjectAccess(projectId, userId, true);

    const column = await this.columnRepo.findOne({
      where: { id: columnId, projectId },
    });
    if (!column) throw new NotFoundException({ code: ErrorCode.COLUMN_NOT_FOUND, message: 'Column not found' });

    if (column.isDefault) {
      throw new ConflictException({ code: ErrorCode.COLUMN_DEFAULT_DELETE, message: 'Cannot delete a default column' });
    }

    await this.columnRepo.remove(column);
  }
}
