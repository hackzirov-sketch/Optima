import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private disabled = false;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Redis | null {
    if (this.disabled) return null;

    if (!this.client) {
      const url =
        this.config.get<string>('redis.url') || 'redis://localhost:6379';

      this.client = new Redis(url, {
        // Credentials are read directly from REDIS_URL.
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        retryStrategy: () => null,
      });
      this.client.on('error', (err) => {
        const message = err?.message || 'unknown redis error';
        if (message.includes('WRONGPASS')) {
          this.logger.error(
            'Redis auth failed (WRONGPASS). Disabling Redis-backed features until restart.',
          );
          this.disabled = true;
          this.client?.disconnect();
          this.client = null;
          return;
        }
        this.logger.warn(`Redis connection: ${message}`);
      });
    }
    return this.client;
  }

  async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) return false;
      const v = await client.get(`upz:blacklist:${jti}`);
      return v !== null;
    } catch {
      return false;
    }
  }

  async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;
    try {
      const client = this.getClient();
      if (!client) return;
      await client.set(`upz:blacklist:${jti}`, '1', 'EX', ttlSeconds);
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
      const client = this.getClient();
      if (!client) return;
      await client.set(
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
      const client = this.getClient();
      if (!client) return null;
      const key = `upz:oauth:${code}`;
      const raw = await client.get(key);
      if (!raw) return null;
      await client.del(key); // one-time use
      return JSON.parse(raw) as { accessToken: string; refreshToken: string };
    } catch (e) {
      this.logger.warn(
        `Redis OAuth code get failed: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  async setPasswordResetToken(token: string, userId: string): Promise<void> {
    try {
      const client = this.getClient();
      if (!client) return;
      await client.set(`upz:pwd_reset:${token}`, userId, 'EX', 900); // 15 min
    } catch (e) {
      this.logger.warn(`Redis pwd-reset set failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async getAndDeletePasswordResetToken(token: string): Promise<string | null> {
    try {
      const client = this.getClient();
      if (!client) return null;
      const key = `upz:pwd_reset:${token}`;
      const userId = await client.get(key);
      if (!userId) return null;
      await client.del(key);
      return userId;
    } catch (e) {
      this.logger.warn(`Redis pwd-reset get failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
    this.client = null;
  }
}
