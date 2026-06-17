// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';
import githubConfig from './config/github.config';
import r2Config from './config/r2.config';
import googleConfig from './config/google.config';
import cloudinaryConfig from './config/cloudinary.config';
import moderationConfig from './config/moderation.config';

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

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  controllers: [AppController],
  imports: [
    // ── Config (global) ────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        githubConfig,
        r2Config,
        googleConfig,
        cloudinaryConfig,
        moderationConfig,
      ],
      envFilePath: '.env',
    }),

    // ── Database ───────────────────────────────────
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
        ssl:
          config.get('NODE_ENV') === 'production'
            ? {
                rejectUnauthorized: true,
                ...(config.get('DB_SSL_CA') && { ca: config.get('DB_SSL_CA') }),
              }
            : false,
        extra: {
          max: parseInt(config.get('DATABASE_POOL_SIZE') || '20', 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
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
        },
      }),
      inject: [ConfigService],
    }),

    // ── Rate Limiting ─────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 }, // 20 req/sec
      { name: 'medium', ttl: 10000, limit: 100 }, // 100 req/10sec
      { name: 'long', ttl: 60000, limit: 300 }, // 300 req/min
    ]),

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
