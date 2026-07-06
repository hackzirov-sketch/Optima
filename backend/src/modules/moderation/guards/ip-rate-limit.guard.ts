import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(request);
    // Use the matched ROUTE PATTERN (e.g. "/chat/join/:code"), not the raw
    // request path. Using request.path would key each guessed code/token
    // into its own bucket, so a brute-forcer never hits the limit — the
    // exact attack this guard exists to stop.
    const actionType = (request.route as { path?: string } | undefined)?.path ?? request.path;

    const maxAttempts = this.config.get<number>('moderation.ipMaxAttempts') ?? 3;
    const windowHours = this.config.get<number>('moderation.ipWindowHours') ?? 24;
    const windowMs = windowHours * 60 * 60 * 1000;

    const now = new Date();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rows: IpRateLimitRow[] = await queryRunner.query(
        `SELECT id, ip, action_type AS "actionType", count, window_start AS "windowStart",
                blocked_until AS "blockedUntil"
         FROM ip_rate_limits WHERE ip = $1 AND action_type = $2 FOR UPDATE`,
        [ip, actionType],
      );
      const record = rows[0];

      if (record) {
        // Currently blocked
        if (record.blockedUntil && record.blockedUntil > now) {
          const retryAfter = Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000);
          throw new HttpException(
            {
              code: ErrorCode.RATE_LIMIT_EXCEEDED,
              message: `Too many attempts. Try again in ${Math.ceil(retryAfter / 3600)} hour(s).`,
              retryAfter,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
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
            newBlockedUntil = new Date(now.getTime() + windowMs);
            await queryRunner.query(
              `UPDATE ip_rate_limits SET count = $2, window_start = $3, blocked_until = $4, updated_at = now()
               WHERE id = $1`,
              [record.id, newCount, newWindowStart, newBlockedUntil],
            );
            await queryRunner.commitTransaction();

            throw new HttpException(
              {
                code: ErrorCode.RATE_LIMIT_EXCEEDED,
                message: `Too many attempts. Try again in ${windowHours} hour(s).`,
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
        }

        await queryRunner.query(
          `UPDATE ip_rate_limits SET count = $2, window_start = $3, blocked_until = $4, updated_at = now()
           WHERE id = $1`,
          [record.id, newCount, newWindowStart, newBlockedUntil],
        );
      } else {
        await queryRunner.query(
          `INSERT INTO ip_rate_limits (ip, action_type, count, window_start) VALUES ($1, $2, 1, $3)`,
          [ip, actionType, now],
        );
      }

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
