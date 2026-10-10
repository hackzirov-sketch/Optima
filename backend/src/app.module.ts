import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler-storage';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';

import configs, { LoggerConfigModule } from './config';
import { validate } from './config/env';

import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module'; // Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GithubModule } from './modules/github/github.module';
import { StorageModule } from './modules/storage/storage.module';
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
import { YoutubeModule } from './modules/youtube/youtube.module';
import { EducationModule } from './modules/education/education.module'; // Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';

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

    // ── Database (plain `pg` pool — see DatabaseModule) ───────────────────
    DatabaseModule,

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
          // Burst guard — catches request floods within a single second.
          { name: 'short', ttl: 1000, limit: 20 },
          // Standard window — the project-wide 90s rate-limit baseline.
          { name: 'standard', ttl: 90000, limit: 450 },
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
    YoutubeModule,
    EducationModule,
    LoggerConfigModule,
  ],
  providers: [
    // Runs before JwtAuthGuard: a forged cross-site request should be turned
    // away on the shape of the request, without the cookie it carries ever
    // being honoured.
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      // After JwtAuthGuard, so the limit is counted per user — see the guard.
      useClass: UserThrottlerGuard,
    },
  ],
})
export class AppModule {}
