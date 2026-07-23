import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EducationService } from './education.service';

@ApiTags('Education')
@ApiBearerAuth('access-token')
@Controller('education')
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get('home') home(@CurrentUser('id') userId: string) { return this.education.home(userId); }
  @Get('dashboard') dashboard(@CurrentUser('id') userId: string) { return this.education.dashboard(userId); }
  @Get('subjects') subjects() { return this.education.subjects(); }
  @Get('channels') channels(@Query('subject') subject?: string) { return this.education.channels(subject); }
  @Get('channels/:id') channel(@Param('id') id: string) { return this.education.channel(id); }
  @Get('playlists') playlists(@Query('subject') subject?: string, @Query('channelId') channelId?: string) { return this.education.playlists(subject, channelId); }
  @Get('videos') videos(@CurrentUser('id') userId: string, @Query() query: Record<string, string>) { return this.education.videos(userId, query); }
  @Get('videos/:id') video(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.education.video(id, userId); }
  @Get('search') search(@CurrentUser('id') userId: string, @Query('q') q = '', @Query('page') page = '1') { return this.education.videos(userId, { q, page }); }
  @Get('continue-learning') continueLearning(@CurrentUser('id') userId: string) { return this.education.continueLearning(userId); }
  @Get('saved') saved(@CurrentUser('id') userId: string) { return this.education.saved(userId); }
  @Get('videos/:id/notes') notes(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.education.notes(id, userId); }
  @Post('videos/:id/save') save(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.education.save(id, userId); }
  @Delete('videos/:id/save') unsave(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.education.unsave(id, userId); }
  @Post('videos/:id/progress') progress(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) { return this.education.progress(id, userId, body); }
  @Post('videos/:id/complete') complete(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.education.complete(id, userId); }
  @Post('videos/:id/notes') addNote(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) { return this.education.addNote(id, userId, body); }
  @Post('videos/:id/report') report(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) { return this.education.report(id, userId, body); }
  @Post('mentor/chat') mentor(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) { return this.education.mentor(userId, body); }
}
