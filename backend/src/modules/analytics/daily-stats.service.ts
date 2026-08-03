import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

type Increments = Partial<{
  tasksCompleted: number;
  pushesSubmitted: number;
  pushesApproved: number;
  commitsCount: number;
  addedLines: number;
  removedLines: number;
  activeMinutes: number;
}>;

const INCREMENT_COLUMNS: Record<keyof Increments, string> = {
  tasksCompleted: 'tasks_completed',
  pushesSubmitted: 'pushes_submitted',
  pushesApproved: 'pushes_approved',
  commitsCount: 'commits_count',
  addedLines: 'added_lines',
  removedLines: 'removed_lines',
  activeMinutes: 'active_minutes',
};

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
  constructor(private readonly dataSource: DatabaseService) {}

  async increment(
    userId: string,
    projectId: string,
    workspaceId: string,
    inc: Increments,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const entries = Object.entries(inc).filter(
      ([, v]) => v !== undefined,
    ) as Array<[keyof Increments, number]>;
    if (entries.length === 0) return;

    // Atomic upsert via ON CONFLICT — avoids the read-then-write race the
    // previous find-or-create + save() pattern had under concurrent requests
    // (e.g. two tasks completed by the same dev in the same second).
    const insertCols = entries.map(([k]) => INCREMENT_COLUMNS[k]);
    const insertVals = entries.map(([, v]) => v);
    const conflictSet = insertCols
      .map((col) => `${col} = developer_daily_stats.${col} + EXCLUDED.${col}`)
      .join(', ');

    await this.dataSource.query(
      `INSERT INTO developer_daily_stats (user_id, project_id, workspace_id, date, ${insertCols.join(', ')})
       VALUES ($1, $2, $3, $4, ${insertVals.map((_, i) => `$${i + 5}`).join(', ')})
       ON CONFLICT (user_id, project_id, date)
       DO UPDATE SET ${conflictSet}`,
      [userId, projectId, workspaceId, today, ...insertVals],
    );
  }
}
