import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Project } from '../../database/entities/project.entity';
import { Task } from '../../database/entities/task.entity';
import { DeveloperProjectStats } from '../../database/entities/developer-project-stats.entity';
import { DeveloperDailyStats } from '../../database/entities/developer-daily-stats.entity';
import { MembersService } from '../workspaces/members.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(DeveloperProjectStats)
    private readonly projStatsRepo: Repository<DeveloperProjectStats>,
    @InjectRepository(DeveloperDailyStats)
    private readonly dailyRepo: Repository<DeveloperDailyStats>,
    private readonly membersService: MembersService,
  ) {}

  async workspaceOverview(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);

    const projectCount = await this.projectRepo.count({
      where: { workspaceId, deletedAt: IsNull() },
    });

    const memberCount = await this.wsMemberRepo.count({
      where: { workspaceId },
    });

    const taskByStatus = await this.taskRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.workspace_id = :ws', { ws: workspaceId })
      .andWhere('t.deleted_at IS NULL')
      .groupBy('t.status')
      .getRawMany();

    const totalTasks = taskByStatus.reduce(
      (sum, row) => sum + Number(row.count ?? 0),
      0,
    );
    const completedTasks = taskByStatus
      .filter((row) => row.status === 'done')
      .reduce((sum, row) => sum + Number(row.count ?? 0), 0);

    return {
      workspaceId,
      projectCount,
      memberCount,
      totalTasks,
      completedTasks,
      openTasks: totalTasks - completedTasks,
      taskByStatus,
    };
  }

  async projectAnalytics(projectId: string, userId: string) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not found' });
    await this.membersService.assertMember(project.workspaceId, userId);

    const totals = await this.projStatsRepo
      .createQueryBuilder('s')
      .select('SUM(s.commits_count)', 'commits')
      .addSelect('SUM(s.pushes_count)', 'pushes')
      .addSelect('SUM(s.approved_pushes)', 'approvedPushes')
      .addSelect('SUM(s.rejected_pushes)', 'rejectedPushes')
      .addSelect('SUM(s.tasks_completed)', 'tasksCompleted')
      .where('s.project_id = :pid', { pid: projectId })
      .getRawOne();

    return { projectId, aggregates: totals };
  }

  async projectDevelopers(projectId: string, userId: string) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not found' });
    await this.membersService.assertMember(project.workspaceId, userId);

    return this.projStatsRepo.find({
      where: { projectId },
      relations: ['user'],
      order: { updatedAt: 'DESC' },
    });
  }

  async myAnalytics(userId: string) {
    const rows = await this.projStatsRepo.find({
      where: { userId },
      relations: ['project'],
      order: { updatedAt: 'DESC' },
    });

    const recentDaily = await this.dailyRepo.find({
      where: { userId },
      order: { date: 'DESC' },
      take: 14,
    });

    return { projectStats: rows, recentDaily };
  }
}
