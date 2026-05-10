// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';
import githubConfig from './config/github.config';
import r2Config from './config/r2.config';
import googleConfig from './config/google.config';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GithubModule } from './modules/github/github.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { GroupsModule } from './modules/groups/groups.module';
import { ProjectsModule } from './modules/projects/projects.module';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    // ── Config (global) ────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig, githubConfig, r2Config, googleConfig],
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
        ssl: config.get('NODE_ENV') === 'production'
          ? { rejectUnauthorized: false }
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
        },
      }),
      inject: [ConfigService],
    }),

    // ── Rate Limiting ─────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1000,  limit: 10000 },  // 10K req/sec
      { name: 'medium', ttl: 10000, limit: 50000 },  // 50K req/10sec
      { name: 'long',   ttl: 60000, limit: 200000 }, // 200K req/min
    ]),

    // ── Event Emitter (internal) ───────────────────
    EventEmitterModule.forRoot({ wildcard: true }),

    // ── Feature Modules ────────────────────────────
    AuthModule,
    UsersModule,
    GithubModule,
    WorkspacesModule,
    GroupsModule,
    ProjectsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    /* {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }, */
  ],
})
export class AppModule {}
