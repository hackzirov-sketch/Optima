import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RedisService } from '../../../redis/redis.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

export const AUTH_RATE_LIMIT_KEY = 'authRateLimit';

export interface AuthRateLimitOptions {
  action: string;
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<AuthRateLimitOptions>(
      AUTH_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(request);
    const { action, maxAttempts, windowSeconds, blockSeconds } = options;

    // OPTIMIZED: Pipeline checkBlock + incrementFailures in one Redis round trip
    const [blockTtl, count] = await this.redisService.checkAndIncrementRateLimit(
      action,
      ip,
      windowSeconds,
    );

    if (blockTtl !== null) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: `Too many attempts. Try again in ${Math.ceil(blockTtl / 60)} minute(s).`,
          retryAfter: blockTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (count > maxAttempts) {
      await this.redisService.blockRateLimit(action, ip, blockSeconds);
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: `Too many attempts. Try again in ${Math.ceil(blockSeconds / 60)} minute(s).`,
          retryAfter: blockSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    (request as any).clearRateLimit = async () => {
      await this.redisService.clearRateLimit(action, ip);
    };

    return true;
  }

  private extractIp(request: Request): string {
    const trustProxy = process.env.TRUST_PROXY === 'true';
    if (trustProxy) {
      const cf = request.headers['cf-connecting-ip'];
      if (typeof cf === 'string' && cf.trim()) return cf.trim();

      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
    }
    // Express request.ip correctly handles the trusted proxy if app.set('trust proxy', 1) is used
    return request.ip ?? (request as any).socket?.remoteAddress ?? '0.0.0.0';
  }
}
