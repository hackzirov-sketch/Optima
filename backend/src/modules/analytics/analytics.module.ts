import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Project } from '../../database/entities/project.entity';
import { Task } from '../../database/entities/task.entity';
import { DeveloperProjectStats } from '../../database/entities/developer-project-stats.entity';
import { DeveloperDailyStats } from '../../database/entities/developer-daily-stats.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';

import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { DailyStatsService } from './daily-stats.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceMember,
      Project,
      Task,
      DeveloperProjectStats,
      DeveloperDailyStats,
    ]),
    WorkspacesModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DailyStatsService],
  exports: [AnalyticsService, DailyStatsService],
})
export class AnalyticsModule {}
