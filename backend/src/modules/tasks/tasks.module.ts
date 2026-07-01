import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../../redis/redis.module';
import { AnalyticsModule } from '../analytics/analytics.module';

import { Task } from '../../database/entities/task.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';
import { TaskWatcher } from '../../database/entities/task-watcher.entity';
import { TaskDependency } from '../../database/entities/task-dependency.entity';
import { TaskTag } from '../../database/entities/task-tag.entity';
import { Tag } from '../../database/entities/tag.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { TaskPush } from '../../database/entities/task-push.entity';
import { Project } from '../../database/entities/project.entity';
import { ProjectMember } from '../../database/entities/project-member.entity';
import { User } from '../../database/entities/user.entity';

import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskActivity,
      TaskWatcher,
      TaskDependency,
      TaskTag,
      Tag,
      ProjectColumn,
      WorkspaceMember,
      TaskPush,
      Project,
      ProjectMember,
      User,
    ]),
    GatewayModule,
    NotificationsModule,
    RedisModule,
    AnalyticsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
