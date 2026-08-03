export interface UserViolation {
  id: string;

  userId: string;

  type: string; // 'text' | 'image' | 'spam'

  count: number;

  blockedUntil: Date | null;

  isPermanent: boolean;

  reason: string | null;

  createdAt: Date;

  updatedAt: Date;
}
