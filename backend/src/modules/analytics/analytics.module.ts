import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';

import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { DailyStatsService } from './daily-stats.service';

@Module({
  imports: [GroupsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DailyStatsService],
  exports: [AnalyticsService, DailyStatsService],
})
export class AnalyticsModule {}
