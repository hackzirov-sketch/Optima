import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Meetings')
@ApiBearerAuth('access-token')
@Controller()
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  // ─── Workspace-scoped list/create ─────────────────────────────────────────

  @Get('workspaces/:workspaceId/meetings')
  @ApiOperation({ summary: 'List meetings in a workspace' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.listForWorkspace(workspaceId, userId);
  }

  @Post('workspaces/:workspaceId/meetings')
  @ApiOperation({ summary: 'Create a meeting' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.create(workspaceId, userId, dto);
  }

  // ─── Join by meeting code (workspace-agnostic) ────────────────────────────

  @Post('meetings/join-by-code')
  @ApiOperation({ summary: 'Join a meeting using its 8-char code' })
  joinByCode(
    @CurrentUser('id') userId: string,
    @Body() dto: JoinByCodeDto,
  ) {
    return this.meetingsService.joinByCode(dto.code, userId);
  }

  // ─── Single-meeting endpoints ─────────────────────────────────────────────

  @Get('meetings/:meetingId')
  @ApiOperation({ summary: 'Get meeting details' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  getOne(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.getOne(meetingId, userId);
  }

  @Patch('meetings/:meetingId')
  @ApiOperation({ summary: 'Update meeting (host only)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  update(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.update(meetingId, userId, dto);
  }

  @Delete('meetings/:meetingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel / delete meeting (host only)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async remove(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.meetingsService.remove(meetingId, userId);
  }

  @Post('meetings/:meetingId/join')
  @ApiOperation({ summary: 'Join meeting as participant' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  join(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.join(meetingId, userId);
  }

  @Post('meetings/:meetingId/leave')
  @ApiOperation({ summary: 'Leave an active meeting' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  leave(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.leave(meetingId, userId);
  }
}
