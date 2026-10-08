import { Module, forwardRef } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../../redis/redis.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { GroupsModule } from '../groups/groups.module';

import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    GatewayModule,
    NotificationsModule,
    RedisModule,
    AnalyticsModule,
    // For MembersService.assertMember — the shared, invalidated membership cache.
    forwardRef(() => GroupsModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
