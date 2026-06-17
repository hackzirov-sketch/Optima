import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private disabled = false;
  // In-memory fallback for OAuth codes and password reset tokens when Redis is down
  private readonly memStore = new Map<string, MemEntry>();

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
      if (!client) {
        // Fail open in dev; fail closed in production
        if (process.env.NODE_ENV === 'production') {
          this.logger.error('Redis unavailable — JWT blacklist check FAILED CLOSED. Token rejected.');
          return true;
        }
        return false;
      }
      const v = await client.get(`upz:blacklist:${jti}`);
      return v !== null;
    } catch (e) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`JWT blacklist check failed: ${e instanceof Error ? e.message : e}. Token rejected for safety.`);
        return true;
      }
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

  /** Block all tokens for a user (e.g. on account deletion). TTL should cover the max access-token lifetime. */
  async blockUserSessions(userId: string, ttlSeconds: number): Promise<void> {
    try {
      const client = this.getClient();
      if (!client) return;
      await client.set(`upz:user_blocked:${userId}`, '1', 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(
        `Redis user-block set failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async isUserSessionBlocked(userId: string): Promise<boolean> {
    try {
      const client = this.getClient();
      if (!client) return process.env.NODE_ENV === 'production';
      const v = await client.get(`upz:user_blocked:${userId}`);
      return v !== null;
    } catch (e) {
      this.logger.warn(`Redis user-block check failed: ${e instanceof Error ? e.message : e}`);
      return process.env.NODE_ENV === 'production';
    }
  }

  private memSet(key: string, value: string, ttlSeconds: number): void {
    this.memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private memGetAndDelete(key: string): string | null {
    const entry = this.memStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memStore.delete(key);
      return null;
    }
    this.memStore.delete(key);
    return entry.value;
  }

  async setOAuthCode(
    code: string,
    tokens: { accessToken: string; refreshToken: string },
  ): Promise<void> {
    const key = `upz:oauth:${code}`;
    const serialized = JSON.stringify(tokens);
    try {
      const client = this.getClient();
      if (client) {
        await client.set(key, serialized, 'EX', 60);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis OAuth code set failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(key, serialized, 60);
  }

  async getAndDeleteOAuthCode(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const key = `upz:oauth:${code}`;
    try {
      const client = this.getClient();
      if (client) {
        const raw = await client.get(key);
        if (raw) {
          await client.del(key);
          return JSON.parse(raw) as { accessToken: string; refreshToken: string };
        }
      }
    } catch (e) {
      this.logger.warn(`Redis OAuth code get failed: ${e instanceof Error ? e.message : e}`);
    }
    const raw = this.memGetAndDelete(key);
    return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string }) : null;
  }

  async setPasswordResetToken(token: string, userId: string): Promise<void> {
    const key = `upz:pwd_reset:${token}`;
    try {
      const client = this.getClient();
      if (client) {
        await client.set(key, userId, 'EX', 900);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis pwd-reset set failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(key, userId, 900);
  }

  async getAndDeletePasswordResetToken(token: string): Promise<string | null> {
    const key = `upz:pwd_reset:${token}`;
    try {
      const client = this.getClient();
      if (client) {
        const userId = await client.get(key);
        if (userId) {
          await client.del(key);
          return userId;
        }
      }
    } catch (e) {
      this.logger.warn(`Redis pwd-reset get failed: ${e instanceof Error ? e.message : e}`);
    }
    return this.memGetAndDelete(key);
  }

  onModuleDestroy() {
    this.client?.disconnect();
    this.client = null;
    this.memStore.clear();
  }
}
