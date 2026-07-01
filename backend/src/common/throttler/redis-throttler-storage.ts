import Redis from 'ioredis';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Minimal Redis-backed ThrottlerStorage for @nestjs/throttler v6+.
 *
 * Replaces `nestjs-throttler-storage-redis`, whose peer dependency only
 * supports NestJS v10 (this project is on v11) and is no longer maintained.
 * `ioredis` is already a direct dependency (see redis/redis.service.ts), so
 * this avoids pulling in an extra, incompatible package for ~20 lines of logic.
 *
 * Uses a Lua script so the increment + TTL-read + block-check happens
 * atomically in one round trip, same guarantee the throttler needs.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly client: Redis;

  private static readonly SCRIPT = `
    local hitsKey = KEYS[1]
    local blockKey = KEYS[2]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])

    local blockTtl = redis.call('PTTL', blockKey)
    if blockTtl > 0 then
      local hits = tonumber(redis.call('GET', hitsKey)) or limit
      return { hits, redis.call('PTTL', hitsKey), 1, blockTtl }
    end

    local totalHits = redis.call('INCR', hitsKey)
    if totalHits == 1 then
      redis.call('PEXPIRE', hitsKey, ttl)
    end
    local timeToExpire = redis.call('PTTL', hitsKey)

    if totalHits > limit and blockDuration > 0 then
      redis.call('SET', blockKey, 1, 'PX', blockDuration)
      return { totalHits, timeToExpire, 1, blockDuration }
    end

    return { totalHits, timeToExpire, 0, 0 }
  `;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:${throttlerName}:${key}:blocked`;

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] =
      (await this.client.eval(
        RedisThrottlerStorage.SCRIPT,
        2,
        hitsKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpire / 1000),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
    };
  }
}
