import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeveloperDailyStats } from '../../database/entities/developer-daily-stats.entity';

type Increments = Partial<
  Pick<
    DeveloperDailyStats,
    | 'tasksCompleted'
    | 'pushesSubmitted'
    | 'pushesApproved'
    | 'commitsCount'
    | 'addedLines'
    | 'removedLines'
    | 'activeMinutes'
  >
>;

/**
 * `developer_daily_stats` was queried by AnalyticsService but nothing ever
 * wrote to it — the "developer activity over time" section of analytics was
 * always empty. This upserts one row per (user, project, day) and bumps the
 * relevant counters; call it from the events that already fire elsewhere
 * (task completed, push submitted/approved) instead of adding a separate
 * heavyweight aggregation job.
 */
@Injectable()
export class DailyStatsService {
  constructor(
    @InjectRepository(DeveloperDailyStats)
    private readonly repo: Repository<DeveloperDailyStats>,
  ) {}

  async increment(
    userId: string,
    projectId: string,
    workspaceId: string,
    inc: Increments,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let row = await this.repo.findOne({
      where: { userId, projectId, date: today },
    });

    if (!row) {
      row = this.repo.create({
        userId,
        projectId,
        workspaceId,
        date: today,
        commitsCount: 0,
        tasksCompleted: 0,
        pushesSubmitted: 0,
        pushesApproved: 0,
        addedLines: 0,
        removedLines: 0,
        activeMinutes: 0,
      });
    }

    for (const [key, value] of Object.entries(inc)) {
      const k = key as keyof Increments;
      (row[k] as number) = (row[k] as number) + (value ?? 0);
    }

    // Unique(userId, projectId, date) — a concurrent request racing us here
    // just means one of the two increments loses a duplicate insert; that's
    // acceptable for a best-effort activity counter, not billing-critical.
    await this.repo.save(row);
  }
}
