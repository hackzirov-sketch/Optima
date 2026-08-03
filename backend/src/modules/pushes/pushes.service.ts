import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';

import { TaskPush } from '../../database/entities/task-push.entity';
import { PushReviewComment } from '../../database/entities/push-review-comment.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

import { StorageService } from '../storage/storage.service';
import { SubmitPushDto } from './dto/submit-push.dto';
import { ReviewPushDto } from './dto/review-push.dto';
import { AddReviewCommentDto } from './dto/add-review-comment.dto';
import { UpdatePushCommentDto } from './dto/update-push-comment.dto';
import { ListPushesQueryDto } from './dto/list-pushes-query.dto';
import { LinkAndPromotePushDto } from './dto/link-and-promote-push.dto';
import { PushStatus, PushType, WorkspaceRole } from '../../common/enums';
import { ROLE_LEVEL } from '../../common/constants/role-levels';
import { isActiveEntity } from '../../common/utils/soft-delete';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { PermissionService } from '../../common/services/permission.service';
import { DailyStatsService } from '../analytics/daily-stats.service';
import {
  TASK_PUSH_COLUMNS_SQL,
  TASK_PUSH_COLUMNS_SQL_P,
} from '../tasks/tasks.sql';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../common/utils/sql.util';

const PUSH_COMMENT_COLUMNS_SQL = `
  id, push_id AS "pushId", author_id AS "authorId", parent_id AS "parentId",
  content, file_path AS "filePath", line_number AS "lineNumber", line_type AS "lineType",
  is_resolved AS "isResolved", resolved_by AS "resolvedById", resolved_at AS "resolvedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class PushesService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly permission: PermissionService,
    private readonly dailyStats: DailyStatsService,
  ) {}

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
    const rows = await this.dataSource.query<WorkspaceMember>(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    const m = rows[0];
    if (!m)
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'You are not a member of this workspace',
      });
    return m;
  }

  private assertReviewer(member: WorkspaceMember) {
    this.permission.assertCanReviewPush(member);
  }

  private assertApprover(member: WorkspaceMember) {
    this.permission.assertCanApprovePush(member);
  }

  private async loadPush(pushId: string): Promise<TaskPush> {
    const rows = await this.dataSource.query<TaskPush>(
      `SELECT ${TASK_PUSH_COLUMNS_SQL} FROM task_pushes WHERE id = $1`,
      [pushId],
    );
    const push = rows[0] ?? null;
    if (!isActiveEntity(push))
      throw new NotFoundException({
        code: ErrorCode.PUSH_NOT_FOUND,
        message: 'Push not found',
      });
    return push;
  }

  private async getTask(taskId: string) {
    const rows = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", project_id AS "projectId" FROM tasks WHERE id = $1`,
      [taskId],
    );
    return rows[0] ?? null;
  }

  private async assertPushVisible(push: TaskPush, userId: string) {
    const task = await this.getTask(push.taskId);
    if (!task)
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found',
      });
    await this.assertMember(task.workspaceId, userId);
  }

  private artifactTtlDays(): number {
    const n = parseInt(
      this.config.get<string>('PUSH_ARTIFACT_TTL_DAYS') || '7',
      10,
    );
    return Number.isNaN(n) ? 7 : Math.min(90, Math.max(1, n));
  }

  /**
   * System design v2 §5 — PUSH TYPE QOIDASI (yakuniy):
   * push_type push yaratilganda bir marta belgilanadi, keyin o'zgarmaydi
   * (faqat status o'zgaradi).
   *
   *   repository_id mavjud VA GitHub App ulangan:
   *     developer.role >= SENIOR → github_direct
   *     aks holda                → upz_review
   *   repository ulanmagan:
   *     → draft
   */
  private async resolvePushType(
    workspaceId: string,
    submitter: WorkspaceMember,
    repo: { id: string } | null,
  ): Promise<PushType> {
    if (!repo) return PushType.DRAFT;

    const installationRows = await this.dataSource.query(
      `SELECT id FROM workspace_github_installations WHERE workspace_id = $1`,
      [workspaceId],
    );
    if (!installationRows[0]) return PushType.UPZ_REVIEW;

    return ROLE_LEVEL[submitter.role] >= ROLE_LEVEL[WorkspaceRole.SENIOR]
      ? PushType.GITHUB_DIRECT
      : PushType.UPZ_REVIEW;
  }

  async listMine(userId: string, q: ListPushesQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    const params: unknown[] = [userId];
    let whereClause = `p.user_id = $1 AND p.deleted_at IS NULL`;
    if (q.taskId) {
      params.push(q.taskId);
      whereClause += ` AND p.task_id = $${params.length}`;
    }
    if (q.status) {
      params.push(q.status);
      whereClause += ` AND p.status = $${params.length}::task_pushes_status_enum`;
    }

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*) FROM task_pushes p WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const listParams = [...params, limit, (page - 1) * limit];
    const data = await this.dataSource.query<any>(
      `SELECT
         ${TASK_PUSH_COLUMNS_SQL_P},
         t.id AS "task_id", t.title AS "task_title", t.task_number AS "task_taskNumber"
       FROM task_pushes p
       LEFT JOIN tasks t ON t.id = p.task_id
       WHERE ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    const mapped = data.map((r) => {
      const { task_id, task_title, task_taskNumber, ...push } = r;
      return {
        ...push,
        task: task_id
          ? { id: task_id, title: task_title, taskNumber: task_taskNumber }
          : null,
      };
    });

    return { data: mapped, total, page, limit };
  }

  async submit(userId: string, dto: SubmitPushDto) {
    const task = await this.getTask(dto.taskId);
    if (!isActiveEntity(task))
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found',
      });

    const member = await this.assertMember(task.workspaceId, userId);

    let repo: { id: string } | null = null;
    if (dto.repositoryId) {
      const repoRows = await this.dataSource.query(
        `SELECT id, workspace_id AS "workspaceId" FROM repositories WHERE id = $1`,
        [dto.repositoryId],
      );
      repo = repoRows[0] ?? null;
      if (!repo || (repo as any).workspaceId !== task.workspaceId) {
        throw new BadRequestException({
          code: ErrorCode.REPO_NOT_FOUND,
          message: 'Repository does not belong to this task workspace',
        });
      }
    }

    const pushType = await this.resolvePushType(task.workspaceId, member, repo);

    const savedRows = await this.dataSource.query<TaskPush>(
      `INSERT INTO task_pushes
         (task_id, user_id, repository_id, branch_name, commit_message, commit_sha,
          commits_count, cli_version, type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::task_pushes_type_enum, $10::task_pushes_status_enum)
       RETURNING ${TASK_PUSH_COLUMNS_SQL}`,
      [
        dto.taskId,
        userId,
        dto.repositoryId ?? null,
        dto.branchName,
        dto.commitMessage,
        dto.commitSha,
        dto.commitsCount,
        dto.cliVersion,
        pushType,
        PushStatus.PENDING,
      ],
    );
    let saved = savedRows[0];

    try {
      const { key, url } = await this.storage.uploadBase64(
        dto.diffBundleBase64,
        'pushes',
      );
      const expires = new Date();
      expires.setDate(expires.getDate() + this.artifactTtlDays());

      const updatedRows: TaskPush[] = normalizeReturning(
        await this.dataSource.query(
          `UPDATE task_pushes SET storage_key = $2, storage_url = $3, status = $4::task_pushes_status_enum, expires_at = $5
           WHERE id = $1 RETURNING ${TASK_PUSH_COLUMNS_SQL}`,
          [saved.id, key, url, PushStatus.UPLOADED, expires],
        ),
      );
      saved = updatedRows[0];

      await this.dailyStats.increment(
        userId,
        task.projectId,
        task.workspaceId,
        {
          pushesSubmitted: 1,
        },
      );
    } catch {
      await this.dataSource.query(
        `UPDATE task_pushes SET status = $2::task_pushes_status_enum WHERE id = $1`,
        [saved.id, PushStatus.PENDING],
      );
      throw new BadRequestException({
        code: ErrorCode.PUSH_UPLOAD_FAILED,
        message: 'Failed to upload diff bundle to storage',
      });
    }

    await this.dataSource.query(
      `INSERT INTO task_activities (task_id, user_id, type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        task.id,
        userId,
        'push_submitted',
        `Push submitted for review (${saved.id})`,
        { pushId: saved.id, branch: dto.branchName },
      ],
    );

    return this.getById(saved.id, userId);
  }

  async getById(pushId: string, userId: string): Promise<TaskPush> {
    const push = await this.loadPush(pushId);
    await this.assertPushVisible(push, userId);
    return push;
  }

  /**
   * System design v2 §5: "draft → github_direct'ga avtomatik aylanmaydi.
   * Repo keyinroq ulansa, lead/admin alohida 'link & promote' action orqali
   * qo'lda o'tkazadi (yangi GitHub API chaqiruvi + commit sha qayta
   * generatsiya talab qilingani uchun avtomatlashtirish xavfli)."
   *
   * Only callable on DRAFT pushes, only by a lead/admin/owner of the
   * workspace. Re-resolves push_type using the original submitter's role —
   * never blindly promotes to github_direct.
   */
  async linkAndPromote(
    pushId: string,
    requesterId: string,
    dto: LinkAndPromotePushDto,
  ): Promise<TaskPush> {
    const push = await this.loadPush(pushId);
    const task = await this.getTask(push.taskId);
    if (!task)
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found',
      });

    const requester = await this.assertMember(task.workspaceId, requesterId);
    this.assertApprover(requester); // lead, admin, or owner

    if (push.type !== PushType.DRAFT) {
      throw new BadRequestException({
        code: ErrorCode.PUSH_NOT_DRAFT,
        message: 'Only draft pushes can be linked to a repository',
      });
    }

    const repoRows = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", full_name AS "fullName" FROM repositories WHERE id = $1`,
      [dto.repositoryId],
    );
    const repo = repoRows[0];
    if (!repo || repo.workspaceId !== task.workspaceId) {
      throw new BadRequestException({
        code: ErrorCode.REPO_NOT_FOUND,
        message: 'Repository does not belong to this task workspace',
      });
    }

    const submitterRows = await this.dataSource.query(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [task.workspaceId, push.userId],
    );
    const submitter = submitterRows[0];
    const newType = submitter
      ? await this.resolvePushType(task.workspaceId, submitter, repo)
      : PushType.UPZ_REVIEW;

    const savedRows: TaskPush[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE task_pushes SET repository_id = $2, type = $3::task_pushes_type_enum
         WHERE id = $1 RETURNING ${TASK_PUSH_COLUMNS_SQL}`,
        [push.id, repo.id, newType],
      ),
    );
    const saved = savedRows[0];

    await this.dataSource.query(
      `INSERT INTO task_activities (task_id, user_id, type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        task.id,
        requesterId,
        'push_linked_and_promoted',
        `Push ${push.id} linked to repository ${repo.fullName} and promoted to ${newType}`,
        { pushId: push.id, repositoryId: repo.id, newType },
      ],
    );

    return saved;
  }

  async presignedDownload(
    pushId: string,
    userId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const push = await this.loadPush(pushId);
    await this.assertPushVisible(push, userId);
    if (!push.storageKey)
      throw new BadRequestException({
        code: ErrorCode.PUSH_NO_ARTIFACT,
        message: 'No artifact for this push',
      });
    const expiresIn = 3600;
    const url = await this.storage.getPresignedDownloadUrl(
      push.storageKey,
      expiresIn,
    );
    return { url, expiresIn };
  }

  async approve(pushId: string, userId: string) {
    const push = await this.loadPush(pushId);
    const task = await this.getTask(push.taskId);
    if (!task)
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found',
      });
    const member = await this.assertMember(task.workspaceId, userId);
    this.assertApprover(member);

    if (![PushStatus.PENDING, PushStatus.UPLOADED].includes(push.status)) {
      throw new BadRequestException({
        code: ErrorCode.PUSH_ALREADY_REVIEWED,
        message: 'Push cannot be approved in its current state',
      });
    }

    const savedRows: TaskPush[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE task_pushes SET status = $2::task_pushes_status_enum, reviewed_by = $3, reviewed_at = now()
         WHERE id = $1 RETURNING ${TASK_PUSH_COLUMNS_SQL}`,
        [pushId, PushStatus.APPROVED, userId],
      ),
    );
    const saved = savedRows[0];

    await this.dailyStats.increment(
      saved.userId,
      task.projectId,
      task.workspaceId,
      {
        pushesApproved: 1,
        addedLines: saved.addedLines ?? 0,
        removedLines: saved.removedLines ?? 0,
      },
    );

    await this.dataSource.query(
      `INSERT INTO task_activities (task_id, user_id, type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        task.id,
        userId,
        'push_approved',
        `Push ${saved.id} approved`,
        { pushId: saved.id },
      ],
    );

    return saved;
  }

  async reject(pushId: string, userId: string, dto: ReviewPushDto) {
    const push = await this.loadPush(pushId);
    const task = await this.getTask(push.taskId);
    if (!task)
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found',
      });
    const member = await this.assertMember(task.workspaceId, userId);
    this.assertReviewer(member);

    if (![PushStatus.PENDING, PushStatus.UPLOADED].includes(push.status)) {
      throw new BadRequestException({
        code: ErrorCode.PUSH_ALREADY_REVIEWED,
        message: 'Push cannot be rejected in its current state',
      });
    }

    const savedRows: TaskPush[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE task_pushes
         SET status = $2::task_pushes_status_enum, reviewed_by = $3, reviewed_at = now(), rejected_reason = $4
         WHERE id = $1 RETURNING ${TASK_PUSH_COLUMNS_SQL}`,
        [pushId, PushStatus.REJECTED, userId, dto.reason ?? null],
      ),
    );
    const saved = savedRows[0];

    await this.dataSource.query(
      `INSERT INTO task_activities (task_id, user_id, type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        task.id,
        userId,
        'push_rejected',
        `Push ${saved.id} rejected`,
        { pushId: saved.id, reason: dto.reason },
      ],
    );

    return saved;
  }

  async listComments(pushId: string, userId: string) {
    await this.getById(pushId, userId);
    const rows = await this.dataSource.query<any>(
      `SELECT c.*,
              a.id AS "a_id", a.first_name AS "a_firstName", a.last_name AS "a_lastName", a.avatar_url AS "a_avatarUrl",
              r.id AS "r_id", r.first_name AS "r_firstName", r.last_name AS "r_lastName"
       FROM (
         SELECT ${PUSH_COMMENT_COLUMNS_SQL} FROM push_review_comments WHERE push_id = $1
       ) c
       LEFT JOIN users a ON a.id = c."authorId"
       LEFT JOIN users r ON r.id = c."resolvedById"
       ORDER BY c."createdAt" ASC`,
      [pushId],
    );
    return rows.map((r) => {
      const {
        a_id,
        a_firstName,
        a_lastName,
        a_avatarUrl,
        r_id,
        r_firstName,
        r_lastName,
        ...comment
      } = r;
      return {
        ...comment,
        author: a_id
          ? {
              id: a_id,
              firstName: a_firstName,
              lastName: a_lastName,
              avatarUrl: a_avatarUrl,
            }
          : null,
        resolvedBy: r_id
          ? { id: r_id, firstName: r_firstName, lastName: r_lastName }
          : null,
      };
    });
  }

  async addComment(pushId: string, userId: string, dto: AddReviewCommentDto) {
    await this.getById(pushId, userId);
    const rows = await this.dataSource.query<PushReviewComment>(
      `INSERT INTO push_review_comments (push_id, author_id, content, file_path, line_number, line_type, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PUSH_COMMENT_COLUMNS_SQL}`,
      [
        pushId,
        userId,
        dto.content,
        dto.filePath ?? null,
        dto.lineNumber ?? null,
        dto.lineType ?? null,
        dto.parentId ?? null,
      ],
    );
    return rows[0];
  }

  async updateComment(
    pushId: string,
    commentId: string,
    userId: string,
    dto: UpdatePushCommentDto,
  ) {
    await this.getById(pushId, userId);
    const rows = await this.dataSource.query<PushReviewComment>(
      `SELECT ${PUSH_COMMENT_COLUMNS_SQL} FROM push_review_comments WHERE id = $1 AND push_id = $2`,
      [commentId, pushId],
    );
    const c = rows[0];
    if (!c)
      throw new NotFoundException({
        code: ErrorCode.PUSH_COMMENT_NOT_FOUND,
        message: 'Comment not found',
      });
    if (c.authorId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'You can only edit your own comments',
      });

    const patch: Record<string, unknown> = {};
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.isResolved !== undefined) {
      patch.isResolved = dto.isResolved;
      patch.resolvedById = dto.isResolved ? userId : null;
      patch.resolvedAt = dto.isResolved ? new Date() : null;
    }

    const { setClause, values } = buildUpdateSet(patch, 2);
    if (!setClause) return c;

    const updatedRows: PushReviewComment[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE push_review_comments SET ${setClause} WHERE id = $1 RETURNING ${PUSH_COMMENT_COLUMNS_SQL}`,
        [commentId, ...values],
      ),
    );
    return updatedRows[0];
  }

  async deleteComment(pushId: string, commentId: string, userId: string) {
    await this.getById(pushId, userId);
    const rows = await this.dataSource.query(
      `SELECT author_id AS "authorId" FROM push_review_comments WHERE id = $1 AND push_id = $2`,
      [commentId, pushId],
    );
    const c = rows[0];
    if (!c)
      throw new NotFoundException({
        code: ErrorCode.PUSH_COMMENT_NOT_FOUND,
        message: 'Comment not found',
      });
    if (c.authorId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'You can only delete your own comments',
      });
    await this.dataSource.query(
      `DELETE FROM push_review_comments WHERE id = $1`,
      [commentId],
    );
  }

  async resolveComment(pushId: string, commentId: string, userId: string) {
    const push = await this.loadPush(pushId);
    const task = await this.getTask(push.taskId);
    if (!task)
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found',
      });
    const member = await this.assertMember(task.workspaceId, userId);
    this.assertReviewer(member);

    const rows: PushReviewComment[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE push_review_comments SET is_resolved = true, resolved_by = $2, resolved_at = now()
         WHERE id = $1 AND push_id = $3
         RETURNING ${PUSH_COMMENT_COLUMNS_SQL}`,
        [commentId, userId, pushId],
      ),
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.PUSH_COMMENT_NOT_FOUND,
        message: 'Comment not found',
      });
    return rows[0];
  }
}
