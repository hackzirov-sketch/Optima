import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsGateway } from './events.gateway';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ChatModule } from '../chat/chat.module';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
      }),
      inject: [ConfigService],
    }),
    ChatModule,
    TypeOrmModule.forFeature([WorkspaceMember]),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class GatewayModule implements OnModuleInit {
  private readonly logger = new Logger(GatewayModule.name);

  constructor(
    private readonly gateway: EventsGateway,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const url =
      this.config.get<string>('redis.url') || 'redis://localhost:6379';
    const password = this.config.get<string>('redis.password');

    try {
      const pubClient = new Redis(url, {
        password: password || undefined,
        maxRetriesPerRequest: 2,
        lazyConnect: false,
      });
      const subClient = pubClient.duplicate();

      // Wait for both connections before attaching the adapter
      await Promise.all([
        new Promise<void>((res, rej) => {
          pubClient.once('ready', res);
          pubClient.once('error', rej);
        }),
        new Promise<void>((res, rej) => {
          subClient.once('ready', res);
          subClient.once('error', rej);
        }),
      ]);

      // Attach Redis adapter so Socket.IO events are broadcast across
      // all Node processes / PM2 cluster / Docker replicas
      this.gateway.server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Socket.IO Redis adapter attached ✅');
    } catch (err) {
      // Redis is optional — gateway still works in single-instance mode
      this.logger.warn(
        `Socket.IO Redis adapter skipped (Redis unavailable): ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}