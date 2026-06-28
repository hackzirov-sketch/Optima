import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { NotificationChannel } from '../../common/enums';

@Index(['notificationId'])
@Index(['userId', 'createdAt'])
@Entity('notification_delivery_logs')
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id', type: 'uuid', nullable: true })
  notificationId: string | null;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Column({ name: 'is_success', default: false })
  isSuccess: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /** external message id (telegram message_id, sms sid, etc.) */
  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  /** For smart reminder: did Telegram message get read? */
  @Column({ name: 'is_read_on_channel', default: false })
  isReadOnChannel: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
