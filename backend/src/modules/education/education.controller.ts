import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EducationService } from './education.service';
import {
  AddNoteDto,
  ListVideosDto,
  MentorChatDto,
  ReportVideoDto,
  VideoProgressDto,
} from './dto/education.dto';

@ApiTags('Education')
@ApiBearerAuth('access-token')
@Controller('education')
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get('home') home(@CurrentUser('id') userId: string) {
    return this.education.home(userId);
  }
  @Get('dashboard') dashboard(@CurrentUser('id') userId: string) {
    return this.education.dashboard(userId);
  }
  @Get('subjects') subjects() {
    return this.education.subjects();
  }
  @Get('channels') channels(@Query('subject') subject?: string) {
    return this.education.channels(subject);
  }
  @Get('channels/:id') channel(@Param('id', ParseUUIDPipe) id: string) {
    return this.education.channel(id);
  }
  @Get('playlists') playlists(
    @Query('subject') subject?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.education.playlists(subject, channelId);
  }
  @Get('videos') videos(
    @CurrentUser('id') userId: string,
    @Query() query: ListVideosDto,
  ) {
    return this.education.videos(userId, query);
  }
  @Get('videos/:id') video(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.education.video(id, userId);
  }
  @Get('search') search(
    @CurrentUser('id') userId: string,
    @Query() query: ListVideosDto,
  ) {
    return this.education.videos(userId, query);
  }
  @Get('continue-learning') continueLearning(
    @CurrentUser('id') userId: string,
  ) {
    return this.education.continueLearning(userId);
  }
  @Get('saved') saved(@CurrentUser('id') userId: string) {
    return this.education.saved(userId);
  }
  @Get('videos/:id/notes') notes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.education.notes(id, userId);
  }
  @Post('videos/:id/save') save(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.education.save(id, userId);
  }
  @Delete('videos/:id/save') unsave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.education.unsave(id, userId);
  }
  @Post('videos/:id/progress') progress(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: VideoProgressDto,
  ) {
    return this.education.progress(id, userId, dto);
  }
  @Post('videos/:id/complete') complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.education.complete(id, userId);
  }
  @Post('videos/:id/notes') addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.education.addNote(id, userId, dto);
  }
  @Post('videos/:id/report') report(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportVideoDto,
  ) {
    return this.education.report(id, userId, dto);
  }
  @Post('mentor/chat') mentor(
    @CurrentUser('id') userId: string,
    @Body() dto: MentorChatDto,
  ) {
    return this.education.mentor(userId, dto);
  }
}
