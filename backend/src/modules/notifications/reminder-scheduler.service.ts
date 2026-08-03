import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../../redis/redis.service';
import { ReminderJobType } from '../../common/enums';
import {
  REMINDER_QUEUE,
  ReminderJobData,
} from './processors/reminder.processor';

const MS = {
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue(REMINDER_QUEUE) private readonly queue: Queue,
    private readonly redis: RedisService,
  ) {}

  /**
   * Schedule all 4 meeting reminder jobs.
   * Safe to call on create AND update — removes old jobs first.
   */
  async scheduleMeetingReminders(
    meetingId: string,
    scheduledAt: Date,
  ): Promise<void> {
    // Cancel existing jobs
    await this.cancelMeetingReminders(meetingId);

    const now = Date.now();
    const meetingTime = scheduledAt.getTime();

    const reminders: Array<{ type: ReminderJobType; delay: number }> = [
      { type: ReminderJobType.MEETING_24H, delay: meetingTime - 24 * MS.h },
      { type: ReminderJobType.MEETING_3H, delay: meetingTime - 3 * MS.h },
      { type: ReminderJobType.MEETING_30M, delay: meetingTime - 30 * MS.min },
      { type: ReminderJobType.MEETING_5M, delay: meetingTime - 5 * MS.min },
    ];

    for (const { type, delay } of reminders) {
      const fireAt = delay - now;
      if (fireAt <= 0) continue; // already passed

      const jobId = `meeting:${meetingId}:${type}`;
      await this.queue.add(
        type,
        { type, entityId: meetingId } satisfies ReminderJobData,
        {
          jobId, // idempotent — BullMQ ignores duplicate jobId
          delay: fireAt,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 24 * 3600 },
        },
      );
      this.logger.log(
        `Scheduled ${type} for meeting=${meetingId} in ${Math.round(fireAt / MS.min)}m`,
      );
    }

    // Track scheduled jobs in Redis for fast cancellation
    await this.markScheduled(meetingId, 'meeting');
  }

  async cancelMeetingReminders(meetingId: string): Promise<void> {
    const types = Object.values(ReminderJobType).filter((t) =>
      t.startsWith('meeting_'),
    );
    await Promise.allSettled(
      types.map((type) => this.queue.remove(`meeting:${meetingId}:${type}`)),
    );
  }

  /**
   * Schedule task deadline reminders.
   * Only schedules if dueDate is > 2h from now.
   */
  async scheduleTaskReminders(taskId: string, dueDate: Date): Promise<void> {
    await this.cancelTaskReminders(taskId);

    const now = Date.now();
    const due = dueDate.getTime();

    const reminders: Array<{ type: ReminderJobType; delay: number }> = [
      { type: ReminderJobType.TASK_3D, delay: due - 3 * MS.d },
      { type: ReminderJobType.TASK_1D, delay: due - 1 * MS.d },
      { type: ReminderJobType.TASK_2H, delay: due - 2 * MS.h },
    ];

    for (const { type, delay } of reminders) {
      const fireAt = delay - now;
      if (fireAt <= 0) continue;

      const jobId = `task:${taskId}:${type}`;
      await this.queue.add(
        type,
        { type, entityId: taskId } satisfies ReminderJobData,
        {
          jobId,
          delay: fireAt,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 24 * 3600 },
        },
      );
      this.logger.log(
        `Scheduled ${type} for task=${taskId} in ${Math.round(fireAt / MS.h)}h`,
      );
    }

    await this.markScheduled(taskId, 'task');
  }

  async cancelTaskReminders(taskId: string): Promise<void> {
    const types = Object.values(ReminderJobType).filter((t) =>
      t.startsWith('task_'),
    );
    await Promise.allSettled(
      types.map((type) => this.queue.remove(`task:${taskId}:${type}`)),
    );
  }

  private async markScheduled(
    entityId: string,
    type: 'meeting' | 'task',
  ): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (client) {
        await client.set(
          RedisKeys_ext.reminderScheduled(entityId, type),
          '1',
          'EX',
          7 * 24 * 3600,
        );
      }
    } catch (e) {
      // Redis is a cache here, not the source of truth — marking a reminder as scheduled
      // failing must not break the caller. Logged rather than swallowed
      // silently, so an outage is visible instead of just slow.
      this.logger.warn(
        `Redis unavailable while marking a reminder as scheduled: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

// Local helper since we can't import from the non-existent extended redis keys yet
const RedisKeys_ext = {
  reminderScheduled: (id: string, type: string) =>
    `upz:reminder:sched:${id}:${type}`,
};
