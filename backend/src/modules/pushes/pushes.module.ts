import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { TaskPush } from '../../database/entities/task-push.entity';
import { PushReviewComment } from '../../database/entities/push-review-comment.entity';
import { Task } from '../../database/entities/task.entity';
import { Repository as LinkedRepository } from '../../database/entities/repository.entity';
import { WorkspaceGithubInstallation } from '../../database/entities/workspace-github-installation.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';

import { StorageModule } from '../storage/storage.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PushesService } from './pushes.service';
import { PushesController } from './pushes.controller';
import { ArtifactCleanupProcessor, ARTIFACT_CLEANUP_QUEUE } from './processors/artifact-cleanup.processor';

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
    AnalyticsModule,
    BullModule.registerQueue({ name: ARTIFACT_CLEANUP_QUEUE }),
  ],
  controllers: [PushesController],
  providers: [PushesService, ArtifactCleanupProcessor],
  exports: [PushesService],
})
export class PushesModule {}
