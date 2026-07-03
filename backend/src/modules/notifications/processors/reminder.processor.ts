import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Meeting } from '../../../database/entities/meeting.entity';
import { Task } from '../../../database/entities/task.entity';
import { MeetingParticipant } from '../../../database/entities/meeting-participant.entity';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
  ReminderJobType,
} from '../../../common/enums';
import { NotificationsService } from '../notifications.service';
import { RedisKeys } from '../../../redis/redis.keys';
import { RedisService } from '../../../redis/redis.service';
import { NotificationDispatcherService } from 'src/modules/notifications/notification-dispatcher.service'

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
    @InjectRepository(Meeting)
    private readonly meetingRepo: Repository<Meeting>,
    @InjectRepository(MeetingParticipant)
    private readonly participantRepo: Repository<MeetingParticipant>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
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
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId },
      select: ['id', 'title', 'startTime', 'hostId'],
    });

    if (!meeting) {
      this.logger.warn(`Meeting ${meetingId} not found — skipping reminder`);
      return;
    }

    // Don't send if meeting is in the past
    if (meeting.startTime && meeting.startTime < new Date()) {
      this.logger.log(`Meeting ${meetingId} already passed — skipping ${type}`);
      return;
    }

    const participants = await this.participantRepo.find({
      where: { meetingId },
      select: ['userId'],
    });
    const userIds = [...new Set([meeting.hostId, ...participants.map(p => p.userId)])];

    const config = MEETING_REMINDER_CONFIG[type];
    if (!config) return;

    for (const userId of userIds) {
      await this.sendReminder({
        userId,
        title: config.title,
        message: config.getMessage(meeting.title ?? 'Meeting', meeting.startTime),
        category: NotificationCategory.MEETING,
        priority: config.priority,
        forceChannels: config.forceChannels,
        notifType: 'meeting_reminder',
        entityId: meetingId,
        entityType: 'meeting',
      });
    }
  }

  // ── Task reminders ───────────────────────────────────────────────────────────

  private async processTaskReminder(type: ReminderJobType, taskId: string): Promise<void> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['assignees'],
      select: { id: true, title: true, dueDate: true, assignees: { id: true } },
    } as any);

    if (!task) {
      this.logger.warn(`Task ${taskId} not found — skipping`);
      return;
    }

    if (!task.dueDate || (task as any).dueDate < new Date()) {
      return;
    }

    const userIds: string[] = (task as any).assignees?.map((a: any) => a.id) ?? [];
    if (!userIds.length) return;

    const config = TASK_REMINDER_CONFIG[type];
    if (!config) return;

    for (const userId of userIds) {
      await this.sendReminder({
        userId,
        title: config.title,
        message: config.getMessage((task as any).title ?? 'Task'),
        category: NotificationCategory.TASK,
        priority: config.priority,
        notifType: 'task_reminder',
        entityId: taskId,
        entityType: 'task',
      });
    }
  }

  // ── Shared sender ────────────────────────────────────────────────────────────

  private async sendReminder(params: {
    userId: string;
    title: string;
    message: string;
    category: NotificationCategory;
    priority: NotificationPriority;
    forceChannels?: NotificationChannel[];
    notifType: string;
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
      type: 'meeting_invite' as any, // reuse existing type — extend NotificationType later
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
