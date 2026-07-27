import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

/**
 * ONLINE/AWAY/BUSY/DO_NOT_DISTURB/IN_MEETING are all "connected" states a
 * client can be in. OFFLINE is derived (no Redis key, or connections <= 0) -
 * never set directly. INVISIBLE is stored like any other connected status,
 * but every read path that isn't "this is my own status" maps it to OFFLINE
 * (see maskForOthers) so it behaves as advertised: you look offline to
 * everyone else while still using the app normally yourself.
 */
export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  DO_NOT_DISTURB = 'dnd',
  IN_MEETING = 'in_meeting',
  INVISIBLE = 'invisible',
  OFFLINE = 'offline',
}

export interface PresenceInfo {
  status: PresenceStatus;
  lastSeenAt: string | null;
}

const TTL_SECONDS = 90; // survives a couple of missed 25-30s heartbeats before expiring
const key = (userId: string) => `presence:user:${userId}`;

@Injectable()
export class ChatPresenceService {
  constructor(private readonly redisService: RedisService) {}

  /** Masks a stored status for anyone other than its owner. */
  maskForOthers(status: PresenceStatus): PresenceStatus {
    return status === PresenceStatus.INVISIBLE ? PresenceStatus.OFFLINE : status;
  }

  /**
   * A new socket connected for this user. Increments the multi-device
   * connection counter and, only on the 0->1 transition, marks them online -
   * a second tab/device connecting doesn't reset an explicitly-chosen status
   * (e.g. busy/dnd) back to online.
   */
  async connect(userId: string): Promise<{ status: PresenceStatus; isNewlyOnline: boolean }> {
    const client = this.redisService.getClient();
    if (!client) return { status: PresenceStatus.ONLINE, isNewlyOnline: true };

    const connections = await client.hincrby(key(userId), 'connections', 1);
    const isNewlyOnline = connections === 1;
    const pipeline = client.pipeline();
    if (isNewlyOnline) {
      pipeline.hset(key(userId), 'status', PresenceStatus.ONLINE);
    }
    pipeline.expire(key(userId), TTL_SECONDS);
    await pipeline.exec();

    const status = isNewlyOnline
      ? PresenceStatus.ONLINE
      : ((await client.hget(key(userId), 'status')) as PresenceStatus) || PresenceStatus.ONLINE;
    return { status, isNewlyOnline };
  }

  /** A heartbeat or any activity — just keeps the TTL alive without touching status. */
  async refresh(userId: string): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    await client.expire(key(userId), TTL_SECONDS);
  }

  /**
   * A socket for this user disconnected. Decrements the counter; only once
   * every connection is gone do we actually go offline (multi-device: one
   * closed tab shouldn't flip presence while another tab is still open).
   */
  async disconnect(userId: string): Promise<{ isNowOffline: boolean }> {
    const client = this.redisService.getClient();
    if (!client) return { isNowOffline: true };

    const connections = await client.hincrby(key(userId), 'connections', -1);
    if (connections > 0) {
      await client.expire(key(userId), TTL_SECONDS);
      return { isNowOffline: false };
    }
    // Fully offline: drop the live key (short grace TTL covers flaky
    // reconnects) - users.last_seen in Postgres is the durable "last seen" record.
    const pipeline = client.pipeline();
    pipeline.hset(key(userId), 'connections', 0, 'status', PresenceStatus.OFFLINE);
    pipeline.expire(key(userId), 10);
    await pipeline.exec();
    return { isNowOffline: true };
  }

  /** Explicit status change (away/busy/dnd/in_meeting/invisible/online) from the client or a meeting join/leave hook. */
  async setStatus(userId: string, status: PresenceStatus): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    const pipeline = client.pipeline();
    pipeline.hset(key(userId), 'status', status);
    pipeline.expire(key(userId), TTL_SECONDS);
    await pipeline.exec();
  }

  async getPresence(userId: string): Promise<PresenceInfo> {
    const client = this.redisService.getClient();
    if (!client) return { status: PresenceStatus.OFFLINE, lastSeenAt: null };
    const raw = await client.hgetall(key(userId));
    const connections = Number(raw.connections || 0);
    if (!raw.status || connections <= 0) return { status: PresenceStatus.OFFLINE, lastSeenAt: null };
    return { status: raw.status as PresenceStatus, lastSeenAt: null };
  }

  /** Batched lookup for a room's member list / a DM header — one Redis round trip. */
  async getPresenceBulk(userIds: string[]): Promise<Record<string, PresenceStatus>> {
    const client = this.redisService.getClient();
    const result: Record<string, PresenceStatus> = {};
    if (!client || userIds.length === 0) return result;
    const pipeline = client.pipeline();
    userIds.forEach((id) => pipeline.hmget(key(id), 'status', 'connections'));
    const responses = await pipeline.exec();
    userIds.forEach((id, i) => {
      const [, values] = responses?.[i] ?? [null, null];
      const [status, connections] = (values as [string | null, string | null] | null) ?? [null, null];
      result[id] = !status || Number(connections || 0) <= 0
        ? PresenceStatus.OFFLINE
        : this.maskForOthers(status as PresenceStatus);
    });
    return result;
  }

  async setTyping(roomId: string, userId: string) {
    const client = this.redisService.getClient();
    if (!client) return;

    const typingKey = `typing:${roomId}`;
    const pipeline = client.pipeline();
    pipeline.sadd(typingKey, userId);
    pipeline.expire(typingKey, 5);
    await pipeline.exec();
  }

  async getTyping(roomId: string) {
    const client = this.redisService.getClient();
    if (!client) return [];
    return client.smembers(`typing:${roomId}`);
  }
}
