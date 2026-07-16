import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

import {
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
  NotificationType,
  ReminderJobType,
} from '../../../common/enums';
import { NotificationsService } from '../notifications.service';
import { RedisService } from '../../../redis/redis.service';
import { NotificationDispatcherService } from '../notification-dispatcher.service';

export const REMINDER_QUEUE = 'reminders';

export interface ReminderJobData {
  type: ReminderJobType;
  entityId: string;   // meetingId or taskId
  userIds?: string[]; // override — if not set, fetched from DB
}

@Injectable()
@Processor(REMINDER_QUEUE)
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly dataSource: DatabaseService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifService: NotificationsService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { type, entityId } = job.data;
    this.logger.log(`Processing reminder: ${type} for entity=${entityId}`);

    try {
      if (type.startsWith('meeting_')) {
        await this.processMeetingReminder(type, entityId);
      } else if (type.startsWith('task_')) {
        await this.processTaskReminder(type, entityId);
      }
    } catch (err) {
      this.logger.error(`Reminder job failed: ${type} entity=${entityId}`, err);
      throw err; // BullMQ will retry
    }
  }

  // ── Meeting reminders ────────────────────────────────────────────────────────

  private async processMeetingReminder(type: ReminderJobType, meetingId: string): Promise<void> {
    const meetingRows: Array<{ id: string; title: string | null; startTime: Date | null; hostId: string }> =
      await this.dataSource.query(
        `SELECT id, title, start_time AS "startTime", host_id AS "hostId" FROM meetings WHERE id = $1`,
        [meetingId],
      );
    const meeting = meetingRows[0];

    if (!meeting) {
      this.logger.warn(`Meeting ${meetingId} not found — skipping reminder`);
      return;
    }

    // Don't send if meeting is in the past
    if (meeting.startTime && meeting.startTime < new Date()) {
      this.logger.log(`Meeting ${meetingId} already passed — skipping ${type}`);
      return;
    }

    const participants: Array<{ userId: string }> = await this.dataSource.query(
      `SELECT user_id AS "userId" FROM meeting_participants WHERE meeting_id = $1`,
      [meetingId],
    );
    const userIds = [...new Set([meeting.hostId, ...participants.map((p) => p.userId)])];

    const config = MEETING_REMINDER_CONFIG[type];
    if (!config) return;

    for (const userId of userIds) {
      await this.sendReminder({
        userId,
        title: config.title,
        message: config.getMessage(meeting.title ?? 'Meeting', meeting.startTime ?? undefined),
        category: NotificationCategory.MEETING,
        priority: config.priority,
        forceChannels: config.forceChannels,
        notifType: NotificationType.MEETING_INVITE,
        entityId: meetingId,
        entityType: 'meeting',
      });
    }
  }

  // ── Task reminders ───────────────────────────────────────────────────────────

  private async processTaskReminder(type: ReminderJobType, taskId: string): Promise<void> {
    // NOTE: Task has a single `assigneeId` (not a many-to-many `assignees`
    // relation — that relation doesn't exist on the entity). The previous
    // version of this method referenced `relations: ['assignees']`, which
    // would have thrown at runtime the first time this job ran.
    const taskRows: Array<{ id: string; title: string | null; dueDate: Date | null; assigneeId: string | null }> =
      await this.dataSource.query(
        `SELECT id, title, due_date AS "dueDate", assignee_id AS "assigneeId" FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
        [taskId],
      );
    const task = taskRows[0];

    if (!task) {
      this.logger.warn(`Task ${taskId} not found — skipping`);
      return;
    }

    if (!task.dueDate || task.dueDate < new Date()) {
      return;
    }

    if (!task.assigneeId) return;

    const config = TASK_REMINDER_CONFIG[type];
    if (!config) return;

    await this.sendReminder({
      userId: task.assigneeId,
      title: config.title,
      message: config.getMessage(task.title ?? 'Task'),
      category: NotificationCategory.TASK,
      priority: config.priority,
      notifType: NotificationType.TASK_UPDATED,
      entityId: taskId,
      entityType: 'task',
    });
  }

  // ── Shared sender ────────────────────────────────────────────────────────────

  private async sendReminder(params: {
    userId: string;
    title: string;
    message: string;
    category: NotificationCategory;
    priority: NotificationPriority;
    forceChannels?: NotificationChannel[];
    notifType: NotificationType;
    entityId: string;
    entityType: string;
  }): Promise<void> {
    // Dedup: don't send if already sent in last 2 min (job retry protection)
    const dedupKey = `upz:reminder:dedup:${params.userId}:${params.entityId}:${params.notifType}`;
    try {
      const client = this.redis.getClient();
      if (client) {
        const exists = await client.get(dedupKey);
        if (exists) {
          this.logger.log(`Dedup: skipping ${params.notifType} for user=${params.userId}`);
          return;
        }
        await client.set(dedupKey, '1', 'EX', 120);
      }
    } catch {}

    const notif = await this.notifService.create({
      userId: params.userId,
      type: params.notifType,
      title: params.title,
      message: params.message,
      entityType: params.entityType,
      entityId: params.entityId,
    });

    await this.dispatcher.dispatch({
      userId: params.userId,
      title: params.title,
      message: params.message,
      category: params.category,
      priority: params.priority,
      notificationId: notif.id,
      forceChannels: params.forceChannels,
    });
  }
}

// ── Config tables ─────────────────────────────────────────────────────────────

const MEETING_REMINDER_CONFIG: Partial<Record<ReminderJobType, {
  title: string;
  priority: NotificationPriority;
  forceChannels?: NotificationChannel[];
  getMessage: (title: string, date?: Date) => string;
}>> = {
  [ReminderJobType.MEETING_24H]: {
    title: '📅 Meeting eslatmasi (24 soat)',
    priority: NotificationPriority.NORMAL,
    getMessage: (title) => `"${title}" meeting ertaga boshlanadi. Tayyorgarlik ko'ring!`,
  },
  [ReminderJobType.MEETING_3H]: {
    title: '🟡 Meeting eslatmasi (3 soat)',
    priority: NotificationPriority.HIGH,
    getMessage: (title) => `"${title}" meeting 3 soatdan keyin boshlanadi.`,
  },
  [ReminderJobType.MEETING_30M]: {
    title: '🔴 Meeting boshlanadigu! (30 daqiqa)',
    priority: NotificationPriority.CRITICAL, // triggers SMS
    getMessage: (title) => `"${title}" 30 daqiqadan keyin! Kirish havolasini tekshiring.`,
  },
  [ReminderJobType.MEETING_5M]: {
    title: '🚨 Meeting hozir boshlanadi!',
    priority: NotificationPriority.CRITICAL,
    forceChannels: [NotificationChannel.IN_APP], // WebSocket only at 5min
    getMessage: (title) => `"${title}" 5 daqiqadan keyin boshlanadi!`,
  },
};

const TASK_REMINDER_CONFIG: Partial<Record<ReminderJobType, {
  title: string;
  priority: NotificationPriority;
  getMessage: (title: string) => string;
}>> = {
  [ReminderJobType.TASK_3D]: {
    title: '📋 Task deadline (3 kun)',
    priority: NotificationPriority.NORMAL,
    getMessage: (title) => `"${title}" taskining deadline 3 kunda. Rejalashtiring!`,
  },
  [ReminderJobType.TASK_1D]: {
    title: '⚠️ Task deadline ertaga!',
    priority: NotificationPriority.HIGH,
    getMessage: (title) => `"${title}" taskining deadline ertaga. Yetib oling!`,
  },
  [ReminderJobType.TASK_2H]: {
    title: '🔴 Task deadline 2 soatda!',
    priority: NotificationPriority.HIGH,
    getMessage: (title) => `"${title}" deadline 2 soatdan keyin. So'nggi imkoniyat!`,
  },
};
