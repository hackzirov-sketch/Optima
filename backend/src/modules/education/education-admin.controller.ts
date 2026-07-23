import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EducationSyncService } from './education-sync.service';

@ApiTags('Admin Education')
@ApiBearerAuth('access-token')
@Controller('admin/education')
export class EducationAdminController {
  constructor(private readonly sync: EducationSyncService) {}
  @Post('channels/resolve') resolve(@CurrentUser('id') userId: string, @Body('source') source: string) { return this.sync.resolveChannel(source, userId); }
  @Post('playlists') addPlaylist(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) { return this.sync.addPlaylist(body, userId); }
  @Post('playlists/:id/sync') syncPlaylist(@CurrentUser('id') userId: string, @Param('id') id: string) { return this.sync.syncPlaylist(id, userId); }
  @Patch('videos/:id/moderation') moderate(@CurrentUser('id') userId: string, @Param('id') id: string, @Body('status') status: string) { return this.sync.moderate(id, status, userId); }
}
