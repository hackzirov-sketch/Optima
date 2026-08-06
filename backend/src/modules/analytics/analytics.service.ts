import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { DatabaseService } from '../../database/database.service';

import { MembersService } from '../workspaces/services/members.service';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.keys';

/**
 * Analytics are counts and rollups over whole tables — the most expensive
 * reads in the app, and the ones least sensitive to being a minute old. A
 * dashboard that says "47 open tasks" is no less useful for having said so
 * sixty seconds ago, so these are cached on a plain TTL with no invalidation:
 * every write that could change a number would otherwise have to know about
 * this cache, which is a lot of coupling to buy freshness nobody is looking at.
 */
const ANALYTICS_TTL_SECONDS = 60;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly membersService: MembersService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Runs `compute` unless a fresh answer is already cached.
   *
   * Authorization is deliberately *not* part of this — callers check
   * membership before calling, so a cached payload is never a way to reach
   * data the caller couldn't have queried directly. The key is the resource,
   * not the viewer, so two members of a workspace share one entry.
   */
  private async cached<T>(
    scope: string,
    id: string,
    compute: () => Promise<T>,
  ): Promise<T> {
    const key = RedisKeys.analytics(scope, id);
    const hit = await this.redis.getJson<T>(key);
    if (hit !== null) return hit;
    const value = await compute();
    await this.redis.setJson(key, value, ANALYTICS_TTL_SECONDS);
    return value;
  }

  private async getActiveProject(
    projectId: string,
  ): Promise<{ id: string; workspaceId: string }> {
    const rows = await this.dataSource.query<{
      id: string;
      workspaceId: string;
      deletedAt: Date | null;
    }>(
      `SELECT id, workspace_id AS "workspaceId", deleted_at AS "deletedAt" FROM projects WHERE id = $1`,
      [projectId],
    );
    const project = rows[0];
    if (!project || project.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found',
      });
    }
    return project;
  }

  async workspaceOverview(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);
    return this.cached('ws-overview', workspaceId, () =>
      this.computeWorkspaceOverview(workspaceId),
    );
  }

  private async computeWorkspaceOverview(workspaceId: string) {
    const [projectCountRows, memberCountRows, taskByStatus] = await Promise.all(
      [
        this.dataSource.query(
          `SELECT COUNT(*) FROM projects WHERE workspace_id = $1 AND deleted_at IS NULL`,
          [workspaceId],
        ),
        this.dataSource.query(
          `SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1`,
          [workspaceId],
        ),
        this.dataSource.query(
          `SELECT status, COUNT(*) AS count FROM tasks
         WHERE workspace_id = $1 AND deleted_at IS NULL
         GROUP BY status`,
          [workspaceId],
        ),
      ],
    );

    const projectCount = Number(projectCountRows[0]?.count ?? 0);
    const memberCount = Number(memberCountRows[0]?.count ?? 0);

    const totalTasks = taskByStatus.reduce(
      (sum: number, row: any) => sum + Number(row.count ?? 0),
      0,
    );
    const completedTasks = taskByStatus
      .filter((row: any) => row.status === 'done')
      .reduce((sum: number, row: any) => sum + Number(row.count ?? 0), 0);

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
    const project = await this.getActiveProject(projectId);
    await this.membersService.assertMember(project.workspaceId, userId);
    return this.cached('project', projectId, () =>
      this.computeProjectAnalytics(projectId),
    );
  }

  private async computeProjectAnalytics(projectId: string) {
    const rows = await this.dataSource.query(
      `SELECT
         SUM(commits_count) AS commits,
         SUM(pushes_count) AS pushes,
         SUM(approved_pushes) AS "approvedPushes",
         SUM(rejected_pushes) AS "rejectedPushes",
         SUM(tasks_completed) AS "tasksCompleted"
       FROM developer_project_stats
       WHERE project_id = $1`,
      [projectId],
    );

    return { projectId, aggregates: rows[0] };
  }

  async projectDevelopers(projectId: string, userId: string) {
    const project = await this.getActiveProject(projectId);
    await this.membersService.assertMember(project.workspaceId, userId);
    return this.cached('project-devs', projectId, () =>
      this.computeProjectDevelopers(projectId),
    );
  }

  private async computeProjectDevelopers(projectId: string) {
    const rows = await this.dataSource.query<any>(
      `SELECT
         s.id, s.user_id AS "userId", s.project_id AS "projectId",
         s.commits_count AS "commitsCount", s.pushes_count AS "pushesCount",
         s.approved_pushes AS "approvedPushes", s.rejected_pushes AS "rejectedPushes",
         s.tasks_completed AS "tasksCompleted", s.tasks_in_progress AS "tasksInProgress",
         s.added_lines AS "addedLines", s.removed_lines AS "removedLines",
         s.review_score AS "reviewScore", s.review_count AS "reviewCount",
         s.updated_at AS "updatedAt",
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.avatar_url AS "u_avatarUrl"
       FROM developer_project_stats s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.project_id = $1
       ORDER BY s.updated_at DESC`,
      [projectId],
    );

    return rows.map((r) => {
      const { u_id, u_firstName, u_lastName, u_avatarUrl, ...stats } = r;
      return {
        ...stats,
        user: u_id
          ? {
              id: u_id,
              firstName: u_firstName,
              lastName: u_lastName,
              avatarUrl: u_avatarUrl,
            }
          : null,
      };
    });
  }

  async myAnalytics(userId: string) {
    return this.cached('me', userId, () => this.computeMyAnalytics(userId));
  }

  private async computeMyAnalytics(userId: string) {
    const [rows, recentDaily] = await Promise.all([
      this.dataSource.query(
        `SELECT
           s.id, s.user_id AS "userId", s.project_id AS "projectId",
           s.commits_count AS "commitsCount", s.pushes_count AS "pushesCount",
           s.approved_pushes AS "approvedPushes", s.rejected_pushes AS "rejectedPushes",
           s.tasks_completed AS "tasksCompleted", s.tasks_in_progress AS "tasksInProgress",
           s.added_lines AS "addedLines", s.removed_lines AS "removedLines",
           s.review_score AS "reviewScore", s.review_count AS "reviewCount",
           s.updated_at AS "updatedAt",
           p.id AS "p_id", p.name AS "p_name", p.slug AS "p_slug"
         FROM developer_project_stats s
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.user_id = $1
         ORDER BY s.updated_at DESC`,
        [userId],
      ),
      this.dataSource.query(
        `SELECT id, user_id AS "userId", project_id AS "projectId", workspace_id AS "workspaceId",
                date, commits_count AS "commitsCount", tasks_completed AS "tasksCompleted",
                pushes_submitted AS "pushesSubmitted", pushes_approved AS "pushesApproved",
                added_lines AS "addedLines", removed_lines AS "removedLines",
                active_minutes AS "activeMinutes"
         FROM developer_daily_stats
         WHERE user_id = $1
         ORDER BY date DESC
         LIMIT 14`,
        [userId],
      ),
    ]);

    const projectStats = rows.map((r: any) => {
      const { p_id, p_name, p_slug, ...stats } = r;
      return {
        ...stats,
        project: p_id ? { id: p_id, name: p_name, slug: p_slug } : null,
      };
    });

    return { projectStats, recentDaily };
  }
}
