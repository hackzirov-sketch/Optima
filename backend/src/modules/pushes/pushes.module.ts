import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TaskPush } from '../../database/entities/task-push.entity';
import { PushReviewComment } from '../../database/entities/push-review-comment.entity';
import { Task } from '../../database/entities/task.entity';
import { Repository as LinkedRepository } from '../../database/entities/repository.entity';
import { WorkspaceGithubInstallation } from '../../database/entities/workspace-github-installation.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';

import { StorageModule } from '../storage/storage.module';
import { PushesService } from './pushes.service';
import { PushesController } from './pushes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskPush,
      PushReviewComment,
      Task,
      LinkedRepository,
      WorkspaceGithubInstallation,
      WorkspaceMember,
      TaskActivity,
    ]),
    StorageModule,
  ],
  controllers: [PushesController],
  providers: [PushesService],
  exports: [PushesService],
})
export class PushesModule {}
