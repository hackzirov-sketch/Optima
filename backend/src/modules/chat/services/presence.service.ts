import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class ChatPresenceService {
  constructor(private readonly redisService: RedisService) {}

  async setOnline(userId: string, socketId: string) {
    const client = this.redisService.getClient();
    if (!client) return;

    const key = `presence:${userId}`;
    // Pipeline: 2 ta sequential call o'rniga bitta round trip
    const pipeline = client.pipeline();
    pipeline.hset(key, {
      status: 'online',
      lastSeen: new Date().toISOString(),
      socketId,
    });
    pipeline.expire(key, 60);
    await pipeline.exec();
  }

  async setOffline(userId: string) {
    const client = this.redisService.getClient();
    if (!client) return;

    const key = `presence:${userId}`;
    const pipeline = client.pipeline();
    pipeline.hset(key, 'status', 'offline');
    pipeline.expire(key, 300);
    await pipeline.exec();
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
    // Pipeline: sadd + expire bitta round trip
    const pipeline = client.pipeline();
    pipeline.sadd(key, userId);
    pipeline.expire(key, 5);
    await pipeline.exec();
  }

  async getTyping(roomId: string) {
    const client = this.redisService.getClient();
    if (!client) return [];
    return client.smembers(`typing:${roomId}`);
  }
}