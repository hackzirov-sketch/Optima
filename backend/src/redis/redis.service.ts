import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Redis {
    if (!this.client) {
      const url =
        this.config.get<string>('redis.url') || 'redis://localhost:6379';
      const password = this.config.get<string>('redis.password');
      this.client = new Redis(url, {
        password: password || undefined,
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
      this.client.on('error', (err) =>
        this.logger.warn(`Redis connection: ${err.message}`),
      );
    }
    return this.client;
  }

  async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      const v = await this.getClient().get(`upz:blacklist:${jti}`);
      return v !== null;
    } catch {
      return false;
    }
  }

  async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;
    try {
      await this.getClient().set(`upz:blacklist:${jti}`, '1', 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(
        `Redis blacklist set failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async setOAuthCode(
    code: string,
    tokens: { accessToken: string; refreshToken: string },
  ): Promise<void> {
    try {
      await this.getClient().set(
        `upz:oauth:${code}`,
        JSON.stringify(tokens),
        'EX',
        60, // 60-second TTL — one-time use
      );
    } catch (e) {
      this.logger.warn(
        `Redis OAuth code set failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async getAndDeleteOAuthCode(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    try {
      const key = `upz:oauth:${code}`;
      const raw = await this.getClient().get(key);
      if (!raw) return null;
      await this.getClient().del(key); // one-time use
      return JSON.parse(raw) as { accessToken: string; refreshToken: string };
    } catch (e) {
      this.logger.warn(
        `Redis OAuth code get failed: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
    this.client = null;
  }
}
