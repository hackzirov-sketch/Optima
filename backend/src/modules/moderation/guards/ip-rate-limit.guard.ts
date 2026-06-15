import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IpRateLimit } from '../../../database/entities/ip-rate-limit.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    @InjectRepository(IpRateLimit)
    private readonly repo: Repository<IpRateLimit>,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(request);
    const actionType = request.path;

    const maxAttempts = this.config.get<number>('moderation.ipMaxAttempts') ?? 3;
    const windowHours = this.config.get<number>('moderation.ipWindowHours') ?? 24;
    const windowMs = windowHours * 60 * 60 * 1000;

    const now = new Date();

    let record = await this.repo.findOne({ where: { ip, actionType } });

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

      // Window expired — reset
      if (record.windowStart.getTime() + windowMs < now.getTime()) {
        record.count = 1;
        record.windowStart = now;
        record.blockedUntil = null;
      } else {
        record.count += 1;

        if (record.count >= maxAttempts) {
          record.blockedUntil = new Date(now.getTime() + windowMs);
          await this.repo.save(record);

          throw new HttpException(
            {
              code: ErrorCode.RATE_LIMIT_EXCEEDED,
              message: `Too many attempts. Try again in ${windowHours} hour(s).`,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      await this.repo.save(record);
    } else {
      await this.repo.save(
        this.repo.create({ ip, actionType, count: 1, windowStart: now }),
      );
    }

    return true;
  }

  private extractIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip ?? '0.0.0.0';
  }
}
