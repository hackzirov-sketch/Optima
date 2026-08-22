import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('groups/:groupId/analytics/overview')
  @ApiOperation({ summary: 'Group analytics overview' })
  @ApiParam({ name: 'groupId' })
  groupOverview(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.analyticsService.groupOverview(groupId, userId);
  }

  @Get('projects/:projectId/analytics')
  @ApiOperation({ summary: 'Project-level aggregates' })
  @ApiParam({ name: 'projectId' })
  projectAnalytics(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.analyticsService.projectAnalytics(projectId, userId);
  }

  @Get('projects/:projectId/analytics/developers')
  @ApiOperation({ summary: 'Per-developer stats in a project' })
  @ApiParam({ name: 'projectId' })
  projectDevelopers(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.analyticsService.projectDevelopers(projectId, userId);
  }

  @Get('users/me/analytics')
  @ApiOperation({ summary: 'Current user analytics snapshot' })
  myAnalytics(@CurrentUser('id') userId: string) {
    return this.analyticsService.myAnalytics(userId);
  }
}
