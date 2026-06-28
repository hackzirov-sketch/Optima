import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class ChatPresenceService {
  constructor(private readonly redisService: RedisService) {}

  async setOnline(userId: string, socketId: string) {
    const client = this.redisService.getClient();
    if (!client) return;

    const key = `presence:${userId}`;
    await client.hset(key, {
      status: 'online',
      lastSeen: new Date().toISOString(),
      socketId,
    });
    await client.expire(key, 60);
  }

  async setOffline(userId: string) {
    const client = this.redisService.getClient();
    if (!client) return;

    const key = `presence:${userId}`;
    await client.hset(key, 'status', 'offline');
    // keep for some time
    await client.expire(key, 300);
  }

  async getPresence(userId: string) {
    const client = this.redisService.getClient();
    if (!client) return null;
    return client.hgetall(`presence:${userId}`);
  }

  async setTyping(roomId: string, userId: string) {
    const client = this.redisService.getClient();
    if (!client) return;

    const key = `typing:${roomId}`;
    await client.sadd(key, userId);
    await client.expire(key, 5);
  }

  async getTyping(roomId: string) {
    const client = this.redisService.getClient();
    if (!client) return [];
    return client.smembers(`typing:${roomId}`);
  }
}
