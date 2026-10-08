import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { EducationModule } from './modules/education/education.module'; // Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { MailModule } from './modules/mail/mail.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configs,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get('REDIS_URL'),
          password: config.get('REDIS_PASSWORD') || undefined,
          enableAutoPipelining: true,
        },
      }),
      inject: [ConfigService],
    }),
      DatabaseModule,
      RedisModule,
      CommonModule,
      AuthModule,
      UsersModule,
      GithubModule,
      // StorageModule,
      // GroupsModule,
      ProjectsModule,
      // TasksModule,
      // PushesModule,
      // ChatModule,
      // NotificationsModule,
      // MailModule,
    // AnalyticsModule,
      // GatewayModule,
      // MeetingsModule,
      ModerationModule,
      // EarningsModule,
      // NotesModule,
      LibraryModule,
      // EducationModule
  // JwtAuthGuard,
  //     CsrfGuard,
      MailModule

  ],
})
export class AppModule {}