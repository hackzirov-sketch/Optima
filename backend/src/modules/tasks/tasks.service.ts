import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.keys';

import { Task } from '../../database/entities/task.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';
import { TaskDependency } from '../../database/entities/task-dependency.entity';
import { TaskTag } from '../../database/entities/task-tag.entity';

import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { NotificationType, TaskStatus, ProjectStatus } from '../../common/enums';
import { isActiveEntity } from '../../common/utils/soft-delete';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { PermissionService } from '../../common/services/permission.service';
import { DailyStatsService } from '../analytics/daily-stats.service';
import { TASK_COLUMNS_SQL, TASK_ACTIVITY_COLUMNS_SQL, TASK_DEPENDENCY_COLUMNS_SQL, TASK_PUSH_COLUMNS_SQL } from './tasks.sql';
import { buildUpdateSet, normalizeReturning } from '../../common/utils/sql.util';

const TASK_ENUM_CASTS = {
  type: 'tasks_type_enum',
  priority: 'tasks_priority_enum',
  status: 'tasks_status_enum',
};

@Injectable()
export class TasksService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly gateway: EventsGateway,
    private readonly permission: PermissionService,
    private readonly notifications: NotificationsService,
    private readonly redisService: RedisService,
    private readonly dailyStats: DailyStatsService,
  ) {}

  // ─────────────────────────────────────────────
  //  Internal helpers
  // ─────────────────────────────────────────────

  /**
   * DB trigger `recalculate_project_progress()` recomputes `projects.progress`
   * on INSERT / UPDATE OF status / hard DELETE — but it never fires on a
   * *soft* delete (`UPDATE tasks SET deleted_at = ...`), since that touches
   * `deleted_at`, not `status`. It also never updates `projects.status` and
   * never emits a WebSocket event (it's raw SQL, outside the Nest/EventEmitter
   * layer). So instead of trusting the trigger's output, this recomputes
   * progress itself, keeps status consistent, and broadcasts the change.
   * Call this after any task create/status-change/move/soft-delete.
   */
  private async syncProjectStatusWithProgress(projectId: string): Promise<void> {
    const projectRows = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", status, progress, completed_at AS "completedAt"
       FROM projects WHERE id = $1`,
      [projectId],
    );
    const project = projectRows[0];
    if (!project) return;

    const countRows: Array<{ total: string; done: string }> = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE true) AS total,
         COUNT(*) FILTER (WHERE status = $2) AS done
       FROM tasks
       WHERE project_id = $1 AND deleted_at IS NULL AND parent_task_id IS NULL`,
      [projectId, TaskStatus.DONE],
    );
    const total = Number(countRows[0]?.total ?? 0);
    const done = Number(countRows[0]?.done ?? 0);
    const progress = total === 0 ? 0 : Math.round((done * 100) / total);

    let status = project.status;
    let completedAt = project.completedAt;

    // Terminal/manual statuses are never auto-overridden.
    if (status !== ProjectStatus.ARCHIVED && status !== ProjectStatus.CANCELLED) {
      if (progress >= 100 && status !== ProjectStatus.COMPLETED) {
        status = ProjectStatus.COMPLETED;
        if (!completedAt) completedAt = new Date();
      } else if (progress < 100 && status === ProjectStatus.COMPLETED) {
        // A previously-completed project was reopened (task un-done'd/re-added).
        status = ProjectStatus.ACTIVE;
        completedAt = null;
      }
    }

    const updatedRows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE projects SET progress = $2, status = $3::projects_status_enum, completed_at = $4
         WHERE id = $1
         RETURNING id, workspace_id AS "workspaceId", name, slug, description, status, priority,
                   progress, start_date AS "startDate", deadline, completed_at AS "completedAt",
                   created_by AS "createdById", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, progress, status, completedAt],
      ),
    );
    const updated = updatedRows[0];

    this.gateway.broadcastToWorkspace(project.workspaceId, 'project:updated', {
      project: updated,
    });
  }

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; workspaceId: string; userId: string; role: string }> {
    const cacheKey = RedisKeys.workspaceMember(workspaceId, userId);
    const client = this.redisService.getClient();

    if (client) {
      const cached = await client.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const rows = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    const member = rows[0];

    if (!member) {
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'You are not a member of this workspace' });
    }

    if (client) {
      await client.set(cacheKey, JSON.stringify(member), 'EX', 300); // cache for 5 minutes
    }

    return member;
  }

  private async getTask(taskId: string): Promise<Task> {
    const rows: Task[] = await this.dataSource.query(
      `SELECT ${TASK_COLUMNS_SQL} FROM tasks WHERE id = $1`,
      [taskId],
    );
    const task = rows[0] ?? null;
    if (!isActiveEntity(task)) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });
    return task;
  }

  private async logActivity(
    taskId: string,
    userId: string,
    type: string,
    description: string,
    metadata?: object,
  ) {
    await this.dataSource.query(
      `INSERT INTO task_activities (task_id, user_id, type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [taskId, userId, type, description, metadata ?? null],
    );
  }

  /** Detect circular dependency using BFS locally */
  private async hasCycle(
    taskId: string,
    newDependsOnId: string,
    workspaceId: string,
  ): Promise<boolean> {
    // Fetch all dependencies for tasks in the same workspace in ONE query
    const allDependencies: Array<{ taskId: string; dependsOnId: string }> = await this.dataSource.query(
      `SELECT dep.task_id AS "taskId", dep.depends_on_id AS "dependsOnId"
       FROM task_dependencies dep
       JOIN tasks t ON t.id = dep.task_id
       WHERE t.workspace_id = $1`,
      [workspaceId],
    );

    // Build adjacency list: dependsOnId -> array of taskIds (reverse dependencies)
    const adj = new Map<string, string[]>();
    for (const d of allDependencies) {
      if (!adj.has(d.taskId)) adj.set(d.taskId, []);
      adj.get(d.taskId)!.push(d.dependsOnId);
    }

    // Add the pending dependency to check if it creates a cycle
    if (!adj.has(taskId)) adj.set(taskId, []);
    adj.get(taskId)!.push(newDependsOnId);

    // Starting from newDependsOnId, see if we can reach taskId following blocks chains
    const visited = new Set<string>();
    const queue = [newDependsOnId];

    while (queue.length) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const nextNodes = adj.get(current) || [];
      for (const n of nextNodes) queue.push(n);
    }
    return false;
  }

  /**
   * SOFT BLOCK (final decision, see system design v2 §4.3):
   * dependency bajarilmagan bo'lsa ham task statusini o'zgartirishga ruxsat
   * beriladi. Backend hech narsani bloklamaydi — faqat TaskActivity'ga
   * "blocked dependency mavjud" yozuvi qo'shadi, frontend shu activity asosida
   * warning badge ko'rsatadi.
   */
  private async logUnmetDependenciesIfAny(
    taskId: string,
    userId: string,
    newStatus: TaskStatus,
  ): Promise<void> {
    // Cancelled/backlog statusga qaytishda ogohlantirish ma'nosiz
    if (newStatus === TaskStatus.CANCELLED || newStatus === TaskStatus.BACKLOG) {
      return;
    }

    const deps: Array<{ dependsOnId: string; dependsOnStatus: TaskStatus }> = await this.dataSource.query(
      `SELECT dep.depends_on_id AS "dependsOnId", t.status AS "dependsOnStatus"
       FROM task_dependencies dep
       JOIN tasks t ON t.id = dep.depends_on_id
       WHERE dep.task_id = $1`,
      [taskId],
    );
    if (deps.length === 0) return;

    const unmet = deps.filter((d) => d.dependsOnStatus !== TaskStatus.DONE);
    if (unmet.length === 0) return;

    await this.logActivity(
      taskId,
      userId,
      'blocked_dependency',
      `Status "${newStatus}" ga o'zgartirildi, lekin ${unmet.length} ta dependency hali tugallanmagan`,
      {
        new_status: newStatus,
        unmet_dependency_task_ids: unmet.map((d) => d.dependsOnId),
      },
    );
  }

  // ─────────────────────────────────────────────
  //  CRUD
  // ─────────────────────────────────────────────

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    await this.assertMember(dto.workspaceId, userId);

    // Validate column belongs to the project
    if (dto.columnId) {
      const col = await this.dataSource.query(
        `SELECT id FROM project_columns WHERE id = $1 AND project_id = $2`,
        [dto.columnId, dto.projectId],
      );
      if (!col[0]) throw new NotFoundException({ code: ErrorCode.COLUMN_NOT_FOUND, message: 'Column not found in this project' });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Compute board position (append to end of column/project)
      const maxPosRows: Array<{ max: number | null }> = await queryRunner.query(
        `SELECT MAX(position) AS max FROM tasks WHERE project_id = $1 AND deleted_at IS NULL`,
        [dto.projectId],
      );
      const position = (maxPosRows[0]?.max ?? -1) + 1;

      // NOTE: task_number is assigned automatically by the `trg_task_number`
      // DB trigger (assign_task_number()) on insert — do NOT compute/set it
      // here, doing so would double-increment task_sequences.
      const savedRows: Task[] = await queryRunner.query(
        `INSERT INTO tasks
           (workspace_id, project_id, column_id, parent_task_id, assignee_id, reviewer_id,
            title, description, type, priority, status, story_points, estimated_hours,
            start_date, due_date, creator_id, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 COALESCE($9, 'feature')::tasks_type_enum,
                 COALESCE($10, 'medium')::tasks_priority_enum,
                 COALESCE($11, 'backlog')::tasks_status_enum,
                 $12, $13, $14, $15, $16, $17)
         RETURNING ${TASK_COLUMNS_SQL}`,
        [
          dto.workspaceId,
          dto.projectId,
          dto.columnId ?? null,
          dto.parentTaskId ?? null,
          dto.assigneeId ?? null,
          dto.reviewerId ?? null,
          dto.title,
          dto.description ?? null,
          dto.type ?? null,
          dto.priority ?? null,
          dto.status ?? null,
          dto.storyPoints ?? null,
          dto.estimatedHours ?? null,
          dto.startDate ?? null,
          dto.dueDate ?? null,
          userId,
          position,
        ],
      );
      const saved = savedRows[0];

      await queryRunner.commitTransaction();

      await this.logActivity(
        saved.id,
        userId,
        'task_created',
        `Task UPZ-${saved.taskNumber} created`,
      );
      const full = await this.findById(saved.id, userId);
      this.gateway.broadcastToWorkspace(dto.workspaceId, 'task:created', { task: full });
      await this.syncProjectStatusWithProgress(dto.projectId);

      // Notify assignee (if assigned and not self)
      if (dto.assigneeId && dto.assigneeId !== userId) {
        const actorRows = await this.dataSource.query(
          `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id = $1`,
          [userId],
        );
        const actor = actorRows[0];
        const actorName = actor ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() : 'Someone';
        await this.notifications.create({
          userId: dto.assigneeId,
          actorId: userId,
          type: NotificationType.TASK_ASSIGNED,
          title: `Sizga yangi task berildi`,
          message: `${actorName}: "${full.title}"${full.dueDate ? ` · Muddat: ${full.dueDate}` : ''}`,
          entityType: 'task',
          entityId: full.id,
          actionUrl: `/app/tasks/${full.id}`,
          metadata: { taskId: full.id, taskTitle: full.title, dueDate: full.dueDate ?? null },
        });
      }

      return full;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private buildTaskFilters(dto: FilterTasksDto, params: unknown[], startIndex: number): string {
    const clauses: string[] = [];
    if (dto.status) {
      params.push(dto.status);
      clauses.push(`task.status = $${params.length}::tasks_status_enum`);
    }
    if (dto.type) {
      params.push(dto.type);
      clauses.push(`task.type = $${params.length}::tasks_type_enum`);
    }
    if (dto.priority) {
      params.push(dto.priority);
      clauses.push(`task.priority = $${params.length}::tasks_priority_enum`);
    }
    if (dto.assigneeId) {
      params.push(dto.assigneeId);
      clauses.push(`task.assignee_id = $${params.length}`);
    }
    if ((dto as any).columnId) {
      params.push((dto as any).columnId);
      clauses.push(`task.column_id = $${params.length}`);
    }
    if ((dto as any).projectId) {
      params.push((dto as any).projectId);
      clauses.push(`task.project_id = $${params.length}`);
    }
    if (dto.search) {
      params.push(`%${dto.search}%`);
      clauses.push(`task.title ILIKE $${params.length}`);
    }
    if ((dto as any).parentTaskId !== undefined) {
      if ((dto as any).parentTaskId === null) {
        clauses.push(`task.parent_task_id IS NULL`);
      } else {
        params.push((dto as any).parentTaskId);
        clauses.push(`task.parent_task_id = $${params.length}`);
      }
    }
    return clauses.length ? ' AND ' + clauses.join(' AND ') : '';
  }

  private mapTaskRow(row: any): any {
    const {
      a_id, a_firstName, a_lastName, a_avatarUrl,
      c_id, c_firstName, c_lastName, c_avatarUrl,
      col_id, col_name, col_color,
      ...task
    } = row;
    return {
      ...task,
      assignee: a_id ? { id: a_id, firstName: a_firstName, lastName: a_lastName, avatarUrl: a_avatarUrl } : null,
      creator: c_id ? { id: c_id, firstName: c_firstName, lastName: c_lastName, avatarUrl: c_avatarUrl } : null,
      column: col_id ? { id: col_id, name: col_name, color: col_color } : null,
    };
  }

  private readonly TASK_LIST_SELECT = `
    task.id AS "id", task.workspace_id AS "workspaceId", task.project_id AS "projectId",
    task.group_id AS "groupId", task.column_id AS "columnId", task.parent_task_id AS "parentTaskId",
    task.task_number AS "taskNumber", task.creator_id AS "creatorId", task.assignee_id AS "assigneeId",
    task.reviewer_id AS "reviewerId", task.title, task.description, task.type, task.priority,
    task.status, task.story_points AS "storyPoints", task.estimated_hours AS "estimatedHours",
    task.spent_hours AS "spentHours", task.start_date AS "startDate", task.due_date AS "dueDate",
    task.started_at AS "startedAt", task.completed_at AS "completedAt",
    task.completion_note AS "completionNote", task.github_pr_number AS "githubPrNumber",
    task.github_pr_url AS "githubPrUrl", task.position, task.created_at AS "createdAt",
    task.updated_at AS "updatedAt",
    assignee.id AS "a_id", assignee.first_name AS "a_firstName", assignee.last_name AS "a_lastName",
    assignee.avatar_url AS "a_avatarUrl",
    creator.id AS "c_id", creator.first_name AS "c_firstName", creator.last_name AS "c_lastName",
    creator.avatar_url AS "c_avatarUrl",
    col.id AS "col_id", col.name AS "col_name", col.color AS "col_color"
  `;

  async findAll(
    projectId: string,
    userId: string,
    dto: FilterTasksDto,
  ): Promise<{ data: Task[]; total: number }> {
    // Always check membership — even if the project has no tasks yet
    const projectRows = await this.dataSource.query(`SELECT id, workspace_id AS "workspaceId" FROM projects WHERE id = $1`, [projectId]);
    const project = projectRows[0];
    if (!project) throw new NotFoundException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not found' });
    await this.assertMember(project.workspaceId, userId);

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    const params: unknown[] = [projectId];
    const filterClause = this.buildTaskFilters(dto, params, 2);

    const countRows: Array<{ count: string }> = await this.dataSource.query(
      `SELECT COUNT(*) FROM tasks task WHERE task.project_id = $1 AND task.deleted_at IS NULL${filterClause}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const listParams = [...params, limit, (page - 1) * limit];
    const rows = await this.dataSource.query(
      `SELECT ${this.TASK_LIST_SELECT}
       FROM tasks task
       LEFT JOIN users assignee ON assignee.id = task.assignee_id
       LEFT JOIN users creator ON creator.id = task.creator_id
       LEFT JOIN project_columns col ON col.id = task.column_id
       WHERE task.project_id = $1 AND task.deleted_at IS NULL${filterClause}
       ORDER BY task.position ASC, task.created_at ASC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    return { data: rows.map((r: any) => this.mapTaskRow(r)), total };
  }

  async findAllByWorkspace(
    workspaceId: string,
    userId: string,
    dto: FilterTasksDto,
  ): Promise<{ data: Task[]; total: number }> {
    await this.assertMember(workspaceId, userId);

    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 200, 500);

    const params: unknown[] = [workspaceId];
    const filterClause = this.buildTaskFilters(dto, params, 2);

    const countRows: Array<{ count: string }> = await this.dataSource.query(
      `SELECT COUNT(*) FROM tasks task
       JOIN projects project ON project.id = task.project_id
       WHERE project.workspace_id = $1 AND task.deleted_at IS NULL${filterClause}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const listParams = [...params, limit, (page - 1) * limit];
    const rows = await this.dataSource.query(
      `SELECT ${this.TASK_LIST_SELECT}
       FROM tasks task
       JOIN projects project ON project.id = task.project_id
       LEFT JOIN users assignee ON assignee.id = task.assignee_id
       LEFT JOIN users creator ON creator.id = task.creator_id
       LEFT JOIN project_columns col ON col.id = task.column_id
       WHERE project.workspace_id = $1 AND task.deleted_at IS NULL${filterClause}
       ORDER BY task.position ASC, task.created_at ASC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    return { data: rows.map((r: any) => this.mapTaskRow(r)), total };
  }

  async findById(taskId: string, userId: string): Promise<any> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const [assigneeRows, creatorRows, reviewerRows, columnRows, subtasks, taskTags, watchers] = await Promise.all([
      task.assigneeId
        ? this.dataSource.query(`SELECT id, first_name AS "firstName", last_name AS "lastName", avatar_url AS "avatarUrl" FROM users WHERE id = $1`, [task.assigneeId])
        : Promise.resolve([]),
      this.dataSource.query(`SELECT id, first_name AS "firstName", last_name AS "lastName", avatar_url AS "avatarUrl" FROM users WHERE id = $1`, [task.creatorId]),
      task.reviewerId
        ? this.dataSource.query(`SELECT id, first_name AS "firstName", last_name AS "lastName", avatar_url AS "avatarUrl" FROM users WHERE id = $1`, [task.reviewerId])
        : Promise.resolve([]),
      task.columnId
        ? this.dataSource.query(`SELECT id, name, color FROM project_columns WHERE id = $1`, [task.columnId])
        : Promise.resolve([]),
      this.dataSource.query(`SELECT ${TASK_COLUMNS_SQL} FROM tasks WHERE parent_task_id = $1 AND deleted_at IS NULL`, [taskId]),
      this.dataSource.query(
        `SELECT tt.task_id AS "taskId", tt.tag_id AS "tagId", t.id AS "t_id", t.name AS "t_name", t.color AS "t_color"
         FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE tt.task_id = $1`,
        [taskId],
      ),
      this.dataSource.query(
        `SELECT tw.user_id AS "userId", u.id AS "u_id", u.first_name AS "u_firstName",
                u.last_name AS "u_lastName", u.avatar_url AS "u_avatarUrl"
         FROM task_watchers tw JOIN users u ON u.id = tw.user_id WHERE tw.task_id = $1`,
        [taskId],
      ),
    ]);

    return {
      ...task,
      assignee: assigneeRows[0] ?? null,
      creator: creatorRows[0] ?? null,
      reviewer: reviewerRows[0] ?? null,
      column: columnRows[0] ?? null,
      subtasks,
      taskTags: taskTags.map((tt: any) => ({ taskId: tt.taskId, tagId: tt.tagId, tag: { id: tt.t_id, name: tt.t_name, color: tt.t_color } })),
      watchers: watchers.map((w: any) => ({ userId: w.userId, user: { id: w.u_id, firstName: w.u_firstName, lastName: w.u_lastName, avatarUrl: w.u_avatarUrl } })),
    };
  }

  async update(
    taskId: string,
    userId: string,
    dto: UpdateTaskDto,
  ): Promise<Task> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const old = {
      status: task.status,
      assigneeId: task.assigneeId,
      priority: task.priority,
    };

    // Validate column belongs to this project
    if (dto.columnId) {
      const col = await this.dataSource.query(
        `SELECT id FROM project_columns WHERE id = $1 AND project_id = $2`,
        [dto.columnId, task.projectId],
      );
      if (!col[0]) throw new NotFoundException({ code: ErrorCode.COLUMN_NOT_FOUND, message: 'Column not found in this project' });
    }

    const patch: Record<string, unknown> = { ...dto };

    // Auto-set startedAt / completedAt
    if (dto.status === TaskStatus.IN_PROGRESS && !task.startedAt) {
      patch.startedAt = new Date();
    }
    if (dto.status === TaskStatus.DONE && !task.completedAt) {
      patch.completedAt = new Date();
    } else if (dto.status && dto.status !== TaskStatus.DONE) {
      patch.completedAt = null;
    }

    const { setClause, values } = buildUpdateSet(patch, 2, TASK_ENUM_CASTS);
    let saved = task;
    if (setClause) {
      const rows: Task[] = normalizeReturning(
        await this.dataSource.query(
          `UPDATE tasks SET ${setClause} WHERE id = $1 RETURNING ${TASK_COLUMNS_SQL}`,
          [taskId, ...values],
        ),
      );
      saved = rows[0];
    }

    // Activity logs for key changes
    if (dto.status && dto.status !== old.status) {
      await this.logActivity(
        taskId,
        userId,
        'status_changed',
        `Status changed from ${old.status} to ${dto.status}`,
        { old_value: old.status, new_value: dto.status },
      );

      // SOFT BLOCK: dependency tugallanmagan bo'lsa ham status o'zgartirishga
      // ruxsat beriladi (qattiq bloklanmaydi) — faqat ogohlantiruvchi activity yoziladi.
      await this.logUnmetDependenciesIfAny(taskId, userId, dto.status);
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== old.assigneeId) {
      await this.logActivity(taskId, userId, 'assigned', `Assignee changed`, {
        old_value: old.assigneeId,
        new_value: dto.assigneeId,
      });
    }

    // Send notifications when status changes
    if (dto.status && dto.status !== old.status) {
      await this.sendStatusChangeNotifications(saved, userId, old.status, dto.status);
      await this.syncProjectStatusWithProgress(saved.projectId);

      if (dto.status === TaskStatus.DONE) {
        await this.dailyStats.increment(saved.assigneeId ?? userId, saved.projectId, saved.workspaceId, {
          tasksCompleted: 1,
        });
      }
    }

    this.gateway.broadcastToWorkspace(saved.workspaceId, 'task:updated', { task: saved });
    return saved;
  }

  private async sendStatusChangeNotifications(
    task: Task,
    actorId: string,
    oldStatus: TaskStatus,
    newStatus: TaskStatus,
  ): Promise<void> {
    const isDone = newStatus === TaskStatus.DONE;
    const type = isDone ? NotificationType.TASK_COMPLETED : NotificationType.TASK_STATUS_CHANGED;
    const taskUrl = `/app/tasks/${task.id}`;

    // Collect unique recipients: creator + assignee + project managers
    const recipientIds = new Set<string>();

    if (task.creatorId && task.creatorId !== actorId) recipientIds.add(task.creatorId);
    if (task.assigneeId && task.assigneeId !== actorId) recipientIds.add(task.assigneeId);

    // Project managers from project_members table
    const projectManagers = await this.dataSource.query(
      `SELECT user_id AS "userId" FROM project_members WHERE project_id = $1 AND role = 'manager' AND status = 'accepted'`,
      [task.projectId],
    );
    for (const pm of projectManagers) {
      if (pm.userId !== actorId) recipientIds.add(pm.userId);
    }

    // Also notify the project creator (stored in projects.created_by)
    const projectRows = await this.dataSource.query(`SELECT created_by AS "createdById" FROM projects WHERE id = $1`, [task.projectId]);
    const project = projectRows[0];
    if (project?.createdById && project.createdById !== actorId) {
      recipientIds.add(project.createdById);
    }

    const actorRows = await this.dataSource.query(`SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id = $1`, [actorId]);
    const actor = actorRows[0];
    const actorName = actor ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() : 'Someone';

    const title = isDone
      ? `"${task.title}" bajarildi`
      : `Task holati o'zgardi: ${oldStatus} → ${newStatus}`;

    const message = isDone && task.completionNote
      ? `${actorName}: ${task.completionNote}`
      : `${actorName} "${task.title}" ni ${newStatus} ga o'zgartirdi`;

    await Promise.all(
      Array.from(recipientIds).map((userId) =>
        this.notifications.create({
          userId,
          actorId,
          type,
          title,
          message,
          entityType: 'task',
          entityId: task.id,
          actionUrl: taskUrl,
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            oldStatus,
            newStatus,
            completionNote: task.completionNote ?? null,
          },
        }),
      ),
    );
  }

  async remove(taskId: string, userId: string): Promise<void> {
    const task = await this.getTask(taskId);
    const member = await this.assertMember(task.workspaceId, userId);

    if (task.creatorId !== userId) {
      this.permission.assertCanDeleteTask(member as any);
    }

    const { workspaceId } = task;
    await this.dataSource.query(`UPDATE tasks SET deleted_at = now(), deleted_by = $2 WHERE id = $1`, [taskId, userId]);
    this.gateway.broadcastToWorkspace(workspaceId, 'task:deleted', { taskId, workspaceId });
    await this.syncProjectStatusWithProgress(task.projectId);
  }

  // ─────────────────────────────────────────────
  //  Move (Kanban drag-and-drop)
  // ─────────────────────────────────────────────

  async move(taskId: string, userId: string, dto: MoveTaskDto): Promise<Task> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const oldColumnId = task.columnId;
    const oldStatus = task.status;

    const patch: Record<string, unknown> = {};

    if (dto.columnId !== undefined) {
      if (dto.columnId) {
        const colRows = await this.dataSource.query(
          `SELECT id, maps_to_status AS "mapsToStatus" FROM project_columns WHERE id = $1 AND project_id = $2`,
          [dto.columnId, task.projectId],
        );
        const col = colRows[0];
        if (!col)
          throw new NotFoundException({ code: ErrorCode.COLUMN_NOT_FOUND, message: 'Target column not found in this project' });
        patch.columnId = dto.columnId;

        // Auto-sync status from column mapping if no explicit status given
        if (!dto.status && col.mapsToStatus) {
          patch.status = col.mapsToStatus;
        }
      } else {
        patch.columnId = null;
      }
    }

    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.position !== undefined) patch.position = dto.position;

    const finalStatus = (patch.status as TaskStatus | undefined) ?? task.status;
    if (finalStatus === TaskStatus.DONE && !task.completedAt) {
      patch.completedAt = new Date();
    } else if (finalStatus !== TaskStatus.DONE) {
      patch.completedAt = null;
    }

    const { setClause, values } = buildUpdateSet(patch, 2, TASK_ENUM_CASTS);
    let saved = task;
    if (setClause) {
      const rows: Task[] = normalizeReturning(
        await this.dataSource.query(
          `UPDATE tasks SET ${setClause} WHERE id = $1 RETURNING ${TASK_COLUMNS_SQL}`,
          [taskId, ...values],
        ),
      );
      saved = rows[0];
    }

    if (saved.columnId !== oldColumnId || saved.status !== oldStatus) {
      await this.logActivity(
        taskId,
        userId,
        'task_moved',
        `Task moved to column ${saved.columnId ?? 'none'} with status ${saved.status}`,
        {
          old_column: oldColumnId,
          new_column: saved.columnId,
          old_status: oldStatus,
          new_status: saved.status,
        },
      );
    }

    this.gateway.broadcastToWorkspace(saved.workspaceId, 'task:moved', {
      task: saved,
      oldColumnId,
      oldStatus,
    });

    if (saved.status !== oldStatus) {
      await this.syncProjectStatusWithProgress(saved.projectId);
      if (saved.status === TaskStatus.DONE) {
        await this.dailyStats.increment(saved.assigneeId ?? userId, saved.projectId, saved.workspaceId, {
          tasksCompleted: 1,
        });
      }
    }

    return saved;
  }

  // ─────────────────────────────────────────────
  //  Watchers
  // ─────────────────────────────────────────────

  async watch(taskId: string, userId: string): Promise<{ watching: boolean }> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const existing = await this.dataSource.query(`SELECT * FROM task_watchers WHERE task_id = $1 AND user_id = $2`, [taskId, userId]);
    if (existing[0]) return { watching: true };

    await this.dataSource.query(
      `INSERT INTO task_watchers (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [taskId, userId],
    );
    return { watching: true };
  }

  async unwatch(
    taskId: string,
    userId: string,
  ): Promise<{ watching: boolean }> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    await this.dataSource.query(`DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2`, [taskId, userId]);
    return { watching: false };
  }

  async getWatchers(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);
    const rows: any[] = await this.dataSource.query(
      `SELECT tw.user_id AS "userId", tw.created_at AS "createdAt",
              u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName", u.avatar_url AS "u_avatarUrl"
       FROM task_watchers tw JOIN users u ON u.id = tw.user_id WHERE tw.task_id = $1`,
      [taskId],
    );
    return rows.map((r) => ({
      userId: r.userId,
      createdAt: r.createdAt,
      user: { id: r.u_id, firstName: r.u_firstName, lastName: r.u_lastName, avatarUrl: r.u_avatarUrl },
    }));
  }

  // ─────────────────────────────────────────────
  //  Activities
  // ─────────────────────────────────────────────

  async getActivities(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const rows: any[] = await this.dataSource.query(
      `SELECT ta.id, ta.task_id AS "taskId", ta.user_id AS "userId", ta.type, ta.description,
              ta.metadata, ta.created_at AS "createdAt",
              u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName", u.avatar_url AS "u_avatarUrl"
       FROM task_activities ta
       LEFT JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = $1
       ORDER BY ta.created_at DESC
       LIMIT 100`,
      [taskId],
    );

    return rows.map((r) => {
      const { u_id, u_firstName, u_lastName, u_avatarUrl, ...activity } = r;
      return {
        ...activity,
        user: u_id ? { id: u_id, firstName: u_firstName, lastName: u_lastName, avatarUrl: u_avatarUrl } : null,
      };
    });
  }

  async getPushesForTask(projectId: string, taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    if (task.projectId !== projectId) {
      throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found in this project' });
    }
    await this.assertMember(task.workspaceId, userId);

    return this.dataSource.query(
      `SELECT ${TASK_PUSH_COLUMNS_SQL} FROM task_pushes WHERE task_id = $1 ORDER BY created_at DESC`,
      [taskId],
    );
  }

  // ─────────────────────────────────────────────
  //  Dependencies
  // ─────────────────────────────────────────────

  async addDependency(
    taskId: string,
    userId: string,
    dto: AddDependencyDto,
  ): Promise<TaskDependency> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    if (taskId === dto.dependsOnId) {
      throw new BadRequestException({ code: ErrorCode.TASK_SELF_DEPENDENCY, message: 'A task cannot depend on itself' });
    }

    // Ensure target task exists and is in the same workspace
    const target = await this.getTask(dto.dependsOnId);
    if (target.workspaceId !== task.workspaceId) {
      throw new BadRequestException({ code: ErrorCode.TASK_CROSS_WORKSPACE, message: 'Dependencies must be within the same workspace' });
    }

    // Cycle detection using local BFS (single query)
    if (await this.hasCycle(taskId, dto.dependsOnId, task.workspaceId)) {
      throw new ConflictException({ code: ErrorCode.TASK_DEPENDENCY_CYCLE, message: 'Adding this dependency would create a cycle' });
    }

    const existing = await this.dataSource.query(
      `SELECT id FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2`,
      [taskId, dto.dependsOnId],
    );
    if (existing[0]) throw new ConflictException({ code: ErrorCode.DEPENDENCY_ALREADY_EXISTS, message: 'This dependency already exists' });

    const rows: TaskDependency[] = await this.dataSource.query(
      `INSERT INTO task_dependencies (task_id, depends_on_id, type, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TASK_DEPENDENCY_COLUMNS_SQL}`,
      [taskId, dto.dependsOnId, dto.type, userId],
    );
    return rows[0];
  }

  async getDependencies(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    return this.dataSource.query(
      `SELECT dep.id, dep.task_id AS "taskId", dep.depends_on_id AS "dependsOnId", dep.type,
              dep.created_by AS "createdById", dep.created_at AS "createdAt",
              t.id AS "t_id", t.title AS "t_title", t.status AS "t_status", t.task_number AS "t_taskNumber"
       FROM task_dependencies dep
       JOIN tasks t ON t.id = dep.depends_on_id
       WHERE dep.task_id = $1`,
      [taskId],
    ).then((rows: any[]) =>
      rows.map((r) => ({
        id: r.id,
        taskId: r.taskId,
        dependsOnId: r.dependsOnId,
        type: r.type,
        createdById: r.createdById,
        createdAt: r.createdAt,
        dependsOn: { id: r.t_id, title: r.t_title, status: r.t_status, taskNumber: r.t_taskNumber },
      })),
    );
  }

  async removeDependency(
    taskId: string,
    dependencyId: string,
    userId: string,
  ): Promise<void> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const dep = await this.dataSource.query(`SELECT id FROM task_dependencies WHERE id = $1 AND task_id = $2`, [dependencyId, taskId]);
    if (!dep[0]) throw new NotFoundException({ code: ErrorCode.DEPENDENCY_NOT_FOUND, message: 'Dependency not found' });

    await this.dataSource.query(`DELETE FROM task_dependencies WHERE id = $1`, [dependencyId]);
  }

  // ─────────────────────────────────────────────
  //  Tags
  // ─────────────────────────────────────────────

  async addTag(
    taskId: string,
    tagId: string,
    userId: string,
  ): Promise<TaskTag> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    const tag = await this.dataSource.query(`SELECT id FROM tags WHERE id = $1 AND workspace_id = $2`, [tagId, task.workspaceId]);
    if (!tag[0]) throw new NotFoundException({ code: ErrorCode.TAG_NOT_FOUND, message: 'Tag not found in this workspace' });

    const existing = await this.dataSource.query(`SELECT * FROM task_tags WHERE task_id = $1 AND tag_id = $2`, [taskId, tagId]);
    if (existing[0])
      throw new ConflictException({ code: ErrorCode.TAG_ALREADY_ATTACHED, message: 'Tag already attached to this task' });

    const rows: TaskTag[] = await this.dataSource.query(
      `INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)
       RETURNING task_id AS "taskId", tag_id AS "tagId", created_at AS "createdAt"`,
      [taskId, tagId],
    );
    return rows[0];
  }

  async removeTag(
    taskId: string,
    tagId: string,
    userId: string,
  ): Promise<void> {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);

    await this.dataSource.query(`DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2`, [taskId, tagId]);
  }

  async getTags(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    await this.assertMember(task.workspaceId, userId);
    return this.dataSource.query(
      `SELECT tt.task_id AS "taskId", tt.tag_id AS "tagId", tt.created_at AS "createdAt",
              t.id AS "t_id", t.name AS "t_name", t.color AS "t_color"
       FROM task_tags tt JOIN tags t ON t.id = tt.tag_id WHERE tt.task_id = $1`,
      [taskId],
    ).then((rows: any[]) => rows.map((r) => ({
      taskId: r.taskId,
      tagId: r.tagId,
      createdAt: r.createdAt,
      tag: { id: r.t_id, name: r.t_name, color: r.t_color },
    })));
  }
}
