import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Task } from '../../database/entities/task.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';
import { TaskWatcher } from '../../database/entities/task-watcher.entity';
import { TaskDependency } from '../../database/entities/task-dependency.entity';
import { TaskTag } from '../../database/entities/task-tag.entity';
import { Tag } from '../../database/entities/tag.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

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
    ]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
