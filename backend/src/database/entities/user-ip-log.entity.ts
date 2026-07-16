import { User } from './user.entity';

export interface UserIpLog {
  id: string;

  userId: string;

  user: User;

  ipAddress: string;

  provider: string | null;

  userAgent: string | null;

  createdAt: Date;
}
