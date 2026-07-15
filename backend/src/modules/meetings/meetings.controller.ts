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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { IpRateLimitGuard } from '../moderation/guards/ip-rate-limit.guard';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { PresignRecordingDto } from './dto/presign-recording.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EventsGateway } from '../gateway/events.gateway';
import { Inject, forwardRef } from '@nestjs/common';

@ApiTags('Meetings')
@ApiBearerAuth('access-token')
@Controller()
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
  ) {}

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
  @ApiOperation({ summary: 'Create a meeting in a workspace' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  createInWorkspace(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.create(workspaceId, userId, dto);
  }

  // ─── Global (User-centric) list/create ────────────────────────────────────

  @Get('meetings')
  @ApiOperation({ summary: 'List user meetings' })
  listMyMeetings(@CurrentUser('id') userId: string) {
    return this.meetingsService.listForUser(userId);
  }

  @Post('meetings')
  @ApiOperation({ summary: 'Create a standalone meeting' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.create(null, userId, dto);
  }

  @Get('meetings/ice-servers')
  @ApiOperation({ summary: 'Get WebRTC STUN/TURN configuration' })
  iceServers() {
    return this.meetingsService.getIceServers();
  }

  // ─── Join by meeting code (workspace-agnostic) ────────────────────────────

  @Post('meetings/join-by-code')
  @UseGuards(IpRateLimitGuard)
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

  @Post('meetings/:meetingId/invite')
  @ApiOperation({ summary: 'Invite members to a meeting' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  invite(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
    @Body('userIds') userIds: string[],
  ) {
    return this.meetingsService.inviteMembers(meetingId, userId, userIds || []);
  }

  // ─── Recording (host/co-host only, hard 1-hour server-side cap) ───────────

  @Post('meetings/:meetingId/recordings/start')
  @ApiOperation({ summary: 'Start recording the meeting (max 1 hour, auto-stopped server-side)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async startRecording(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const recording = await this.meetingsService.startRecording(meetingId, userId);
    this.gateway.broadcastToRoom(`meeting:${meetingId}`, 'meeting:recording:started', { recording });
    return recording;
  }

  @Post('meetings/:meetingId/recordings/stop')
  @ApiOperation({ summary: 'Stop the active recording' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async stopRecording(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const recording = await this.meetingsService.stopRecording(meetingId, userId);
    this.gateway.broadcastToRoom(`meeting:${meetingId}`, 'meeting:recording:stopped', { recording });
    return recording;
  }

  @Get('meetings/:meetingId/recordings')
  @ApiOperation({ summary: 'List recordings for a meeting' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  listRecordings(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.listRecordings(meetingId, userId);
  }

  @Post('meetings/:meetingId/recordings/:recordingId/presign')
  @ApiOperation({ summary: 'Get a presigned URL to upload the recorded blob after stopping' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  @ApiParam({ name: 'recordingId', format: 'uuid' })
  presignRecording(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PresignRecordingDto,
  ) {
    return this.meetingsService.presignRecordingUpload(meetingId, recordingId, userId, dto.mimeType, dto.fileSize);
  }
}
