import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Per-user notification channel preferences.
 * Each category has booleans for sms, telegram, email, in_app.
 * quiet_hours_start/end are in HH:MM format (user's local timezone).
 */
@Entity('user_notification_prefs')
export class UserNotificationPrefs {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ── Telegram ────────────────────────────────────────────────────────────────
  /** Telegram chat_id after user links bot */
  @Column({ name: 'telegram_chat_id', type: 'bigint', nullable: true })
  telegramChatId: string | null;

  /** Whether user has verified phone (required for SMS) */
  @Column({ name: 'phone_verified', default: false })
  phoneVerified: boolean;

  // ── Per-category channel toggles ────────────────────────────────────────────
  // meeting
  @Column({ name: 'meeting_sms',      default: true })  meetingSms: boolean;
  @Column({ name: 'meeting_telegram', default: true })  meetingTelegram: boolean;
  @Column({ name: 'meeting_email',    default: true })  meetingEmail: boolean;
  @Column({ name: 'meeting_in_app',   default: true })  meetingInApp: boolean;

  // task
  @Column({ name: 'task_sms',         default: false }) taskSms: boolean;
  @Column({ name: 'task_telegram',    default: true })  taskTelegram: boolean;
  @Column({ name: 'task_email',       default: false }) taskEmail: boolean;
  @Column({ name: 'task_in_app',      default: true })  taskInApp: boolean;

  // homework
  @Column({ name: 'homework_sms',      default: false }) homeworkSms: boolean;
  @Column({ name: 'homework_telegram', default: true })  homeworkTelegram: boolean;
  @Column({ name: 'homework_email',    default: false }) homeworkEmail: boolean;
  @Column({ name: 'homework_in_app',   default: true })  homeworkInApp: boolean;

  // payment
  @Column({ name: 'payment_sms',       default: true })  paymentSms: boolean;
  @Column({ name: 'payment_telegram',  default: true })  paymentTelegram: boolean;
  @Column({ name: 'payment_email',     default: true })  paymentEmail: boolean;
  @Column({ name: 'payment_in_app',    default: true })  paymentInApp: boolean;

  // security
  @Column({ name: 'security_sms',      default: true })  securitySms: boolean;
  @Column({ name: 'security_telegram', default: true })  securityTelegram: boolean;
  @Column({ name: 'security_email',    default: true })  securityEmail: boolean;
  @Column({ name: 'security_in_app',   default: true })  securityInApp: boolean;

  // course / certificates / marketing
  @Column({ name: 'course_telegram',    default: true })  courseTelegram: boolean;
  @Column({ name: 'course_in_app',      default: true })  courseInApp: boolean;
  @Column({ name: 'marketing_telegram', default: false }) marketingTelegram: boolean;
  @Column({ name: 'marketing_email',    default: false }) marketingEmail: boolean;
  @Column({ name: 'marketing_in_app',   default: true })  marketingInApp: boolean;
  @Column({ name: 'certificate_telegram', default: true }) certificateTelegram: boolean;
  @Column({ name: 'certificate_email',    default: true }) certificateEmail: boolean;
  @Column({ name: 'certificate_in_app',   default: true }) certificateInApp: boolean;

  // ── Quiet Hours (Do Not Disturb) ─────────────────────────────────────────────
  /** e.g. "22:00" */
  @Column({ name: 'quiet_start', type: 'varchar', length: 5, nullable: true })
  quietStart: string | null;

  /** e.g. "07:00" */
  @Column({ name: 'quiet_end', type: 'varchar', length: 5, nullable: true })
  quietEnd: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
