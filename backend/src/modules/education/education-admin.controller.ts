import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EducationSyncService } from './education-sync.service';
import {
  AddPlaylistDto,
  ModerateVideoDto,
  ResolveChannelDto,
} from './dto/education.dto';

@ApiTags('Admin Education')
@ApiBearerAuth('access-token')
@Controller('admin/education')
export class EducationAdminController {
  constructor(private readonly sync: EducationSyncService) {}
  @Post('channels/resolve') resolve(
    @CurrentUser('id') userId: string,
    @Body() dto: ResolveChannelDto,
  ) {
    return this.sync.resolveChannel(dto.source, userId);
  }
  @Post('playlists') addPlaylist(
    @CurrentUser('id') userId: string,
    @Body() dto: AddPlaylistDto,
  ) {
    return this.sync.addPlaylist(dto, userId);
  }
  @Post('playlists/:id/sync') syncPlaylist(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.sync.syncPlaylist(id, userId);
  }
  @Patch('videos/:id/moderation') moderate(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ModerateVideoDto,
  ) {
    return this.sync.moderate(id, dto.status, userId);
  }
}
