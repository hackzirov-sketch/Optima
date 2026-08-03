import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

/**
 * ONLINE/AWAY/BUSY/DO_NOT_DISTURB/IN_MEETING are all "connected" states a
 * client can be in. OFFLINE is derived (no fresh socket entries left) -
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
const socketsKey = (userId: string) => `presence:user:${userId}:sockets`;

@Injectable()
export class ChatPresenceService {
  constructor(private readonly redisService: RedisService) {}

  /** Masks a stored status for anyone other than its owner. */
  maskForOthers(status: PresenceStatus): PresenceStatus {
    return status === PresenceStatus.INVISIBLE
      ? PresenceStatus.OFFLINE
      : status;
  }

  /**
   * Counts still-fresh sockets for a user and evicts stale entries in the
   * same pass. This is what makes presence self-healing: a plain increment
   * counter would drift forever if a process ever dies without running its
   * disconnect handler (a backend restart/crash, a killed container) - here,
   * an orphaned socket entry simply stops being refreshed by heartbeats and
   * ages out on its own, instead of leaving the user permanently "online".
   */
  private async countFreshSockets(userId: string): Promise<number> {
    const client = this.redisService.getClient();
    if (!client) return 0;
    const all = await client.hgetall(socketsKey(userId));
    const now = Date.now();
    const stale: string[] = [];
    let fresh = 0;
    for (const [socketId, ts] of Object.entries(all)) {
      if (now - Number(ts) > TTL_SECONDS * 1000) stale.push(socketId);
      else fresh++;
    }
    if (stale.length) await client.hdel(socketsKey(userId), ...stale);
    return fresh;
  }

  /** A new socket connected for this user. Records it and, only on the 0->1+ transition, marks them online. */
  async connect(
    userId: string,
    socketId: string,
  ): Promise<{ status: PresenceStatus; isNewlyOnline: boolean }> {
    const client = this.redisService.getClient();
    if (!client) return { status: PresenceStatus.ONLINE, isNewlyOnline: true };

    const wasOnline = (await this.countFreshSockets(userId)) > 0;
    const pipeline = client.pipeline();
    pipeline.hset(socketsKey(userId), socketId, Date.now());
    pipeline.expire(socketsKey(userId), TTL_SECONDS);
    if (!wasOnline) pipeline.hset(key(userId), 'status', PresenceStatus.ONLINE);
    pipeline.expire(key(userId), TTL_SECONDS);
    await pipeline.exec();

    const status = wasOnline
      ? ((await client.hget(key(userId), 'status')) as PresenceStatus) ||
        PresenceStatus.ONLINE
      : PresenceStatus.ONLINE;
    return { status, isNewlyOnline: !wasOnline };
  }

  /** A heartbeat (or any activity) for one specific socket — refreshes just that socket's freshness timestamp. */
  async refresh(userId: string, socketId: string): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    const pipeline = client.pipeline();
    pipeline.hset(socketsKey(userId), socketId, Date.now());
    pipeline.expire(socketsKey(userId), TTL_SECONDS);
    pipeline.expire(key(userId), TTL_SECONDS);
    await pipeline.exec();
  }

  /** A socket for this user disconnected. Only once every fresh socket is gone do we actually go offline. */
  async disconnect(
    userId: string,
    socketId: string,
  ): Promise<{ isNowOffline: boolean }> {
    const client = this.redisService.getClient();
    if (!client) return { isNowOffline: true };

    await client.hdel(socketsKey(userId), socketId);
    const remaining = await this.countFreshSockets(userId);
    if (remaining > 0) return { isNowOffline: false };

    const pipeline = client.pipeline();
    pipeline.hset(key(userId), 'status', PresenceStatus.OFFLINE);
    pipeline.expire(key(userId), 10);
    pipeline.del(socketsKey(userId));
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
    const fresh = await this.countFreshSockets(userId);
    if (fresh === 0)
      return { status: PresenceStatus.OFFLINE, lastSeenAt: null };
    const status = (await client.hget(key(userId), 'status')) as PresenceStatus;
    return { status: status || PresenceStatus.ONLINE, lastSeenAt: null };
  }

  /** Batched lookup for a room's member list / a DM header — one Redis round trip for the status hashes. */
  async getPresenceBulk(
    userIds: string[],
  ): Promise<Record<string, PresenceStatus>> {
    const client = this.redisService.getClient();
    const result: Record<string, PresenceStatus> = {};
    if (!client || userIds.length === 0) return result;
    // countFreshSockets self-heals (evicts stale entries) so it can't be
    // folded into the pipeline below — run it per user first.
    const freshCounts = await Promise.all(
      userIds.map((id) => this.countFreshSockets(id)),
    );
    const pipeline = client.pipeline();
    userIds.forEach((id) => pipeline.hget(key(id), 'status'));
    const responses = await pipeline.exec();
    userIds.forEach((id, i) => {
      const status = (responses?.[i]?.[1] as string | null) ?? null;
      result[id] =
        freshCounts[i] === 0 || !status
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
