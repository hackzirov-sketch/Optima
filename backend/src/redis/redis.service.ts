import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { RedisKeys } from './redis.keys';
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

  public getClient(): Redis | null {
    if (this.disabled) return null;

    if (!this.client) {
      const url =
        this.config.get<string>('redis.url') || 'redis://localhost:6379';

      this.client = new Redis(url, {
        // Credentials are read directly from REDIS_URL.
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        retryStrategy: () => null,
        // Auto-pipeline: batches concurrent commands into single RTT automatically
        enableAutoPipelining: true,
        connectTimeout: 5000,
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
      const v = await client.get(RedisKeys.blacklistToken(jti));
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
      await client.set(RedisKeys.blacklistToken(jti), '1', 'EX', ttlSeconds);
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
      await client.set(RedisKeys.userBlock(userId), '1', 'EX', ttlSeconds);
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
      const v = await client.get(RedisKeys.userBlock(userId));
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
    const key = RedisKeys.oauthCode(code);
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
    const key = RedisKeys.oauthCode(code);
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
    const key = RedisKeys.pwdReset(token);
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

  // ─── Password Reset OTP ──────────────────────────────────────────────────────
  // Flow: forgotPassword → setPasswordResetOtp (saves resetToken + otp + userId)
  //       → verifyResetOtp checks OTP, if correct: issues short-lived confirmedToken
  //       → resetPassword uses confirmedToken (one-time, 10 min TTL)

  /**
   * Stores a 6-digit OTP bound to a resetToken for 15 minutes.
   * The resetToken is what the backend tracks internally; the frontend
   * passes it back when verifying the OTP.
   */
  async setPasswordResetOtp(
    resetToken: string,
    userId: string,
    otp: string,
  ): Promise<void> {
    const key = RedisKeys.pwdResetOtp(resetToken);
    const payload = JSON.stringify({ userId, otp, attempts: 0 });
    try {
      const client = this.getClient();
      if (client) {
        await client.set(key, payload, 'EX', 900); // 15 min
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis setPasswordResetOtp failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(key, payload, 900);
  }

  /**
   * Verifies the OTP. On success: deletes the OTP record and creates a
   * short-lived confirmedToken that authorises the actual password change.
   * Returns { ok: true, confirmedToken } or { ok: false, reason, attemptsLeft? }
   */
  async verifyPasswordResetOtp(
    resetToken: string,
    otp: string,
  ): Promise<
    | { ok: true; confirmedToken: string }
    | { ok: false; reason: 'invalid_token' | 'wrong_otp' | 'max_attempts'; attemptsLeft?: number }
  > {
    const key = RedisKeys.pwdResetOtp(resetToken);
    let raw: string | null = null;
    try {
      const client = this.getClient();
      if (client) raw = await client.get(key);
    } catch (e) {
      this.logger.warn(`Redis verifyPasswordResetOtp get failed: ${e instanceof Error ? e.message : e}`);
    }
    if (!raw) {
      const mem = this.memStore.get(key);
      if (mem && Date.now() < mem.expiresAt) raw = mem.value;
    }
    if (!raw) return { ok: false, reason: 'invalid_token' };

    const record = JSON.parse(raw) as { userId: string; otp: string; attempts: number };
    const MAX_ATTEMPTS = 5;

    if (record.otp !== otp) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        // Burn the OTP record — force a fresh forgotPassword
        try {
          const client = this.getClient();
          if (client) await client.del(key);
        } catch { /* ignore */ }
        this.memStore.delete(key);
        return { ok: false, reason: 'max_attempts' };
      }
      // Persist incremented attempt count
      const updated = JSON.stringify(record);
      try {
        const client = this.getClient();
        if (client) {
          const ttl = await client.ttl(key);
          await client.set(key, updated, 'EX', ttl > 0 ? ttl : 900);
        } else {
          const mem = this.memStore.get(key);
          this.memSet(key, updated, mem ? Math.ceil((mem.expiresAt - Date.now()) / 1000) : 900);
        }
      } catch (e) {
        this.logger.warn(`Redis verifyPasswordResetOtp update failed: ${e instanceof Error ? e.message : e}`);
      }
      return { ok: false, reason: 'wrong_otp', attemptsLeft: MAX_ATTEMPTS - record.attempts };
    }

    // OTP correct — delete OTP record and issue confirmedToken (10 min, one-time-use)
    try {
      const client = this.getClient();
      if (client) await client.del(key);
    } catch { /* ignore */ }
    this.memStore.delete(key);

    const confirmedToken = require('crypto').randomUUID() as string;
    const confirmKey = RedisKeys.pwdResetConfirmed(confirmedToken);
    try {
      const client = this.getClient();
      if (client) {
        await client.set(confirmKey, record.userId, 'EX', 600); // 10 min
      } else {
        this.memSet(confirmKey, record.userId, 600);
      }
    } catch (e) {
      this.logger.warn(`Redis verifyPasswordResetOtp confirm set failed: ${e instanceof Error ? e.message : e}`);
      this.memSet(confirmKey, record.userId, 600);
    }
    return { ok: true, confirmedToken };
  }

  /** One-time consume confirmedToken → returns userId (used by resetPassword). */
  async getAndDeleteConfirmedResetToken(confirmedToken: string): Promise<string | null> {
    const key = RedisKeys.pwdResetConfirmed(confirmedToken);
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
      this.logger.warn(`Redis getAndDeleteConfirmedResetToken failed: ${e instanceof Error ? e.message : e}`);
    }
    return this.memGetAndDelete(key);
  }

  async getAndDeletePasswordResetToken(token: string): Promise<string | null> {
    const key = RedisKeys.pwdReset(token);
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

  async incrementRateLimitFailures(action: string, ip: string, windowSeconds: number): Promise<number> {
    const key = RedisKeys.rateLimitFailures(action, ip);
    try {
      const client = this.getClient();
      if (client) {
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, windowSeconds);
        }
        return count;
      }
    } catch (e) {
      this.logger.warn(`Redis incrementRateLimitFailures failed: ${e instanceof Error ? e.message : e}`);
    }
    // Fallback to mem store logic if redis fails
    const currentStr = this.memStore.get(key)?.value || '0';
    const count = parseInt(currentStr, 10) + 1;
    this.memSet(key, count.toString(), windowSeconds);
    return count;
  }

  async blockRateLimit(action: string, ip: string, blockSeconds: number): Promise<void> {
    const blockKey = RedisKeys.rateLimitBlocked(action, ip);
    try {
      const client = this.getClient();
      if (client) {
        await client.set(blockKey, '1', 'EX', blockSeconds);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis blockRateLimit failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(blockKey, '1', blockSeconds);
  }

  async checkRateLimitBlock(action: string, ip: string): Promise<number | null> {
    const blockKey = RedisKeys.rateLimitBlocked(action, ip);
    try {
      const client = this.getClient();
      if (client) {
        const ttl = await client.ttl(blockKey);
        if (ttl > 0) return ttl;
      }
    } catch (e) {
      this.logger.warn(`Redis checkRateLimitBlock failed: ${e instanceof Error ? e.message : e}`);
    }
    const memEntry = this.memStore.get(blockKey);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return Math.ceil((memEntry.expiresAt - Date.now()) / 1000);
    }
    return null;
  }


  /**
   * OPTIMIZED: Pipeline checkBlock + increment in ONE round trip (was 2 sequential calls)
   * Returns [blockTtl | null, incrementedCount]
   */
  async checkAndIncrementRateLimit(
    action: string,
    ip: string,
    windowSeconds: number,
  ): Promise<[number | null, number]> {
    const blockKey = RedisKeys.rateLimitBlocked(action, ip);
    const failKey = RedisKeys.rateLimitFailures(action, ip);
    try {
      const client = this.getClient();
      if (client) {
        // Pipeline: TTL(block) + INCR(fails) + EXPIRE(fails) — 3 commands, 1 RTT
        const pipeline = client.pipeline();
        pipeline.ttl(blockKey);
        pipeline.incr(failKey);
        pipeline.expire(failKey, windowSeconds);
        const results = await pipeline.exec();
        if (results) {
          const ttl = results[0][1] as number;
          const count = results[1][1] as number;
          if (ttl > 0) return [ttl, count];
          return [null, count];
        }
      }
    } catch (e) {
      this.logger.warn(`Redis checkAndIncrement failed: ${e instanceof Error ? e.message : e}`);
    }
    // Fallback: mem store
    const blockEntry = this.memStore.get(blockKey);
    if (blockEntry && blockEntry.expiresAt > Date.now()) {
      return [Math.ceil((blockEntry.expiresAt - Date.now()) / 1000), 0];
    }
    const currentStr = this.memStore.get(failKey)?.value || '0';
    const count = parseInt(currentStr, 10) + 1;
    this.memSet(failKey, count.toString(), windowSeconds);
    return [null, count];
  }

  async clearRateLimit(action: string, ip: string): Promise<void> {
    const failuresKey = RedisKeys.rateLimitFailures(action, ip);
    const blockKey = RedisKeys.rateLimitBlocked(action, ip);
    try {
      const client = this.getClient();
      if (client) {
        await client.del(failuresKey, blockKey);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis clearRateLimit failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memStore.delete(failuresKey);
    this.memStore.delete(blockKey);
  }

  // --- User Cache ---

  /**
   * OPTIMIZED: JWT validation — 3 Redis calls → 1 pipeline round trip
   * Returns [isBlacklisted, isSessionBlocked, cachedUser]
   */
  async validateTokenPipeline(
    userId: string,
    jti?: string,
  ): Promise<[boolean, boolean, any | null]> {
    try {
      const client = this.getClient();
      if (client) {
        const pipeline = client.pipeline();
        if (jti) {
          pipeline.get(RedisKeys.blacklistToken(jti));
        } else {
          pipeline.get('__noop__'); // placeholder
        }
        pipeline.get(RedisKeys.userBlock(userId));
        pipeline.get(RedisKeys.cachedUser(userId));
        const results = await pipeline.exec();
        if (results) {
          const isBlacklisted = jti ? results[0][1] !== null : false;
          const isSessionBlocked = results[1][1] !== null;
          const cachedRaw = results[2][1] as string | null;
          const cachedUser = cachedRaw ? JSON.parse(cachedRaw) : null;
          return [isBlacklisted, isSessionBlocked, cachedUser];
        }
      }
    } catch (e) {
      this.logger.warn(`Redis validateTokenPipeline failed: ${e instanceof Error ? e.message : e}`);
      // Fail safe: in production reject, in dev allow
      if (process.env.NODE_ENV === 'production') return [true, false, null];
    }
    return [false, false, null];
  }

  async cacheUser(userId: string, user: any, ttlSeconds: number = 10): Promise<void> {
    const key = RedisKeys.cachedUser(userId);
    try {
      const client = this.getClient();
      if (client) {
        await client.set(key, JSON.stringify(user), 'EX', ttlSeconds);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis cacheUser failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async getCachedUser(userId: string): Promise<any | null> {
    const key = RedisKeys.cachedUser(userId);
    try {
      const client = this.getClient();
      if (client) {
        const raw = await client.get(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (e) {
      this.logger.warn(`Redis getCachedUser failed: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  }

  async clearCachedUser(userId: string): Promise<void> {
    const key = RedisKeys.cachedUser(userId);
    try {
      const client = this.getClient();
      if (client) {
        await client.del(key);
      }
    } catch (e) {
      this.logger.warn(`Redis clearCachedUser failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- Account Lockout ---
  async getAccountLockout(userId: string): Promise<number | null> {
    const key = RedisKeys.accountLockout(userId);
    try {
      const client = this.getClient();
      if (client) {
        const ttl = await client.ttl(key);
        if (ttl > 0) return ttl;
      }
    } catch (e) {
      this.logger.warn(`Redis getAccountLockout failed: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  }

  async incrementAccountLockoutFailures(userId: string, maxAttempts: number, lockoutSeconds: number): Promise<void> {
    const keyFails = RedisKeys.accountLockoutFailures(userId);
    const keyLock = RedisKeys.accountLockout(userId);
    try {
      const client = this.getClient();
      if (client) {
        const count = await client.incr(keyFails);
        if (count === 1) {
          await client.expire(keyFails, 3600); // Fails window is 1 hour
        }
        if (count >= maxAttempts) {
          await client.set(keyLock, '1', 'EX', lockoutSeconds);
        }
      }
    } catch (e) {
      this.logger.warn(`Redis incrementAccountLockoutFailures failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async clearAccountLockout(userId: string): Promise<void> {
    const keyFails = RedisKeys.accountLockoutFailures(userId);
    const keyLock = RedisKeys.accountLockout(userId);
    try {
      const client = this.getClient();
      if (client) {
        await client.del(keyFails, keyLock);
      }
    } catch (e) {
      this.logger.warn(`Redis clearAccountLockout failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- Email verification (Redis-native, replaces the old Postgres user_verifications table) ---

  private readonly EMAIL_VERIFY_TTL_SECONDS = 15 * 60; // 15 minutes
  private readonly EMAIL_VERIFY_MAX_ATTEMPTS = 5;
  private readonly EMAIL_VERIFY_ATTEMPT_COOLDOWN_THRESHOLD = 2; // after this many wrong tries, force a cooldown
  private readonly EMAIL_VERIFY_ATTEMPT_COOLDOWN_SECONDS = 90;
  private readonly EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS = 60;
  private readonly EMAIL_VERIFY_RESEND_DAILY_CAP = 5;

  /**
   * Stores a pending email verification, keyed by `token` (long, unguessable,
   * unique per attempt — generated fresh on every register/resend). `code` is
   * the short human-enterable OTP sent by email; it is only ever compared
   * *within* the record identified by `token`, never looked up globally, so
   * two different users can be issued the same 6-digit code at the same time
   * with zero collision risk.
   */
  async setEmailVerification(
    token: string,
    data: { userId: string; email: string; code: string },
  ): Promise<void> {
    const key = RedisKeys.emailVerify(token);
    const payload = JSON.stringify({ ...data, attempts: 0 });
    try {
      const client = this.getClient();
      if (client) {
        await client.set(key, payload, 'EX', this.EMAIL_VERIFY_TTL_SECONDS);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis setEmailVerification failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(key, payload, this.EMAIL_VERIFY_TTL_SECONDS);
  }

  async getEmailVerification(
    token: string,
  ): Promise<{ userId: string; email: string; code: string; attempts: number } | null> {
    const key = RedisKeys.emailVerify(token);
    try {
      const client = this.getClient();
      if (client) {
        const raw = await client.get(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (e) {
      this.logger.warn(`Redis getEmailVerification failed: ${e instanceof Error ? e.message : e}`);
    }
    const entry = this.memStore.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return JSON.parse(entry.value);
  }

  /** Increments the wrong-code attempt counter; deletes the record once it hits the max (forces a fresh resend). */
  async incrementEmailVerifyAttempts(token: string): Promise<number> {
    const key = RedisKeys.emailVerify(token);
    const record = await this.getEmailVerification(token);
    if (!record) return this.EMAIL_VERIFY_MAX_ATTEMPTS;

    const attempts = record.attempts + 1;
    if (attempts >= this.EMAIL_VERIFY_MAX_ATTEMPTS) {
      await this.deleteEmailVerification(token);
      return attempts;
    }

    // Anti-bruteforce: after N wrong guesses, force a cooldown before the
    // next try is even allowed — makes scripted guessing of the 6-digit
    // code (1M possible values) far too slow to be worth attempting,
    // independent of the hard 5-attempt cap above.
    if (attempts >= this.EMAIL_VERIFY_ATTEMPT_COOLDOWN_THRESHOLD) {
      await this.setEmailVerifyAttemptCooldown(token);
    }

    const updated = JSON.stringify({ ...record, attempts });
    try {
      const client = this.getClient();
      if (client) {
        const ttl = await client.ttl(key);
        await client.set(key, updated, 'EX', ttl > 0 ? ttl : this.EMAIL_VERIFY_TTL_SECONDS);
        return attempts;
      }
    } catch (e) {
      this.logger.warn(`Redis incrementEmailVerifyAttempts failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(key, updated, this.EMAIL_VERIFY_TTL_SECONDS);
    return attempts;
  }

  private async setEmailVerifyAttemptCooldown(token: string): Promise<void> {
    const key = `upz:email_verify:cooldown:${token}`;
    try {
      const client = this.getClient();
      if (client) {
        await client.set(key, '1', 'EX', this.EMAIL_VERIFY_ATTEMPT_COOLDOWN_SECONDS);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis setEmailVerifyAttemptCooldown failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memSet(key, '1', this.EMAIL_VERIFY_ATTEMPT_COOLDOWN_SECONDS);
  }

  /** Returns remaining cooldown seconds, or 0 if no cooldown is active. */
  async getEmailVerifyAttemptCooldown(token: string): Promise<number> {
    const key = `upz:email_verify:cooldown:${token}`;
    try {
      const client = this.getClient();
      if (client) {
        const ttl = await client.ttl(key);
        return ttl > 0 ? ttl : 0;
      }
    } catch (e) {
      this.logger.warn(`Redis getEmailVerifyAttemptCooldown failed: ${e instanceof Error ? e.message : e}`);
    }
    const entry = this.memStore.get(key);
    if (!entry || Date.now() > entry.expiresAt) return 0;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  async deleteEmailVerification(token: string): Promise<void> {
    const key = RedisKeys.emailVerify(token);
    try {
      const client = this.getClient();
      if (client) {
        await client.del(key);
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis deleteEmailVerification failed: ${e instanceof Error ? e.message : e}`);
    }
    this.memStore.delete(key);
  }

  /**
   * Rate limit for resending verification emails: a short cooldown between
   * individual requests, plus a hard daily cap so a single account can't be
   * used to spam an inbox (or run up email-provider costs) all day long.
   * Returns null if allowed, or the reason + retryAfter (seconds) if blocked.
   */
  async checkEmailVerifyResendLimit(
    userId: string,
  ): Promise<{ blocked: true; reason: 'cooldown' | 'daily_cap'; retryAfter: number } | null> {
    const cooldownKey = RedisKeys.emailVerifyResendCooldown(userId);
    const countKey = RedisKeys.emailVerifyResendCount(userId);
    try {
      const client = this.getClient();
      if (client) {
        const [cooldownTtl, count] = await Promise.all([client.ttl(cooldownKey), client.get(countKey)]);
        if (cooldownTtl > 0) return { blocked: true, reason: 'cooldown', retryAfter: cooldownTtl };
        if (count && parseInt(count, 10) >= this.EMAIL_VERIFY_RESEND_DAILY_CAP) {
          const dailyTtl = await client.ttl(countKey);
          return { blocked: true, reason: 'daily_cap', retryAfter: dailyTtl > 0 ? dailyTtl : 86400 };
        }
        return null;
      }
    } catch (e) {
      this.logger.warn(`Redis checkEmailVerifyResendLimit failed: ${e instanceof Error ? e.message : e}`);
    }
    return null; // fail-open for resend limiting — worst case is an extra email, not a security issue
  }

  /** Call after actually sending a resend — starts the cooldown and increments the daily counter. */
  async markEmailVerifyResendSent(userId: string): Promise<void> {
    const cooldownKey = RedisKeys.emailVerifyResendCooldown(userId);
    const countKey = RedisKeys.emailVerifyResendCount(userId);
    try {
      const client = this.getClient();
      if (client) {
        const pipeline = client.pipeline();
        pipeline.set(cooldownKey, '1', 'EX', this.EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS);
        pipeline.incr(countKey);
        pipeline.expire(countKey, 86400, 'NX');
        await pipeline.exec();
        return;
      }
    } catch (e) {
      this.logger.warn(`Redis markEmailVerifyResendSent failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
    this.client = null;
    this.memStore.clear();
  }
}
