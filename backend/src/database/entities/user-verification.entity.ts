import { User } from './user.entity';

export interface UserVerification {
  id: string;

  userId: string;

  user: User;

  code: string;

  expiresAt: Date;

  createdAt: Date;
}
