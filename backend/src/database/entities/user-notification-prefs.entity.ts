import { User } from './user.entity';

/**
 * Per-user notification channel preferences.
 * Each category has booleans for sms, telegram, email, in_app.
 * quiet_hours_start/end are in HH:MM format (user's local timezone).
 */
export interface UserNotificationPrefs {
  id: string;

  userId: string;

  user: User;

  // ── Telegram ────────────────────────────────────────────────────────────────
  /** Telegram chat_id after user links bot */
  telegramChatId: string | null;

  /** Whether user has verified phone (required for SMS) */
  phoneVerified: boolean;

  // ── Per-category channel toggles ────────────────────────────────────────────
  // meeting
  meetingSms: boolean;
  meetingTelegram: boolean;
  meetingEmail: boolean;
  meetingInApp: boolean;

  // task
  taskSms: boolean;
  taskTelegram: boolean;
  taskEmail: boolean;
  taskInApp: boolean;

  // homework
  homeworkSms: boolean;
  homeworkTelegram: boolean;
  homeworkEmail: boolean;
  homeworkInApp: boolean;

  // payment
  paymentSms: boolean;
  paymentTelegram: boolean;
  paymentEmail: boolean;
  paymentInApp: boolean;

  // security
  securitySms: boolean;
  securityTelegram: boolean;
  securityEmail: boolean;
  securityInApp: boolean;

  // course / certificates / marketing
  courseTelegram: boolean;
  courseInApp: boolean;
  marketingTelegram: boolean;
  marketingEmail: boolean;
  marketingInApp: boolean;
  certificateTelegram: boolean;
  certificateEmail: boolean;
  certificateInApp: boolean;

  // ── Quiet Hours (Do Not Disturb) ─────────────────────────────────────────────
  /** e.g. "22:00" */
  quietStart: string | null;

  /** e.g. "07:00" */
  quietEnd: string | null;

  updatedAt: Date;
}
