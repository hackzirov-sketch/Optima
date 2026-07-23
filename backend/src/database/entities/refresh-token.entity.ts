import { User } from './user.entity';

export interface RefreshToken {
  id: string;

  userId: string;

  user: User;

  tokenHash: string;

  deviceName: string | null;

  deviceInfo: Record<string, any> | null;

  /** IP address logged at session creation */
  ipAddress: string | null;

  /** Country / city derived from IP (optional, populated async) */
  location: string | null;

  userAgent: string | null;

  provider: string | null;

  lastUsedAt: Date | null;

  expiresAt: Date;

  revokedAt: Date | null;

  createdAt: Date;
}
