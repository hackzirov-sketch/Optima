import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler-storage';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';

import configs from './config';
import { validate } from './config/env';

import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GithubModule } from './modules/github/github.module';
import { StorageModule } from './modules/storage/storage.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { GroupsModule } from './modules/groups/groups.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PushesModule } from './modules/pushes/pushes.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { EarningsModule } from './modules/earnings/earnings.module';
import { NotesModule } from './modules/notes/notes.module';
import { LibraryModule } from './modules/library/library.module';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  controllers: [AppController],
  imports: [
    // ── Config (global) ────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: configs,
      envFilePath: '.env',
      validate,
    }),

    // ── Database ───────────────────────────────────
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        // Only log slow queries in dev, not every query (logging: true kills performance)
        logging: false,
        // SSL always on — Neon requires it regardless of NODE_ENV
        // ssl: { rejectUnauthorized: false },
        extra: {
          max: parseInt(config.get('DATABASE_POOL_SIZE') || '20', 10),
          // Keep connections alive — eliminates Neon cold-connect overhead on warm pool
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
          idleTimeoutMillis: 60000,      // was 30000 — give Neon more time before disconnect
          connectionTimeoutMillis: 5000, // was 10000 — fail fast instead of hanging
        },
      }),
      inject: [ConfigService],
    }),

    // ── Redis Queue ────────────────────────────────
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get('REDIS_URL'),
          password: config.get('REDIS_PASSWORD') || undefined,
          // Pipeline mode — batches commands, cuts RTT per command in half
          enableAutoPipelining: true,
        },
      }),
      inject: [ConfigService],
    }),

    // ── Rate Limiting ─────────────────────────────
    // NOTE: Auth endpoints use AuthRateLimitGuard (custom, smarter).
    // Global ThrottlerGuard is kept for non-auth API protection only.
    // Auth routes skip this via @SkipThrottle() in AuthController.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 20 },
          { name: 'medium', ttl: 10000, limit: 100 },
          { name: 'long', ttl: 60000, limit: 300 },
        ],
        storage: new RedisThrottlerStorage(config.get('REDIS_URL') as string),
      }),
    }),

    // ── Event Emitter (internal) ───────────────────
    EventEmitterModule.forRoot({ wildcard: true }),

    RedisModule,
    CommonModule,

    // ── Feature Modules ────────────────────────────
    AuthModule,
    UsersModule,
    GithubModule,
    StorageModule,
    WorkspacesModule,
    GroupsModule,
    ProjectsModule,
    TasksModule,
    PushesModule,
    ChatModule,
    NotificationsModule,
    AnalyticsModule,
    GatewayModule,
    MeetingsModule,
    ModerationModule,
    EarningsModule,
    NotesModule,
    LibraryModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
