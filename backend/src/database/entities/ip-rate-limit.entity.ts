export interface IpRateLimit {
  id: string;

  ip: string;

  actionType: string;

  count: number;

  windowStart: Date;

  blockedUntil: Date | null;

  updatedAt: Date;
}
