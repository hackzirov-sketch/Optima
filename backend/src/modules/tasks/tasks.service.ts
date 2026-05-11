import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';

import { Task } from '../../database/entities/task.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';
import { TaskWatcher } from '../../database/entities/task-watcher.entity';
import { TaskDependency } from '../../database/entities/task-dependency.entity';
import { TaskTag } from '../../database/entities/task-tag.entity';
import { Tag } from '../../database/entities/tag.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { WorkspaceRole, TaskStatus } from '../../common/enums';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(TaskActivity)
    private readonly activityRepo: Repository<TaskActivity>,
    @InjectRepository(TaskWatcher)
    private readonly watcherRepo: Repository<TaskWatcher>,
    @InjectRepository(TaskDependency)
    private readonly dependencyRepo: Repository<TaskDependency>,
    @InjectRepository(TaskTag)
    private readonly taskTagRepo: Repository<TaskTag>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    @InjectRepository(ProjectColumn)
    private readonly columnRepo: Repository<ProjectColumn>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────
  //  Internal helpers
  // ─────────────────────────────────────────────

  private async assertMember(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.wsMemberRepo.findOne({ where: { workspaceId, userId } });
    if (!member) throw new ForbiddenException('You are not a member of this workspace');
    return member;
  }

  private async getTask(taskId: string): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task || task.deletedAt) throw new NotFoundException('Task not found');
    return task;
  }

  private async logActivity(
    taskId: string,
    userId: string,
    type: string,
    description: string,
    metadata?: object,
  ) {
    const activity = this.activityRepo.create({ taskId, userId, type, description, metadata });
    await this.activityRepo.save(activity);
  }

  /** Detect circular dependency using BFS */
  private async hasCycle(taskId: string, newDependsOnId: string): Promise<boolean> {
    // Starting from newDependsOnId, see if we can reach taskId following blocks chains
    const visited = new Set<string>();
    const queue = [newDependsOnId];

    while (queue.length) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = await this.dependencyRepo.find({ where: { taskId: current } });
      for (const d of deps) queue.push(d.dependsOnId);
    }
    return false;
  }

  // ─────────────────────────────────────────────
  //  CRUD
  // ─────────────────────────────────────────────

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    await this.assertMember(dto.workspaceId, userId);

    // Validate column belongs to the project
    if (dto.columnId) {
      const col = await this.columnRepo.findOne({
        where: { id: dto.columnId, projectId: dto.projectId },
      });
      if (!col) throw new NotFoundException('Column not found in this project');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get next task number via sequence table
      await queryRunner.query(
        `INSERT INTO task_sequences (project_id, last_number)
         VALUES ($1, 1)
         ON CONFLICT (project_id) DO UPDATE
           SET last_number = task_sequences.last_number + 1`,
        [dto.projectId],
      );
      const [{ last_number }] = await queryRunner.query(
        `SELECT last_number FROM task_sequences WHERE project_id = $1`,
        [dto.projectId],
      );

      // Compute board position (append to end of column/project)
      const maxPos = await queryRunner.manager
        .createQueryBuilder(Task, 't')
        .select('MAX(t.position)', 'max')
        .where('t.projectId = :pid', { pid: dto.projectId })
        .andWhere('t.deletedAt IS NULL')
        .getRawOne();

      const position = (maxPos?.max ?? -1) + 1;

      const task = queryRunner.manager.create(Task, {
        ...dto,
        creatorId: userId,
        taskNumber: Number(last_number),
        position,
        status: dto.status ?? TaskStatus.BACKLOG,
      });

      const saved = await queryRunner.manager.save(task);
      await queryRunner.commitTransaction();

      await this.logActivity(saved.id, userId, 'task_created', `Task UPZ-${saved.taskNumber} created`);
      return this.findById(saved.id, userId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(projectId: string, userId: string, dto: FilterTasksDto): Promise<{ data: Task[]; total: number }> {
    // Find any task in project to get workspaceId for auth check
    const anyTask = await this.taskRepo.findOne({ where: { projectId } });
    if (anyTask) await this.assertMember(anyTask.workspaceId, userId);

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.creator', 'creator')
      .leftJoinAndSelect('task.column', 'column')
      .where('task.projectId = :projectId', { projectId })
      .andWhere('task.deletedAt IS NULL');

    if (dto.status)     qb.andWhere('task.status = :status', { status: dto.status });
    if (dto.type)       qb.andWhere('task.type = :type', { type: dto.type });
    if (dto.priority)   qb.andWhere('task.priority = :priority', { priority: dto.priority });
    if (dto.assigneeId) qb.andWhere('task.assigneeId = :assigneeId', { assigneeId: dto.assigneeId });
    if (dto.columnId)   qb.andWhere('task.columnId = :columnId', { columnId: dto.columnId });
    if (dto.search)     qb.andWhere('task.title ILIKE :search', { search: `%${dto.search}%` });

    if (dto.parentTaskId !== undefined) {
      if (dto.parentTaskId === null) {
        qb.andWhere('task.parentTaskId IS NULL');
      } else {
        qb.andWhere('task.parentTaskId = :parentTaskId', { parentTaskId: dto.parentTaskId });
      }
    }

    qb.orderBy('task.position', 'ASC').addOrderBy('task.createdAt', 'ASC');

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(taskId: string, userId: string): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['assignee', 'creator', 'reviewer', 'column', 'subtasks'],
    });
    if (!task || task.deletedAt) throw new NotFoundException('Task not found');
    await this.assertMember(task.workspaceId, userId);
    return task;
  }

  async update(taskId: string, userId: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const old = { status: task.status, assigneeId: task.assigneeId, priority: task.priority };

    // Validate column belongs to this project
    if (dto.columnId) {
      const col = await this.columnRepo.findOne({
        where: { id: dto.columnId, projectId: task.projectId },
      });
      if (!col) throw new NotFoundException('Column not found in this project');
    }

    Object.assign(task, dto);

    // Auto-set completedAt
    if (dto.status === TaskStatus.DONE && !task.completedAt) {
      task.completedAt = new Date();
    } else if (dto.status && dto.status !== TaskStatus.DONE) {
      task.completedAt = null as any;
    }

    const saved = await this.taskRepo.save(task);

    // Activity logs for key changes
    if (dto.status && dto.status !== old.status) {
      await this.logActivity(taskId, userId, 'status_changed',
        `Status changed from ${old.status} to ${dto.status}`,
        { old_value: old.status, new_value: dto.status });
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== old.assigneeId) {
      await this.logActivity(taskId, userId, 'assigned',
        `Assignee changed`,
        { old_value: old.assigneeId, new_value: dto.assigneeId });
    }

    return saved;
  }

  async remove(taskId: string, userId: string): Promise<void> {
    const task = await this.getTask(taskId);
    const member = await this.assertMember(task.workspaceId, userId);

    const canDelete =
      task.creatorId === userId ||
      member.role === WorkspaceRole.OWNER ||
      member.role === WorkspaceRole.ADMIN ||
      member.role === WorkspaceRole.LEAD;

    if (!canDelete) throw new ForbiddenException('Only task creator, lead, admin or owner can delete tasks');

    task.deletedAt = new Date();
    task.deletedBy = userId;
    await this.taskRepo.save(task);
  }

  // ─────────────────────────────────────────────
  //  Move (Kanban drag-and-drop)
  // ─────────────────────────────────────────────

  async move(taskId: string, userId: string, dto: MoveTaskDto): Promise<Task> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const oldColumnId = task.columnId;
    const oldStatus   = task.status;

    if (dto.columnId !== undefined) {
      if (dto.columnId) {
        const col = await this.columnRepo.findOne({
          where: { id: dto.columnId, projectId: task.projectId },
        });
        if (!col) throw new NotFoundException('Target column not found in this project');
        task.columnId = dto.columnId;

        // Auto-sync status from column mapping if no explicit status given
        if (!dto.status && col.mapsToStatus) {
          task.status = col.mapsToStatus;
        }
      } else {
        task.columnId = null as any;
      }
    }

    if (dto.status !== undefined) task.status = dto.status;
    if (dto.position !== undefined) task.position = dto.position;

    if (task.status === TaskStatus.DONE && !task.completedAt) {
      task.completedAt = new Date();
    } else if (task.status !== TaskStatus.DONE) {
      task.completedAt = null as any;
    }

    const saved = await this.taskRepo.save(task);

    if (saved.columnId !== oldColumnId || saved.status !== oldStatus) {
      await this.logActivity(taskId, userId, 'task_moved',
        `Task moved to column ${saved.columnId ?? 'none'} with status ${saved.status}`,
        { old_column: oldColumnId, new_column: saved.columnId, old_status: oldStatus, new_status: saved.status });
    }

    return saved;
  }

  // ─────────────────────────────────────────────
  //  Watchers
  // ─────────────────────────────────────────────

  async watch(taskId: string, userId: string): Promise<{ watching: boolean }> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const existing = await this.watcherRepo.findOne({ where: { taskId, userId } });
    if (existing) return { watching: true };

    const watcher = this.watcherRepo.create({ taskId, userId });
    await this.watcherRepo.save(watcher);
    return { watching: true };
  }

  async unwatch(taskId: string, userId: string): Promise<{ watching: boolean }> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    await this.watcherRepo.delete({ taskId, userId });
    return { watching: false };
  }

  async getWatchers(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);
    return this.watcherRepo.find({ where: { taskId }, relations: ['user'] });
  }

  // ─────────────────────────────────────────────
  //  Activities
  // ─────────────────────────────────────────────

  async getActivities(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    return this.activityRepo.find({
      where: { taskId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ─────────────────────────────────────────────
  //  Dependencies
  // ─────────────────────────────────────────────

  async addDependency(taskId: string, userId: string, dto: AddDependencyDto): Promise<TaskDependency> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    if (taskId === dto.dependsOnId) {
      throw new BadRequestException('A task cannot depend on itself');
    }

    // Ensure target task exists and is in the same workspace
    const target = await this.getTask(dto.dependsOnId);
    if (target.workspaceId !== task.workspaceId) {
      throw new BadRequestException('Dependencies must be within the same workspace');
    }

    // Cycle detection
    if (await this.hasCycle(taskId, dto.dependsOnId)) {
      throw new ConflictException('Adding this dependency would create a cycle');
    }

    const existing = await this.dependencyRepo.findOne({
      where: { taskId, dependsOnId: dto.dependsOnId },
    });
    if (existing) throw new ConflictException('This dependency already exists');

    const dep = this.dependencyRepo.create({
      taskId,
      dependsOnId: dto.dependsOnId,
      type: dto.type,
      createdById: userId,
    });

    return this.dependencyRepo.save(dep);
  }

  async getDependencies(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    return this.dependencyRepo.find({
      where: { taskId },
      relations: ['dependsOn'],
    });
  }

  async removeDependency(taskId: string, dependencyId: string, userId: string): Promise<void> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const dep = await this.dependencyRepo.findOne({
      where: { id: dependencyId, taskId },
    });
    if (!dep) throw new NotFoundException('Dependency not found');

    await this.dependencyRepo.remove(dep);
  }

  // ─────────────────────────────────────────────
  //  Tags
  // ─────────────────────────────────────────────

  async addTag(taskId: string, tagId: string, userId: string): Promise<TaskTag> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const tag = await this.tagRepo.findOne({ where: { id: tagId, workspaceId: task.workspaceId } });
    if (!tag) throw new NotFoundException('Tag not found in this workspace');

    const existing = await this.taskTagRepo.findOne({ where: { taskId, tagId } });
    if (existing) throw new ConflictException('Tag already attached to this task');

    const taskTag = this.taskTagRepo.create({ taskId, tagId });
    return this.taskTagRepo.save(taskTag);
  }

  async removeTag(taskId: string, tagId: string, userId: string): Promise<void> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    await this.taskTagRepo.delete({ taskId, tagId });
  }

  async getTags(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);
    return this.taskTagRepo.find({ where: { taskId }, relations: ['tag'] });
  }
}
