import { NotificationType } from '../../common/enums';
import { User } from './user.entity';

export interface Notification {
  id: string;

  userId: string;

  user: User;

  actorId: string;

  actor: User;

  type: NotificationType;

  title: string;

  message: string | null;

  entityType: string;

  entityId: string | null;

  metadata: any;

  isRead: boolean;

  readAt: Date | null;

  actionUrl: string | null;

  createdAt: Date;
}
