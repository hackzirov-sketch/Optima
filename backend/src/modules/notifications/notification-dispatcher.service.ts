import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';

import { UserNotificationPrefs } from '../../database/entities/user-notification-prefs.entity';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationCategory,
} from '../../common/enums';
import { RedisKeys } from '../../redis/redis.keys';
import { RedisService } from '../../redis/redis.service';
import { TelegramChannelService } from './channels/telegram-channel.service';
import { SmsChannelService } from './channels/sms-channel.service';
import { MailService } from '../mail/mail.service';
import { NOTIFICATION_PREFS_COLUMNS_SQL } from './notifications.sql';

export interface DispatchPayload {
  userId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** in-app notification id (already created before dispatch) */
  notificationId?: string;
  /** Override channels — skips preference check (for OTP, security alerts) */
  forceChannels?: NotificationChannel[];
  metadata?: Record<string, unknown>;
}

/** Channels per priority (default routing, overridden by user prefs) */
const PRIORITY_CHANNELS: Record<NotificationPriority, NotificationChannel[]> = {
  [NotificationPriority.CRITICAL]: [
    NotificationChannel.SMS,
    NotificationChannel.TELEGRAM,
    NotificationChannel.EMAIL,
    NotificationChannel.IN_APP,
  ],
  [NotificationPriority.HIGH]: [
    NotificationChannel.TELEGRAM,
    NotificationChannel.EMAIL,
    NotificationChannel.IN_APP,
  ],
  [NotificationPriority.NORMAL]: [
    NotificationChannel.TELEGRAM,
    NotificationChannel.IN_APP,
  ],
  [NotificationPriority.LOW]: [
    NotificationChannel.IN_APP,
  ],
};

