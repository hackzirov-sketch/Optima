import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
} from '../../common/enums';
import { UpdateNotifPrefsDto } from './dto/update-notif-prefs.dto';
import {
  NOTIFICATION_COLUMNS_SQL,
  NOTIFICATION_COLUMNS_SQL_N,
  NOTIFICATION_PREFS_COLUMNS_SQL,
} from './notifications.sql';
import { RedisService } from '../../redis/redis.service';
import { buildUpdateSet } from '../../common/utils/sql.util';

// NotificationDispatcherService.dispatch() routes channels off `category` +
// `priority`, but nothing populated them from the notification `type` being
// created — so every dispatch() call silently threw (PRIORITY_CHANNELS[undefined])
// and external channels (SMS/Telegram/Email) never actually fired. This maps
// every NotificationType to its channel-routing category/priority.
const NOTIFICATION_ROUTING: Record<
  string,
  { category: NotificationCategory; priority: NotificationPriority }
> = {
  [NotificationType.TASK_ASSIGNED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.HIGH,
  },
  [NotificationType.TASK_UPDATED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.TASK_COMMENTED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.TASK_COMPLETED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.TASK_STATUS_CHANGED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.PUSH_SUBMITTED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.PUSH_APPROVED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.PUSH_REJECTED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.HIGH,
  },
  [NotificationType.PR_CREATED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.PR_REVIEWED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.PR_MERGED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.PROJECT_CREATED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.LOW,
  },
  [NotificationType.PROJECT_UPDATED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.LOW,
  },
  [NotificationType.MEMBER_JOINED]: {
    category: NotificationCategory.SYSTEM,
    priority: NotificationPriority.LOW,
  },
  [NotificationType.MEMBER_ROLE_CHANGED]: {
    category: NotificationCategory.SECURITY,
    priority: NotificationPriority.NORMAL,
  },
  [NotificationType.MENTION]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.HIGH,
  },
  [NotificationType.GROUP_INVITE]: {
    category: NotificationCategory.SYSTEM,
    priority: NotificationPriority.HIGH,
  },
  [NotificationType.PROJECT_MEMBER_INVITE]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.HIGH,
  },
  [NotificationType.PROJECT_MEMBER_ACCEPTED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.LOW,
  },
  [NotificationType.PROJECT_MEMBER_DECLINED]: {
    category: NotificationCategory.TASK,
    priority: NotificationPriority.LOW,
  },
  [NotificationType.MEETING_INVITE]: {
    category: NotificationCategory.MEETING,
    priority: NotificationPriority.HIGH,
  },
};
const DEFAULT_ROUTING = {
  category: NotificationCategory.SYSTEM,
  priority: NotificationPriority.NORMAL,
};

