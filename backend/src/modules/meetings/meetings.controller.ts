import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { IpRateLimitGuard } from '../moderation/guards/ip-rate-limit.guard';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { InviteMembersDto } from './dto/invite-members.dto';
import { SetParticipantRoleDto } from './dto/set-participant-role.dto';
import { PresignRecordingDto } from './dto/presign-recording.dto';
import { StopRecordingDto } from './dto/stop-recording.dto';
import {
  PresignMeetingFileDto,
  ShareMeetingFileDto,
} from './dto/share-meeting-file.dto';
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
  create(@CurrentUser('id') userId: string, @Body() dto: CreateMeetingDto) {
    return this.meetingsService.create(null, userId, dto);
  }

  @Get('meetings/ice-servers')
  @ApiOperation({ summary: 'Get WebRTC STUN/TURN configuration' })
  iceServers(@CurrentUser('id') userId: string) {
    return this.meetingsService.getIceServers(userId);
  }

  // ─── Join by meeting code (workspace-agnostic) ────────────────────────────

  @Post('meetings/join-by-code')
  @UseGuards(IpRateLimitGuard)
  @ApiOperation({ summary: 'Join a meeting using its 8-char code' })
  joinByCode(@CurrentUser('id') userId: string, @Body() dto: JoinByCodeDto) {
    return this.meetingsService.joinByCode(dto.code, userId);
  }

  @Post('meetings/resolve-by-code')
  @UseGuards(IpRateLimitGuard)
  @ApiOperation({
    summary:
      'Look up a meeting by its code without joining — lets the client route through the normal access/waiting-room flow',
  })
  resolveByCode(@CurrentUser('id') userId: string, @Body() dto: JoinByCodeDto) {
    return this.meetingsService.resolveByCode(dto.code, userId);
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

  @Post('meetings/:meetingId/end')
  @ApiOperation({ summary: 'End the meeting for everyone (host only)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async end(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const meeting = await this.meetingsService.endMeeting(meetingId, userId);
    this.gateway.broadcastToMeeting(meetingId, 'meeting:ended', {
      meetingId,
      reason: 'host_ended',
    });
    await this.gateway.forceEndMeetingRoom(meetingId);
    return meeting;
  }

  @Post('meetings/:meetingId/lock')
  @ApiOperation({
    summary: 'Lock the meeting — blocks any new joins (host only)',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async lock(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const meeting = await this.meetingsService.lockMeeting(meetingId, userId);
    this.gateway.broadcastToMeeting(meetingId, 'meeting:locked', {
      meetingId,
    });
    return meeting;
  }

  @Post('meetings/:meetingId/unlock')
  @ApiOperation({ summary: 'Unlock the meeting (host only)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async unlock(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const meeting = await this.meetingsService.unlockMeeting(meetingId, userId);
    this.gateway.broadcastToMeeting(meetingId, 'meeting:unlocked', {
      meetingId,
    });
    return meeting;
  }

  // ─── Join Policy: waiting room (request / approve / reject) ──────────────

  @Post('meetings/:meetingId/join-requests')
  @ApiOperation({
    summary: 'Request to join a meeting that requires host approval',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async requestToJoin(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.meetingsService.requestToJoin(meetingId, userId);
    if (result.status === 'pending') {
      const waitingCount =
        await this.meetingsService.getWaitingCount(meetingId);
      void this.gateway.notifyMeetingHosts(
        meetingId,
        'meeting:join_request:created',
        {
          meetingId,
          requestId: result.requestId,
          waitingCount,
        },
      );
    }
    return result;
  }

  @Delete('meetings/:meetingId/join-requests/me')
  @ApiOperation({ summary: 'Cancel my own pending join request' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  cancelMyJoinRequest(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.cancelMyJoinRequest(meetingId, userId);
  }

  @Get('meetings/:meetingId/join-requests')
  @ApiOperation({
    summary:
      'List pending join requests (host/co-host only) — the Waiting Room',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  listJoinRequests(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.listJoinRequests(meetingId, userId);
  }

  @Post('meetings/:meetingId/join-requests/:requestId/approve')
  @ApiOperation({ summary: 'Approve a join request (host/co-host only)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  async approveJoinRequest(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser('id') userId: string,
  ) {
    const request = await this.meetingsService.reviewJoinRequest(
      meetingId,
      requestId,
      userId,
      'approved',
    );
    this.gateway.sendToUser(request.userId, 'meeting:join_request:approved', {
      meetingId,
      requestId,
    });
    const waitingCount = await this.meetingsService.getWaitingCount(meetingId);
    void this.gateway.notifyMeetingHosts(
      meetingId,
      'meeting:join_request:reviewed',
      { meetingId, requestId, waitingCount },
    );
    return request;
  }

  @Post('meetings/:meetingId/join-requests/:requestId/reject')
  @ApiOperation({ summary: 'Reject a join request (host/co-host only)' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  async rejectJoinRequest(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser('id') userId: string,
  ) {
    const request = await this.meetingsService.reviewJoinRequest(
      meetingId,
      requestId,
      userId,
      'rejected',
    );
    this.gateway.sendToUser(request.userId, 'meeting:join_request:rejected', {
      meetingId,
      requestId,
    });
    const waitingCount = await this.meetingsService.getWaitingCount(meetingId);
    void this.gateway.notifyMeetingHosts(
      meetingId,
      'meeting:join_request:reviewed',
      { meetingId, requestId, waitingCount },
    );
    return request;
  }

  @Post('meetings/:meetingId/join-requests/approve-all')
  @ApiOperation({
    summary: 'Approve all pending join requests (host/co-host only)',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async approveAllJoinRequests(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const requests = await this.meetingsService.batchReviewJoinRequests(
      meetingId,
      userId,
      'approved',
    );
    for (const request of requests) {
      this.gateway.sendToUser(request.userId, 'meeting:join_request:approved', {
        meetingId,
        requestId: request.id,
      });
    }
    void this.gateway.notifyMeetingHosts(
      meetingId,
      'meeting:join_request:reviewed',
      { meetingId, waitingCount: 0 },
    );
    return requests;
  }

  @Post('meetings/:meetingId/join-requests/reject-all')
  @ApiOperation({
    summary: 'Reject all pending join requests (host/co-host only)',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async rejectAllJoinRequests(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const requests = await this.meetingsService.batchReviewJoinRequests(
      meetingId,
      userId,
      'rejected',
    );
    for (const request of requests) {
      this.gateway.sendToUser(request.userId, 'meeting:join_request:rejected', {
        meetingId,
        requestId: request.id,
      });
    }
    void this.gateway.notifyMeetingHosts(
      meetingId,
      'meeting:join_request:reviewed',
      { meetingId, waitingCount: 0 },
    );
    return requests;
  }

  @Post('meetings/:meetingId/invite')
  @ApiOperation({
    summary:
      'Invite members to a meeting, by workspace member id and/or email address',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  invite(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InviteMembersDto,
  ) {
    return this.meetingsService.inviteMembers(
      meetingId,
      userId,
      dto.userIds ?? [],
      dto.emails ?? [],
    );
  }

  /**
   * Co-host is the only role a host can delegate. Broadcast to the room so
   * every client re-renders the moderation controls immediately.
   */
  @Patch('meetings/:meetingId/participants/:userId/role')
  @ApiOperation({
    summary: 'Promote/demote a participant to co-host (host only)',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  async setParticipantRole(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: SetParticipantRoleDto,
  ) {
    const participant = await this.meetingsService.setParticipantRole(
      meetingId,
      actorId,
      targetUserId,
      dto.role,
    );
    this.gateway.broadcastToMeeting(meetingId, 'meeting:role-changed', {
      meetingId,
      userId: targetUserId,
      role: dto.role,
      changedBy: actorId,
    });
    return participant;
  }

  // ─── Shared files (ported from main) ───────────────────────────────────────

  @Get('meetings/:meetingId/files')
  @ApiOperation({ summary: 'List files shared in a meeting' })
  listFiles(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.meetingsService.listSharedFiles(meetingId, userId);
  }

  @Post('meetings/:meetingId/files/presign')
  @ApiOperation({ summary: 'Get a direct upload URL for a meeting file' })
  presignFile(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PresignMeetingFileDto,
  ) {
    return this.meetingsService.presignSharedFile(
      meetingId,
      userId,
      dto.fileName,
      dto.mimeType,
      dto.fileSize,
    );
  }

  @Post('meetings/:meetingId/files')
  @ApiOperation({ summary: 'Publish an uploaded file to meeting participants' })
  async shareFile(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ShareMeetingFileDto,
  ) {
    const file = await this.meetingsService.shareFile(meetingId, userId, dto);
    this.gateway.broadcastToMeeting(meetingId, 'meeting:file-shared', { file });
    return file;
  }

  // ─── Recording (host/co-host only, hard 1-hour server-side cap) ───────────

  @Post('meetings/:meetingId/recordings/start')
  @ApiOperation({
    summary:
      'Start recording the meeting (max 1 hour, auto-stopped server-side)',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async startRecording(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
  ) {
    const recording = await this.meetingsService.startRecording(
      meetingId,
      userId,
    );
    this.gateway.broadcastToMeeting(meetingId, 'meeting:recording:started', {
      recording,
    });
    return recording;
  }

  @Post('meetings/:meetingId/recordings/stop')
  @ApiOperation({ summary: 'Stop the active recording' })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  async stopRecording(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: StopRecordingDto,
  ) {
    const recording = await this.meetingsService.stopRecording(
      meetingId,
      userId,
      dto,
    );
    this.gateway.broadcastToMeeting(meetingId, 'meeting:recording:stopped', {
      recording,
    });
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
  @ApiOperation({
    summary: 'Get a presigned URL to upload the recorded blob after stopping',
  })
  @ApiParam({ name: 'meetingId', format: 'uuid' })
  @ApiParam({ name: 'recordingId', format: 'uuid' })
  presignRecording(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PresignRecordingDto,
  ) {
    return this.meetingsService.presignRecordingUpload(
      meetingId,
      recordingId,
      userId,
      dto.mimeType,
      dto.fileSize,
    );
  }
}
