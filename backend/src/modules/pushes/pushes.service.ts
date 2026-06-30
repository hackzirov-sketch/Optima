import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { TaskPush } from '../../database/entities/task-push.entity';
import { PushReviewComment } from '../../database/entities/push-review-comment.entity';
import { Task } from '../../database/entities/task.entity';
import { Repository as LinkedRepository } from '../../database/entities/repository.entity';
import { WorkspaceGithubInstallation } from '../../database/entities/workspace-github-installation.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';

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

@Injectable()
export class PushesService {
  constructor(
    @InjectRepository(TaskPush)
    private readonly pushRepo: Repository<TaskPush>,
    @InjectRepository(PushReviewComment)
    private readonly commentRepo: Repository<PushReviewComment>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(LinkedRepository)
    private readonly repoEntity: Repository<LinkedRepository>,
    @InjectRepository(WorkspaceGithubInstallation)
    private readonly installationRepo: Repository<WorkspaceGithubInstallation>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(TaskActivity)
    private readonly activityRepo: Repository<TaskActivity>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly permission: PermissionService,
  ) {}

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
    const m = await this.wsMemberRepo.findOne({
      where: { workspaceId, userId },
    });
    if (!m)
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'You are not a member of this workspace' });
    return m;
  }

  private assertReviewer(member: WorkspaceMember) {
    this.permission.assertCanReviewPush(member);
  }

  private assertApprover(member: WorkspaceMember) {
    this.permission.assertCanApprovePush(member);
  }

  private async loadPush(pushId: string): Promise<TaskPush> {
    const push = await this.pushRepo.findOne({
      where: { id: pushId },
      relations: ['task', 'repository'],
    });
    if (!isActiveEntity(push)) throw new NotFoundException({ code: ErrorCode.PUSH_NOT_FOUND, message: 'Push not found' });
    return push;
  }

  private async assertPushVisible(push: TaskPush, userId: string) {
    const task = await this.taskRepo.findOne({ where: { id: push.taskId } });
    if (!task) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });
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
    repo: LinkedRepository | null,
  ): Promise<PushType> {
    if (!repo) return PushType.DRAFT;

    const installation = await this.installationRepo.findOne({ where: { workspaceId } });
    if (!installation) return PushType.UPZ_REVIEW;

    return ROLE_LEVEL[submitter.role] >= ROLE_LEVEL[WorkspaceRole.SENIOR]
      ? PushType.GITHUB_DIRECT
      : PushType.UPZ_REVIEW;
  }

  async listMine(userId: string, q: ListPushesQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const qb = this.pushRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.task', 'task')
      .where('p.userId = :userId', { userId })
      .andWhere('p.deletedAt IS NULL')
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (q.taskId) qb.andWhere('p.taskId = :taskId', { taskId: q.taskId });
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async submit(userId: string, dto: SubmitPushDto) {
    const task = await this.taskRepo.findOne({ where: { id: dto.taskId } });
    if (!isActiveEntity(task)) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });

    const member = await this.assertMember(task.workspaceId, userId);

    let repo: LinkedRepository | null = null;
    if (dto.repositoryId) {
      repo = await this.repoEntity.findOne({ where: { id: dto.repositoryId } });
      if (!repo || repo.workspaceId !== task.workspaceId) {
        throw new BadRequestException({ code: ErrorCode.REPO_NOT_FOUND, message: 'Repository does not belong to this task workspace' });
      }
    }

    const pushType = await this.resolvePushType(task.workspaceId, member, repo);

    const push = this.pushRepo.create({
      taskId: dto.taskId,
      userId,
      repositoryId: dto.repositoryId ?? null,
      branchName: dto.branchName,
      commitMessage: dto.commitMessage,
      commitSha: dto.commitSha,
      commitsCount: dto.commitsCount,
      cliVersion: dto.cliVersion,
      type: pushType,
      status: PushStatus.PENDING,
    });
    const saved = await this.pushRepo.save(push);

    try {
      const { key, url } = await this.storage.uploadBase64(
        dto.diffBundleBase64,
        'pushes',
      );
      const expires = new Date();
      expires.setDate(expires.getDate() + this.artifactTtlDays());

      saved.storageKey = key;
      saved.storageUrl = url;
      saved.status = PushStatus.UPLOADED;
      saved.expiresAt = expires;
      await this.pushRepo.save(saved);
    } catch {
      saved.status = PushStatus.PENDING;
      await this.pushRepo.save(saved);
      throw new BadRequestException({ code: ErrorCode.PUSH_UPLOAD_FAILED, message: 'Failed to upload diff bundle to storage' });
    }

    const act = this.activityRepo.create({
      taskId: task.id,
      userId,
      type: 'push_submitted',
      description: `Push submitted for review (${saved.id})`,
      metadata: { pushId: saved.id, branch: dto.branchName },
    });
    await this.activityRepo.save(act);

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
    const task = await this.taskRepo.findOne({ where: { id: push.taskId } });
    if (!task) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });

    const requester = await this.assertMember(task.workspaceId, requesterId);
    this.assertApprover(requester); // lead, admin, or owner

    if (push.type !== PushType.DRAFT) {
      throw new BadRequestException({ code: ErrorCode.PUSH_NOT_DRAFT, message: 'Only draft pushes can be linked to a repository' });
    }

    const repo = await this.repoEntity.findOne({ where: { id: dto.repositoryId } });
    if (!repo || repo.workspaceId !== task.workspaceId) {
      throw new BadRequestException({ code: ErrorCode.REPO_NOT_FOUND, message: 'Repository does not belong to this task workspace' });
    }

    const submitter = await this.wsMemberRepo.findOne({
      where: { workspaceId: task.workspaceId, userId: push.userId },
    });
    const newType = submitter
      ? await this.resolvePushType(task.workspaceId, submitter, repo)
      : PushType.UPZ_REVIEW;

    push.repositoryId = repo.id;
    push.type = newType;
    await this.pushRepo.save(push);

    await this.activityRepo.save(
      this.activityRepo.create({
        taskId: task.id,
        userId: requesterId,
        type: 'push_linked_and_promoted',
        description: `Push ${push.id} linked to repository ${repo.fullName} and promoted to ${newType}`,
        metadata: { pushId: push.id, repositoryId: repo.id, newType },
      }),
    );

    return push;
  }

  async presignedDownload(
    pushId: string,
    userId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const push = await this.loadPush(pushId);
    await this.assertPushVisible(push, userId);
    if (!push.storageKey)
      throw new BadRequestException({ code: ErrorCode.PUSH_NO_ARTIFACT, message: 'No artifact for this push' });
    const expiresIn = 3600;
    const url = await this.storage.getPresignedDownloadUrl(
      push.storageKey,
      expiresIn,
    );
    return { url, expiresIn };
  }

  async approve(pushId: string, userId: string) {
    const push = await this.loadPush(pushId);
    const task = await this.taskRepo.findOne({ where: { id: push.taskId } });
    if (!task) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });
    const member = await this.assertMember(task.workspaceId, userId);
    this.assertApprover(member);

    if (![PushStatus.PENDING, PushStatus.UPLOADED].includes(push.status)) {
      throw new BadRequestException({ code: ErrorCode.PUSH_ALREADY_REVIEWED, message: 'Push cannot be approved in its current state' });
    }

    push.status = PushStatus.APPROVED;
    push.reviewedById = userId;
    push.reviewedAt = new Date();
    await this.pushRepo.save(push);

    await this.activityRepo.save(
      this.activityRepo.create({
        taskId: task.id,
        userId,
        type: 'push_approved',
        description: `Push ${push.id} approved`,
        metadata: { pushId: push.id },
      }),
    );

    return push;
  }

  async reject(pushId: string, userId: string, dto: ReviewPushDto) {
    const push = await this.loadPush(pushId);
    const task = await this.taskRepo.findOne({ where: { id: push.taskId } });
    if (!task) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });
    const member = await this.assertMember(task.workspaceId, userId);
    this.assertReviewer(member);

    if (![PushStatus.PENDING, PushStatus.UPLOADED].includes(push.status)) {
      throw new BadRequestException({ code: ErrorCode.PUSH_ALREADY_REVIEWED, message: 'Push cannot be rejected in its current state' });
    }

    push.status = PushStatus.REJECTED;
    push.reviewedById = userId;
    push.reviewedAt = new Date();
    push.rejectedReason = dto.reason ?? null;
    await this.pushRepo.save(push);

    await this.activityRepo.save(
      this.activityRepo.create({
        taskId: task.id,
        userId,
        type: 'push_rejected',
        description: `Push ${push.id} rejected`,
        metadata: { pushId: push.id, reason: dto.reason },
      }),
    );

    return push;
  }

  async listComments(pushId: string, userId: string) {
    await this.getById(pushId, userId);
    return this.commentRepo.find({
      where: { pushId },
      relations: ['author', 'resolvedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  async addComment(pushId: string, userId: string, dto: AddReviewCommentDto) {
    await this.getById(pushId, userId);
    const c = this.commentRepo.create({
      pushId,
      authorId: userId,
      content: dto.content,
      filePath: dto.filePath,
      lineNumber: dto.lineNumber,
      lineType: dto.lineType,
      parentId: dto.parentId,
    });
    return this.commentRepo.save(c);
  }

  async updateComment(
    pushId: string,
    commentId: string,
    userId: string,
    dto: UpdatePushCommentDto,
  ) {
    await this.getById(pushId, userId);
    const c = await this.commentRepo.findOne({
      where: { id: commentId, pushId },
    });
    if (!c) throw new NotFoundException({ code: ErrorCode.PUSH_COMMENT_NOT_FOUND, message: 'Comment not found' });
    if (c.authorId !== userId)
      throw new ForbiddenException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'You can only edit your own comments' });

    if (dto.content !== undefined) c.content = dto.content;
    if (dto.isResolved !== undefined) {
      c.isResolved = dto.isResolved;
      c.resolvedById = dto.isResolved ? userId : null;
      c.resolvedAt = dto.isResolved ? new Date() : null;
    }
    return this.commentRepo.save(c);
  }

  async deleteComment(pushId: string, commentId: string, userId: string) {
    await this.getById(pushId, userId);
    const c = await this.commentRepo.findOne({
      where: { id: commentId, pushId },
    });
    if (!c) throw new NotFoundException({ code: ErrorCode.PUSH_COMMENT_NOT_FOUND, message: 'Comment not found' });
    if (c.authorId !== userId)
      throw new ForbiddenException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'You can only delete your own comments' });
    await this.commentRepo.delete({ id: commentId });
  }

  async resolveComment(pushId: string, commentId: string, userId: string) {
    const push = await this.loadPush(pushId);
    const task = await this.taskRepo.findOne({ where: { id: push.taskId } });
    if (!task) throw new NotFoundException({ code: ErrorCode.TASK_NOT_FOUND, message: 'Task not found' });
    const member = await this.assertMember(task.workspaceId, userId);
    this.assertReviewer(member);

    const c = await this.commentRepo.findOne({
      where: { id: commentId, pushId },
    });
    if (!c) throw new NotFoundException({ code: ErrorCode.PUSH_COMMENT_NOT_FOUND, message: 'Comment not found' });
    c.isResolved = true;
    c.resolvedById = userId;
    c.resolvedAt = new Date();
    return this.commentRepo.save(c);
  }
}
