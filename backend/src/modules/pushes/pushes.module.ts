import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { StorageModule } from '../storage/storage.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PushesService } from './pushes.service';
import { PushesController } from './pushes.controller';
import { ArtifactCleanupProcessor, ARTIFACT_CLEANUP_QUEUE } from './processors/artifact-cleanup.processor';

@Module({
  imports: [
    StorageModule,
    AnalyticsModule,
    BullModule.registerQueue({ name: ARTIFACT_CLEANUP_QUEUE }),
  ],
  controllers: [PushesController],
  providers: [PushesService, ArtifactCleanupProcessor],
  exports: [PushesService],
})
export class PushesModule {}
