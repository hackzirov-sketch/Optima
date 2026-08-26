import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ErrorCode } from '../../../common/enums/error-code.enum';

interface IpRateLimitRow {
  id: string;
  ip: string;
  actionType: string;
  count: number;
  windowStart: Date;
  blockedUntil: Date | null;
}

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(request);
    // Use the matched ROUTE PATTERN (e.g. "/chat/join/:code"), not the raw
    // request path. Using request.path would key each guessed code/token
    // into its own bucket, so a brute-forcer never hits the limit — the
    // exact attack this guard exists to stop.
    const actionType =
      (request.route as { path?: string } | undefined)?.path ?? request.path;

    const maxAttempts =
      this.config.get<number>('moderation.ipMaxAttempts') ?? 40;
    const windowSeconds =
      this.config.get<number>('moderation.ipWindowSeconds') ?? 60;
    const windowMs = windowSeconds * 1000;
    // Every block this guard hands out is clamped to this, on the way in as
    // well as on the way out: rows written by an earlier, hour-long policy are
    // still sitting in ip_rate_limits, and without the clamp on read those
    // people stay locked out for the rest of the old block.
    const maxBlockSeconds =
      this.config.get<number>('moderation.ipMaxBlockSeconds') ?? 90;
    const maxBlockMs = maxBlockSeconds * 1000;

    const now = new Date();

    // Compute + persist the new counter state inside a transaction (row
    // locked FOR UPDATE to avoid a race between concurrent requests from the
    // same IP), then throw *after* the transaction has committed — the
    // counter update must survive even when the request is ultimately denied.
    const blockedRetryAfter = await this.dataSource.withTransaction(
      async (query) => {
        const rows: IpRateLimitRow[] = await query(
          `SELECT id, ip, action_type AS "actionType", count, window_start AS "windowStart",
                blocked_until AS "blockedUntil"
         FROM ip_rate_limits WHERE ip = $1 AND action_type = $2 FOR UPDATE`,
          [ip, actionType],
        );
        const record = rows[0];

        if (record) {
          // Currently blocked
          if (record.blockedUntil && record.blockedUntil > now) {
            const remainingMs = record.blockedUntil.getTime() - now.getTime();
            if (remainingMs <= maxBlockMs) return Math.ceil(remainingMs / 1000);
            // An over-long block from a previous policy: shorten it in place
            // rather than honouring it.
            const clamped = new Date(now.getTime() + maxBlockMs);
            await query(
              `UPDATE ip_rate_limits SET blocked_until = $2, updated_at = now() WHERE id = $1`,
              [record.id, clamped],
            );
            return maxBlockSeconds;
          }

          let newCount: number;
          let newWindowStart: Date;
          let newBlockedUntil: Date | null;

          // Window expired — reset
          if (record.windowStart.getTime() + windowMs < now.getTime()) {
            newCount = 1;
            newWindowStart = now;
            newBlockedUntil = null;
          } else {
            newCount = record.count + 1;
            newWindowStart = record.windowStart;
            newBlockedUntil = null;

            if (newCount >= maxAttempts) {
              newBlockedUntil = new Date(now.getTime() + maxBlockMs);
            }
          }

          await query(
            `UPDATE ip_rate_limits SET count = $2, window_start = $3, blocked_until = $4, updated_at = now()
           WHERE id = $1`,
            [record.id, newCount, newWindowStart, newBlockedUntil],
          );

          return newBlockedUntil ? maxBlockSeconds : null;
        }

        await query(
          `INSERT INTO ip_rate_limits (ip, action_type, count, window_start)
         VALUES ($1, $2, 1, $3)`,
          [ip, actionType, now],
        );
        return null;
      },
    );

    if (blockedRetryAfter !== null) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: `Too many attempts. Try again in ${blockedRetryAfter}s.`,
          retryAfter: blockedRetryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private extractIp(request: Request): string {
    // Only trust X-Forwarded-For when explicitly behind a reverse proxy (TRUST_PROXY=true).
    // Without this guard, any client can spoof their IP by sending a fake header.
    const trustProxy = process.env.TRUST_PROXY === 'true';
    if (trustProxy) {
      const cf = request.headers['cf-connecting-ip'];
      if (typeof cf === 'string' && cf.trim()) return cf.trim();

      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
    }
    return (request as any).socket?.remoteAddress ?? request.ip ?? '0.0.0.0';
  }
}
