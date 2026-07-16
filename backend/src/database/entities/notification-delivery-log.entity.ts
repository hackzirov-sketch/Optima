import { NotificationChannel } from '../../common/enums';

export interface NotificationDeliveryLog {
  id: string;

  notificationId: string | null;

  userId: string;

  channel: NotificationChannel;

  isSuccess: boolean;

  errorMessage: string | null;

  /** external message id (telegram message_id, sms sid, etc.) */
  externalId: string | null;

  /** For smart reminder: did Telegram message get read? */
  isReadOnChannel: boolean;

  createdAt: Date;
}
