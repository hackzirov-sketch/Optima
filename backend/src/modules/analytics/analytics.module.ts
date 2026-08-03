import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';

import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { DailyStatsService } from './daily-stats.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DailyStatsService],
  exports: [AnalyticsService, DailyStatsService],
})
export class AnalyticsModule {}