/** Channels that bypass quiet hours */
const QUIET_HOURS_BYPASS = new Set<NotificationChannel>([
  // All channels for critical notifications bypass quiet hours
]);
const QUIET_HOURS_BYPASS_CATEGORIES = new Set<NotificationCategory>([
  NotificationCategory.SECURITY,
]);

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly redis: RedisService,
    private readonly telegram: TelegramChannelService,
    private readonly sms: SmsChannelService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    this.frontendUrl = this.config.get('FRONTEND_URL') ?? 'https://upz.dev';
  }

  // ── Main entry point ────────────────────────────────────────────────────────

  async dispatch(payload: DispatchPayload): Promise<void> {
    const { userId, notificationId, forceChannels, priority, category } = payload;

    let channels: NotificationChannel[];

    if (forceChannels?.length) {
      channels = forceChannels;
    } else {
      const prefs = await this.getPrefs(userId);
      const baseChannels = PRIORITY_CHANNELS[priority];
      channels = this.filterByPrefs(baseChannels, prefs, category);

      // Smart SMS suppression: if Telegram was recently read, skip SMS
      if (notificationId && channels.includes(NotificationChannel.SMS)) {
        const tgRead = await this.wasTelegramRead(notificationId);
        if (tgRead) {
          this.logger.log(`Smart SMS suppressed for notif=${notificationId} (Telegram was read)`);
          channels = channels.filter(c => c !== NotificationChannel.SMS);
        }
      }

      // Quiet hours check (skip for security/critical)
      const isBypass = category === NotificationCategory.SECURITY
        || priority === NotificationPriority.CRITICAL
        || QUIET_HOURS_BYPASS_CATEGORIES.has(category);

      if (!isBypass) {
        const prefs2 = await this.getPrefs(userId);
        if (this.isInQuietHours(prefs2)) {
          // Only keep in_app during quiet hours (non-critical)
          channels = channels.filter(c => c === NotificationChannel.IN_APP);
          this.logger.log(`Quiet hours active for user=${userId}, suppressed external channels`);
        }
      }
    }

    // Fire all channels in parallel
    await Promise.allSettled(
      channels
        .filter(c => c !== NotificationChannel.IN_APP) // in_app handled by NotificationsService
        .map(channel => this.sendToChannel(channel, payload)),
    );
  }

  // ── Channel dispatchers ─────────────────────────────────────────────────────

  private async sendToChannel(channel: NotificationChannel, payload: DispatchPayload): Promise<void> {
    const { userId, title, message, notificationId } = payload;

    try {
      let result: { success: boolean; externalId?: string; error?: string };

      if (channel === NotificationChannel.TELEGRAM) {
        result = await this.sendTelegram(userId, title, message, notificationId);
      } else if (channel === NotificationChannel.SMS) {
        result = await this.sendSms(userId, message);
      } else if (channel === NotificationChannel.EMAIL) {
        result = await this.sendEmail(userId, title, message);
      } else {
        return;
      }

      await this.dataSource.query(
        `INSERT INTO notification_delivery_logs
           (notification_id, user_id, channel, is_success, error_message, external_id)
         VALUES ($1, $2, $3::notification_channel_enum, $4, $5, $6)`,
        [
          notificationId ?? null,
          userId,
          channel,
          result.success,
          result.error ?? null,
          result.externalId ?? null,
        ],
      );
    } catch (err) {
      this.logger.error(`Channel ${channel} dispatch error for user=${userId}: ${err}`);
    }
  }

  private async sendTelegram(
    userId: string,
    title: string,
    message: string,
    notificationId?: string,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const prefs = await this.getPrefs(userId);
    if (!prefs?.telegramChatId) {
      return { success: false, error: 'No Telegram chat_id' };
    }

    const text = `<b>${title}</b>\n\n${message}`;
    const result = await this.telegram.send(prefs.telegramChatId, text);

    // Store messageId in Redis for smart read tracking (TTL: 48h)
    if (result.success && result.messageId && notificationId) {
      const client = this.redis.getClient();
      if (client) {
        const key = `upz:tg_msgid:${notificationId}`;
        await client.set(key, `${prefs.telegramChatId}:${result.messageId}`, 'EX', 48 * 3600);
      }
    }

    return {
      success: result.success,
      externalId: result.messageId?.toString(),
      error: result.error,
    };
  }

  private async sendSms(
    userId: string,
    message: string,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const userRows: Array<{ id: string; phoneNumber: string | null }> = await this.dataSource.query(
      `SELECT id, phone_number AS "phoneNumber" FROM users WHERE id = $1`,
      [userId],
    );
    const user = userRows[0];

    if (!user?.phoneNumber) {
      return { success: false, error: 'No phone number' };
    }

    const prefs = await this.getPrefs(userId);
    if (!prefs?.phoneVerified) {
      return { success: false, error: 'Phone not verified' };
    }

    const result = await this.sms.send(user.phoneNumber.toString(), message);
    return { success: result.success, externalId: result.messageId, error: result.error };
  }

  private async sendEmail(
    userId: string,
    title: string,
    message: string,
  ): Promise<{ success: boolean; error?: string }> {
    const userRows: Array<{ id: string; email: string | null; firstName: string }> = await this.dataSource.query(
      `SELECT id, email, first_name AS "firstName" FROM users WHERE id = $1`,
      [userId],
    );
    const user = userRows[0];
    if (!user?.email) return { success: false, error: 'No email' };

    try {
      await this.mail.sendNotificationEmail(user.email, user.firstName, title, message);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Quiet Hours ─────────────────────────────────────────────────────────────

  private isInQuietHours(prefs: UserNotificationPrefs | null): boolean {
    if (!prefs?.quietStart || !prefs?.quietEnd) return false;

    const now = new Date();
    // Use UTC — user timezone conversion should happen when storing prefs
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    const [startH, startM] = prefs.quietStart.split(':').map(Number);
    const [endH, endM] = prefs.quietEnd.split(':').map(Number);
    const [curH, curM] = currentTime.split(':').map(Number);

    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    const curMins = curH * 60 + curM;

    // Handle overnight: e.g. 22:00 → 07:00
    if (startMins > endMins) {
      return curMins >= startMins || curMins <= endMins;
    }
    return curMins >= startMins && curMins <= endMins;
  }

  // ── Smart Telegram Read Tracking ────────────────────────────────────────────

  private async wasTelegramRead(notificationId: string): Promise<boolean> {
    try {
      const client = this.redis.getClient();
      if (!client) return false;
      const v = await client.get(RedisKeys.telegramRead(notificationId));
      return v === '1';
    } catch {
      return false;
    }
  }

  /** Called by Telegram webhook when user sends any message (marks all unread as read) */
  async markTelegramRead(notificationId: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (!client) return;
      await client.set(RedisKeys.telegramRead(notificationId), '1', 'EX', 48 * 3600);
    } catch (err) {
      this.logger.warn(`markTelegramRead failed: ${err}`);
    }
  }

  // ── Prefs helpers ───────────────────────────────────────────────────────────

  private async getPrefs(userId: string): Promise<UserNotificationPrefs | null> {
    // Try Redis cache first
    try {
      const client = this.redis.getClient();
      if (client) {
        const cached = await client.get(RedisKeys.notifPrefs(userId));
        if (cached) return JSON.parse(cached);
      }
    } catch {}

    const rows: UserNotificationPrefs[] = await this.dataSource.query(
      `SELECT ${NOTIFICATION_PREFS_COLUMNS_SQL} FROM user_notification_prefs WHERE user_id = $1`,
      [userId],
    );
    const prefs = rows[0] ?? null;

    // Cache for 5 min
    try {
      const client = this.redis.getClient();
      if (client && prefs) {
        await client.set(RedisKeys.notifPrefs(userId), JSON.stringify(prefs), 'EX', 300);
      }
    } catch {}

    return prefs;
  }

  private filterByPrefs(
    baseChannels: NotificationChannel[],
    prefs: UserNotificationPrefs | null,
    category: NotificationCategory,
  ): NotificationChannel[] {
    if (!prefs) return baseChannels;

    return baseChannels.filter(channel => {
      if (channel === NotificationChannel.IN_APP) {
        return this.getCategoryPref(prefs, category, 'in_app');
      }
      if (channel === NotificationChannel.TELEGRAM) {
        // Fallback: if no telegram linked, will skip in sendTelegram
        return this.getCategoryPref(prefs, category, 'telegram');
      }
      if (channel === NotificationChannel.EMAIL) {
        return this.getCategoryPref(prefs, category, 'email');
      }
      if (channel === NotificationChannel.SMS) {
        return this.getCategoryPref(prefs, category, 'sms');
      }
      return true;
    });
  }

  private getCategoryPref(
    prefs: UserNotificationPrefs,
    category: NotificationCategory,
    channel: 'sms' | 'telegram' | 'email' | 'in_app',
  ): boolean {
    const map: Record<NotificationCategory, Record<string, boolean>> = {
      [NotificationCategory.MEETING]: {
        sms:      prefs.meetingSms,
        telegram: prefs.meetingTelegram,
        email:    prefs.meetingEmail,
        in_app:   prefs.meetingInApp,
      },
      [NotificationCategory.TASK]: {
        sms:      prefs.taskSms,
        telegram: prefs.taskTelegram,
        email:    prefs.taskEmail,
        in_app:   prefs.taskInApp,
      },
      [NotificationCategory.HOMEWORK]: {
        sms:      prefs.homeworkSms,
        telegram: prefs.homeworkTelegram,
        email:    prefs.homeworkEmail,
        in_app:   prefs.homeworkInApp,
      },
      [NotificationCategory.PAYMENT]: {
        sms:      prefs.paymentSms,
        telegram: prefs.paymentTelegram,
        email:    prefs.paymentEmail,
        in_app:   prefs.paymentInApp,
      },
      [NotificationCategory.SECURITY]: {
        sms:      prefs.securitySms,
        telegram: prefs.securityTelegram,
        email:    prefs.securityEmail,
        in_app:   prefs.securityInApp,
      },
      [NotificationCategory.COURSE]: {
        sms:      false,
        telegram: prefs.courseTelegram,
        email:    false,
        in_app:   prefs.courseInApp,
      },
      [NotificationCategory.MARKETING]: {
        sms:      false,
        telegram: prefs.marketingTelegram,
        email:    prefs.marketingEmail,
        in_app:   prefs.marketingInApp,
      },
      [NotificationCategory.CERTIFICATE]: {
        sms:      false,
        telegram: prefs.certificateTelegram,
        email:    prefs.certificateEmail,
        in_app:   prefs.certificateInApp,
      },
      [NotificationCategory.SYSTEM]: {
        sms: false, telegram: true, email: true, in_app: true,
      },
    };
    return map[category]?.[channel] ?? true;
  }

  /** Invalidate prefs cache when user updates settings */
  async invalidatePrefsCache(userId: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (client) await client.del(RedisKeys.notifPrefs(userId));
    } catch {}
  }
}
