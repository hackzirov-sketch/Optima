import { User } from './user.entity';

export interface UserSettings {
  id: string;

  userId: string;

  user: User;

  notificationsEnabled: boolean;

  emailNotifications: boolean;

  pushNotifications: boolean;

  notifyTaskAssigned: boolean;

  notifyPushReviewed: boolean;

  notifyPrEvents: boolean;

  notifyMentions: boolean;

  createdAt: Date;

  updatedAt: Date;
}