export interface CreateNotificationInput {
  userId: string;
  actorId?: string | null;
  type: string;
  title: string;
  message?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dataSource: DatabaseService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly redis: RedisService,
  ) {}

  async create(input: CreateNotificationInput) {
    const rows = await this.dataSource.query<any>(
      `INSERT INTO notifications
         (user_id, actor_id, type, title, message, entity_type, entity_id, action_url, metadata)
       VALUES ($1, $2, $3::notifications_type_enum, $4, $5, $6, $7, $8, $9)
       RETURNING ${NOTIFICATION_COLUMNS_SQL}`,
      [
        input.userId,
        input.actorId ?? null,
        input.type,
        input.title,
        input.message ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
        input.actionUrl ?? null,
        input.metadata ?? null,
      ],
    );
    const saved = rows[0];
    await this.redis.adjustUnreadCount(input.userId, 1);

    // Real-time in-app push over WebSocket
    this.gateway.sendNotification(input.userId, { notification: saved });

    // Multi-channel dispatch (SMS/Telegram/Email) based on user prefs — fire and forget
    const routing = NOTIFICATION_ROUTING[input.type] ?? DEFAULT_ROUTING;
    void this.dispatcher
      .dispatch({
        userId: input.userId,
        title: input.title,
        message: input.message ?? '',
        category: routing.category,
        priority: routing.priority,
        notificationId: saved.id,
        metadata: input.metadata ?? undefined,
      })
      .catch(() => undefined);

    return saved;
  }

  async list(userId: string, page = 1, limit = 30) {
    const offset = (page - 1) * limit;
    const countRows = await this.dataSource.query<{ count: string }>(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1`,
      [userId],
    );
    const total = Number(countRows[0]?.count ?? 0);

    const data = await this.dataSource.query(
      `SELECT ${NOTIFICATION_COLUMNS_SQL} FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    return { data, total, page, limit };
  }

  /**
   * Read on every page load. The COUNT(*) behind it scans a table that only
   * grows, so the answer is kept in Redis and adjusted as notifications are
   * created and read; Postgres is consulted only to seed a missing counter.
   */
  async unreadCount(userId: string) {
    const cached = await this.redis.getUnreadCount(userId);
    if (cached !== null) return { count: cached };

    const rows = await this.dataSource.query<{ count: string }>(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    const count = Number(rows[0]?.count ?? 0);
    await this.redis.setUnreadCount(userId, count);
    return { count };
  }

  async markRead(userId: string, id: string) {
    // The self-join against `old` reads the pre-update snapshot of the row, so
    // one statement both performs the write and reports whether this call is
    // what flipped the flag. Marking an already-read notification as read stays
    // a success (the client clicks without checking), but must not decrement
    // the counter a second time for the same notification.
    const rows = await this.dataSource.query<any>(
      `UPDATE notifications n SET is_read = true, read_at = now()
         FROM notifications old
         WHERE n.id = old.id AND n.id = $1 AND n.user_id = $2
         RETURNING ${NOTIFICATION_COLUMNS_SQL_N}, old.is_read AS "wasRead"`,
      [id, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.NOTIFICATION_NOT_FOUND,
        message: 'Notification not found',
      });
    }
    const { wasRead, ...notification } = rows[0];
    if (!wasRead) await this.redis.adjustUnreadCount(userId, -1);
    return notification;
  }

  async markAllRead(userId: string) {
    await this.dataSource.query(
      `UPDATE notifications SET is_read = true, read_at = now() WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    await this.redis.setUnreadCount(userId, 0);
    return { message: 'All notifications marked as read' };
  }

  async remove(id: string, userId: string) {
    // `is_read` comes back so an unread notification that is deleted outright
    // (rather than read) still leaves the counter correct.
    const rows = await this.dataSource.query<{ id: string; isRead: boolean }>(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2
         RETURNING id, is_read AS "isRead"`,
      [id, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.NOTIFICATION_NOT_FOUND,
        message: 'Notification not found',
      });
    }
    if (!rows[0].isRead) await this.redis.adjustUnreadCount(userId, -1);
  }

  async linkTelegram(userId: string, chatId: string) {
    await this.getPrefs(userId); // ensures a row exists
    const rows = await this.dataSource.query(
      `UPDATE user_notification_prefs SET telegram_chat_id = $2, updated_at = now()
         WHERE user_id = $1
         RETURNING ${NOTIFICATION_PREFS_COLUMNS_SQL}`,
      [userId, chatId],
    );
    return rows[0];
  }

  async unlinkTelegram(userId: string) {
    await this.getPrefs(userId);
    const rows = await this.dataSource.query(
      `UPDATE user_notification_prefs SET telegram_chat_id = NULL, updated_at = now()
         WHERE user_id = $1
         RETURNING ${NOTIFICATION_PREFS_COLUMNS_SQL}`,
      [userId],
    );
    return rows[0];
  }

  async getPrefs(userId: string) {
    const rows = await this.dataSource.query(
      `SELECT ${NOTIFICATION_PREFS_COLUMNS_SQL} FROM user_notification_prefs WHERE user_id = $1`,
      [userId],
    );
    if (rows[0]) return rows[0];

    // Lazily create default prefs row on first access
    const created = await this.dataSource.query(
      `INSERT INTO user_notification_prefs (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING ${NOTIFICATION_PREFS_COLUMNS_SQL}`,
      [userId],
    );
    if (created[0]) return created[0];

    // Conflict raced with a concurrent insert — fetch what won
    const finalRows = await this.dataSource.query(
      `SELECT ${NOTIFICATION_PREFS_COLUMNS_SQL} FROM user_notification_prefs WHERE user_id = $1`,
      [userId],
    );
    return finalRows[0];
  }

  async updatePrefs(userId: string, dto: UpdateNotifPrefsDto) {
    await this.getPrefs(userId); // ensures a row exists

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
    );
    if (!setClause) return this.getPrefs(userId);

    const rows = await this.dataSource.query(
      `UPDATE user_notification_prefs SET ${setClause}, updated_at = now()
         WHERE user_id = $1
         RETURNING ${NOTIFICATION_PREFS_COLUMNS_SQL}`,
      [userId, ...values],
    );
    return rows[0];
  }
}
