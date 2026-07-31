import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import {
  MeetingStatus,
  MeetingParticipantRole,
} from '../../common/enums/meeting.enum';
import { RoomScope } from '../../common/enums';
import { MembersService } from '../workspaces/services/members.service';
import { ReminderSchedulerService } from '../notifications/reminder-scheduler.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../common/utils/sql.util';
import {
  MEETING_COLUMNS_SQL,
  PARTICIPANT_COLUMNS_SQL,
  generateMeetingCode,
  defaultJoinPolicy,
} from './meetings.sql';
import {
  MEETING_LIFECYCLE_QUEUE,
  MEETING_AUTO_END_GRACE_SECONDS,
} from './meetings.constants';
import { MeetingsRepository } from './repositories/meetings.repository';
import { MeetingAccessService } from './services/meeting-access.service';
import { MeetingRecordingService } from './services/meeting-recording.service';
import { MeetingJoinRequestService } from './services/meeting-join-request.service';
import { MeetingFilesService } from './services/meeting-files.service';

export {
  MEETING_RECORDING_QUEUE,
  MAX_RECORDING_DURATION_SECONDS,
  MEETING_LIFECYCLE_QUEUE,
  MEETING_AUTO_END_GRACE_SECONDS,
} from './meetings.constants';
export type { MeetingAccess } from './services/meeting-access.service';

/**
 * Thin facade over the meetings domain. Core CRUD/lifecycle lives here;
 * access-control decisions, the waiting-room/join-request flow, shared
 * files, and recording are each split into their own focused service
 * (see modules/meetings/services/) — this class just wires them together
 * so meetings.controller.ts / events.gateway.ts / the BullMQ processors
 * keep a single, stable entry point.
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly meetingsRepository: MeetingsRepository,
    private readonly accessService: MeetingAccessService,
    private readonly recordingService: MeetingRecordingService,
    // MeetingsService.getOne() -> MeetingJoinRequestService.getWaitingCount()
    // while MeetingJoinRequestService.requestToJoin() -> this.join()/getOne()
    // closes a cycle; forwardRef required here to avoid undefined at runtime.
    @Inject(forwardRef(() => MeetingJoinRequestService))
    private readonly joinRequestService: MeetingJoinRequestService,
    private readonly filesService: MeetingFilesService,
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
    @Inject(forwardRef(() => ReminderSchedulerService))
    private readonly reminderScheduler: ReminderSchedulerService,
    @InjectQueue(MEETING_LIFECYCLE_QUEUE)
    private readonly lifecycleQueue: Queue,
  ) {}

  async listForWorkspace(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);

    const meetings: any[] = await this.dataSource.query(
      `SELECT m.*, u.id AS "h_id", u.first_name AS "h_firstName", u.last_name AS "h_lastName", u.avatar_url AS "h_avatarUrl"
       FROM (SELECT ${MEETING_COLUMNS_SQL} FROM meetings
             WHERE workspace_id = $1
               AND (host_id = $2 OR EXISTS (
                 SELECT 1 FROM meeting_participants mp
                 WHERE mp.meeting_id = meetings.id AND mp.user_id = $2
               ))
             ORDER BY start_time DESC) m
       LEFT JOIN users u ON u.id = m."hostId"`,
      [workspaceId, userId],
    );
    if (!meetings.length) return [];

    const meetingIds = meetings.map((m) => m.id);
    const participants: any[] = await this.dataSource.query(
      `SELECT ${PARTICIPANT_COLUMNS_SQL} FROM meeting_participants WHERE meeting_id = ANY($1::uuid[])`,
      [meetingIds],
    );

    const byMeeting = new Map<string, any[]>();
    for (const p of participants) {
      if (!byMeeting.has(p.meetingId)) byMeeting.set(p.meetingId, []);
      byMeeting.get(p.meetingId)!.push(p);
    }

    return meetings.map((m) => {
      const { h_id, h_firstName, h_lastName, h_avatarUrl, ...meeting } = m;
      const host = h_id
        ? {
            id: h_id,
            firstName: h_firstName,
            lastName: h_lastName,
            avatarUrl: h_avatarUrl,
          }
        : null;
      return this.meetingsRepository.enrichMeeting(
        { ...meeting, host },
        byMeeting.get(m.id) ?? [],
      );
    });
  }

  async listForUser(userId: string) {
    const meetings: any[] = await this.dataSource.query(
      `SELECT m.*, u.id AS "h_id", u.first_name AS "h_firstName", u.last_name AS "h_lastName", u.avatar_url AS "h_avatarUrl"
       FROM meetings m
       LEFT JOIN users u ON u.id = m.host_id
       WHERE m.id IN (
         SELECT meeting_id FROM meeting_participants WHERE user_id = $1 AND left_at IS NULL
       ) OR m.host_id = $1
       ORDER BY m.start_time DESC`,
      [userId],
    );
    if (!meetings.length) return [];

    const meetingIds = meetings.map((m) => m.id);
    const participants: any[] = await this.dataSource.query(
      `SELECT ${PARTICIPANT_COLUMNS_SQL} FROM meeting_participants WHERE meeting_id = ANY($1::uuid[])`,
      [meetingIds],
    );

    const byMeeting = new Map<string, any[]>();
    for (const p of participants) {
      if (!byMeeting.has(p.meetingId)) byMeeting.set(p.meetingId, []);
      byMeeting.get(p.meetingId)!.push(p);
    }

    return meetings.map((m) => {
      const {
        h_id,
        h_firstName,
        h_lastName,
        h_avatarUrl,
        workspace_id,
        host_id,
        meeting_code,
        start_time,
        end_time,
        max_participants,
        is_recurring,
        join_policy,
        ...meetingRest
      } = m;
      const host = h_id
        ? {
            id: h_id,
            firstName: h_firstName,
            lastName: h_lastName,
            avatarUrl: h_avatarUrl,
          }
        : null;
      return this.meetingsRepository.enrichMeeting(
        {
          ...meetingRest,
          workspaceId: workspace_id,
          hostId: host_id,
          meetingCode: meeting_code,
          startTime: start_time,
          endTime: end_time,
          maxParticipants: max_participants,
          isRecurring: is_recurring,
          joinPolicy: join_policy,
          host,
        },
        byMeeting.get(m.id) ?? [],
      );
    });
  }

  async create(
    workspaceId: string | null,
    userId: string,
    dto: CreateMeetingDto,
  ) {
    const scope = dto.scope ?? RoomScope.WORKSPACE_ONLY;
    const joinPolicy = dto.joinPolicy ?? defaultJoinPolicy(scope);
    if (scope === RoomScope.WORKSPACE_ONLY && !workspaceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'workspace_only meetings require a workspace',
      });
    }
    if (workspaceId) {
      await this.membersService.assertMember(workspaceId, userId);
    }

    let code: string;
    let attempts = 0;
    do {
      code = generateMeetingCode();
      if (++attempts > 10)
        throw new BadRequestException({
          code: ErrorCode.MEETING_CODE_GENERATION_FAILED,
          message: 'Could not generate unique meeting code',
        });
      const existing = await this.dataSource.query(
        `SELECT id FROM meetings WHERE meeting_code = $1`,
        [code],
      );
      if (!existing[0]) break;
    } while (true);

    let saved: any;
    try {
      const rows = await this.dataSource.query(
        `INSERT INTO meetings
           (workspace_id, host_id, title, description, meeting_code, start_time, end_time,
            max_participants, is_recurring, agenda, scope, join_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 100), COALESCE($9, false), $10, $11, $12)
         RETURNING ${MEETING_COLUMNS_SQL}`,
        [
          workspaceId,
          userId,
          dto.title,
          dto.description ?? null,
          code!,
          new Date(dto.startTime),
          dto.endTime ? new Date(dto.endTime) : null,
          dto.maxParticipants ?? null,
          dto.isRecurring ?? null,
          dto.agenda ?? null,
          scope,
          joinPolicy,
        ],
      );
      saved = rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException({
          code: ErrorCode.MEETING_CODE_GENERATION_FAILED,
          message: 'Meeting code collision — please retry',
        });
      }
      throw err;
    }

    // Host auto-joins as host
    await this.dataSource.query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role, joined_at)
       VALUES ($1, $2, $3::meeting_participant_role_enum, now())`,
      [saved.id, userId, MeetingParticipantRole.HOST],
    );

    const full = await this.meetingsRepository.findMeetingWithHost(saved.id);
    const participants = await this.meetingsRepository.findParticipants(
      saved.id,
    );

    // Schedule reminders if meeting has a scheduledAt/startTime
    if (saved.startTime) {
      this.reminderScheduler
        .scheduleMeetingReminders(saved.id, saved.startTime)
        .catch(() => {});
    }

    return this.meetingsRepository.enrichMeeting(full, participants);
  }

  async getOne(meetingId: string, userId: string) {
    const meeting =
      await this.meetingsRepository.findMeetingWithHost(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });

    const decision = await this.accessService.resolveAccess(meeting, userId);
    if (decision.kind === 'denied') {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ACCESS_DENIED,
        message: this.accessService.accessDeniedMessage(decision.reason),
      });
    }

    const participants =
      await this.meetingsRepository.findParticipants(meetingId);
    const enriched = this.meetingsRepository.enrichMeeting(
      meeting,
      participants,
      this.accessService.describeAccess(decision),
    );

    const canManage =
      decision.kind === 'host' ||
      participants.some(
        (p) =>
          p.userId === userId &&
          p.role === MeetingParticipantRole.CO_HOST &&
          !p.leftAt,
      );
    if (canManage) {
      (enriched as any).waitingCount =
        await this.joinRequestService.getWaitingCount(meetingId);
    }
    return enriched;
  }

  private async assertHost(meetingId: string, userId: string) {
    const m = await this.meetingsRepository.findMeeting(meetingId);
    if (!m)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    if (m.hostId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.MEETING_HOST_ONLY,
        message: 'Only the host can perform this action',
      });
    return m;
  }

  async update(meetingId: string, userId: string, dto: UpdateMeetingDto) {
    const meeting = await this.assertHost(meetingId, userId);
    if (
      meeting.status === MeetingStatus.ENDED ||
      meeting.status === MeetingStatus.CANCELLED
    ) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ALREADY_FINISHED,
        message: 'Cannot update a finished meeting',
      });
    }

    const patch: Record<string, unknown> = { ...dto };
    if (dto.startTime !== undefined) patch.startTime = new Date(dto.startTime);
    if (dto.endTime !== undefined) patch.endTime = new Date(dto.endTime);

    const { setClause, values } = buildUpdateSet(patch, 2, {
      status: 'meeting_status_enum',
      scope: 'room_scope_enum',
      join_policy: 'meeting_join_policy_enum',
    });
    let saved = meeting;
    if (setClause) {
      const rows = normalizeReturning(
        await this.dataSource.query(
          `UPDATE meetings SET ${setClause} WHERE id = $1 RETURNING ${MEETING_COLUMNS_SQL}`,
          [meetingId, ...values],
        ),
      );
      saved = rows[0];
    }

    // Reschedule reminders if startTime changed
    if (dto.startTime && saved.startTime) {
      this.reminderScheduler
        .scheduleMeetingReminders(saved.id, saved.startTime)
        .catch(() => {});
    }

    const full = await this.meetingsRepository.findMeetingWithHost(saved.id);
    const participants = await this.meetingsRepository.findParticipants(
      saved.id,
    );
    return this.meetingsRepository.enrichMeeting(full, participants);
  }

  async remove(meetingId: string, userId: string) {
    await this.assertHost(meetingId, userId);
    await this.dataSource.query(
      `UPDATE meetings SET status = $2::meeting_status_enum WHERE id = $1`,
      [meetingId, MeetingStatus.CANCELLED],
    );
    this.reminderScheduler.cancelMeetingReminders(meetingId).catch(() => {});
  }

  /** Host-only: block any further NEW joins ("🔒 Lock Meeting"). Existing participants can still reconnect. */
  async lockMeeting(meetingId: string, userId: string) {
    await this.assertHost(meetingId, userId);
    const rows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meetings SET locked = true WHERE id = $1 RETURNING ${MEETING_COLUMNS_SQL}`,
        [meetingId],
      ),
    );
    return rows[0];
  }

  async unlockMeeting(meetingId: string, userId: string) {
    await this.assertHost(meetingId, userId);
    const rows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meetings SET locked = false WHERE id = $1 RETURNING ${MEETING_COLUMNS_SQL}`,
        [meetingId],
      ),
    );
    return rows[0];
  }

  async join(meetingId: string, userId: string) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    if (
      meeting.status === MeetingStatus.ENDED ||
      meeting.status === MeetingStatus.CANCELLED
    ) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ENDED,
        message: 'Meeting is no longer active',
      });
    }
    const existingRows = await this.dataSource.query(
      `SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [meetingId, userId],
    );
    const existing = existingRows[0];
    if (existing) {
      // Re-joining after leaving — already vetted the first time they joined.
      await this.dataSource.query(
        `UPDATE meeting_participants SET joined_at = now(), left_at = NULL WHERE id = $1`,
        [existing.id],
      );
      return this.getOne(meetingId, userId);
    }

    const decision = await this.accessService.resolveAccess(meeting, userId);
    if (decision.kind === 'denied') {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ACCESS_DENIED,
        message: this.accessService.accessDeniedMessage(decision.reason),
      });
    }
    if (decision.kind === 'approval') {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_APPROVAL_REQUIRED,
        message:
          'This meeting requires host approval. Send a request to join instead.',
        requestStatus: decision.joinRequest?.status ?? null,
      });
    }

    const activeCountRows = await this.dataSource.query(
      `SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = $1 AND left_at IS NULL`,
      [meetingId],
    );
    const activeCount = Number(activeCountRows[0]?.count ?? 0);
    if (activeCount >= meeting.maxParticipants) {
      throw new ConflictException({
        code: ErrorCode.MEETING_FULL,
        message: 'Meeting is at full capacity',
      });
    }

    // Auto-start meeting when first non-host joins
    if (meeting.status === MeetingStatus.SCHEDULED) {
      await this.dataSource.query(
        `UPDATE meetings SET status = $2::meeting_status_enum WHERE id = $1`,
        [meetingId, MeetingStatus.LIVE],
      );
    }

    await this.dataSource.query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role, joined_at)
       VALUES ($1, $2, $3::meeting_participant_role_enum, now())`,
      [meetingId, userId, MeetingParticipantRole.PARTICIPANT],
    );
    return this.getOne(meetingId, userId);
  }

  getIceServers() {
    const urls = (process.env.TURN_URLS || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    const iceServers: Array<{
      urls: string[];
      username?: string;
      credential?: string;
    }> = [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'],
      },
    ];
    if (
      urls.length &&
      process.env.TURN_USERNAME &&
      process.env.TURN_CREDENTIAL
    ) {
      iceServers.push({
        urls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
    return iceServers;
  }

  /**
   * Leave the meeting. This is "leave only" semantics for everyone,
   * including the host — same as Google Meet, the host leaving does NOT
   * end the meeting for the rest of the participants. The meeting is only
   * torn down when the host explicitly calls `endMeeting`, or when the
   * last remaining participant leaves (see `scheduleAutoEndCheck`).
   */
  async leave(meetingId: string, userId: string) {
    const participantRows = await this.dataSource.query(
      `SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    if (!participantRows[0])
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'You are not in this meeting',
      });

    await this.dataSource.query(
      `UPDATE meeting_participants SET left_at = now() WHERE id = $1`,
      [participantRows[0].id],
    );

    await this.scheduleAutoEndCheck(meetingId);

    return { left: true };
  }

  /**
   * If nobody is left in a LIVE meeting, schedule a delayed re-check
   * (MEETING_AUTO_END_GRACE_SECONDS later) rather than ending immediately —
   * gives a rejoin/reconnect a window to cancel the auto-end. Safe to call
   * after every leave: it's a cheap no-op whenever someone is still present.
   */
  private async scheduleAutoEndCheck(meetingId: string) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting || meeting.status !== MeetingStatus.LIVE) return;

    const activeCountRows = await this.dataSource.query(
      `SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = $1 AND left_at IS NULL`,
      [meetingId],
    );
    if (Number(activeCountRows[0]?.count ?? 0) > 0) return;

    await this.lifecycleQueue.add(
      'check-auto-end',
      { meetingId },
      {
        delay: MEETING_AUTO_END_GRACE_SECONDS * 1000,
        jobId: `auto-end_${meetingId}`,
      },
    );
  }

  /**
   * Called only by MeetingLifecycleProcessor once the grace period elapses.
   * Re-checks presence at fire time — if someone rejoined in the meantime
   * this is a no-op, exactly like Google Meet's empty-room behavior.
   */
  async checkAutoEnd(meetingId: string) {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting || meeting.status !== MeetingStatus.LIVE) return null;

    const activeCountRows = await this.dataSource.query(
      `SELECT COUNT(*) FROM meeting_participants WHERE meeting_id = $1 AND left_at IS NULL`,
      [meetingId],
    );
    if (Number(activeCountRows[0]?.count ?? 0) > 0) return null;

    return this.finishMeeting(meetingId);
  }

  /** Host-only: end the meeting for everyone right now ("End meeting" popup choice). */
  async endMeeting(meetingId: string, userId: string) {
    await this.assertHost(meetingId, userId);
    const ended = await this.finishMeeting(meetingId);
    if (!ended) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_ALREADY_FINISHED,
        message: 'Meeting already finished',
      });
    }
    return ended;
  }

  /**
   * Shared terminal transition, used by both the explicit host "End meeting"
   * action and the automatic empty-room timeout. Marks the meeting ENDED
   * (history is never deleted — only ever transitions to ENDED/CANCELLED),
   * force-closes any still-active participant rows, auto-stops an in-progress
   * recording, and cancels any pending auto-end job so it doesn't fire twice.
   */
  private async finishMeeting(meetingId: string) {
    const rows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meetings SET status = $2::meeting_status_enum, end_time = now()
         WHERE id = $1 AND status = $3::meeting_status_enum
         RETURNING ${MEETING_COLUMNS_SQL}`,
        [meetingId, MeetingStatus.ENDED, MeetingStatus.LIVE],
      ),
    );
    const meeting = rows[0];
    if (!meeting) return null; // already ended/cancelled — no-op

    await this.dataSource.query(
      `UPDATE meeting_participants SET left_at = now() WHERE meeting_id = $1 AND left_at IS NULL`,
      [meetingId],
    );

    await this.recordingService
      .stopRecording(meetingId, null, { autoStopped: true })
      .catch(() => undefined);

    const job = await this.lifecycleQueue.getJob(`auto-end_${meetingId}`);
    await job?.remove().catch(() => undefined);

    return meeting;
  }

  /**
   * Unconditionally tries to join — only correct for AUTO-eligible meetings.
   * Kept for backwards compatibility; the "Join by code" UI now calls
   * resolveByCode() + the normal getOne()-driven lobby flow instead, so a
   * REQUEST_APPROVAL/locked/denied meeting surfaces "Request to Join" /
   * an access message rather than a raw 403 from a forced join attempt.
   */
  async joinByCode(code: string, userId: string) {
    const meetingId = await this.meetingsRepository.findMeetingIdByCode(code);
    return this.join(meetingId, userId);
  }

  /** Resolve a meeting code to full meeting + access info, without forcing a join. */
  async resolveByCode(code: string, userId: string) {
    const meetingId = await this.meetingsRepository.findMeetingIdByCode(code);
    return this.getOne(meetingId, userId);
  }

  // ─────────────────────────────────────────────
  //  Delegated to focused sub-services — kept here so the controller,
  //  gateway, and processors have a single stable entry point.
  // ─────────────────────────────────────────────

  getWaitingCount(meetingId: string) {
    return this.joinRequestService.getWaitingCount(meetingId);
  }

  requestToJoin(meetingId: string, userId: string) {
    return this.joinRequestService.requestToJoin(meetingId, userId);
  }

  cancelMyJoinRequest(meetingId: string, userId: string) {
    return this.joinRequestService.cancelMyJoinRequest(meetingId, userId);
  }

  listJoinRequests(meetingId: string, userId: string) {
    return this.joinRequestService.listJoinRequests(meetingId, userId);
  }

  reviewJoinRequest(
    meetingId: string,
    requestId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
  ) {
    return this.joinRequestService.reviewJoinRequest(
      meetingId,
      requestId,
      reviewerId,
      decision,
    );
  }

  batchReviewJoinRequests(
    meetingId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
  ) {
    return this.joinRequestService.batchReviewJoinRequests(
      meetingId,
      reviewerId,
      decision,
    );
  }

  inviteMembers(
    meetingId: string,
    inviterId: string,
    targetUserIds: string[],
    targetEmails: string[] = [],
  ) {
    return this.joinRequestService.inviteMembers(
      meetingId,
      inviterId,
      targetUserIds,
      targetEmails,
    );
  }

  presignSharedFile(
    meetingId: string,
    userId: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ) {
    return this.filesService.presignSharedFile(
      meetingId,
      userId,
      fileName,
      mimeType,
      fileSize,
    );
  }

  shareFile(
    meetingId: string,
    userId: string,
    file: {
      fileName: string;
      mimeType: string;
      fileSize: number;
      storageKey: string;
      storageUrl: string;
    },
  ) {
    return this.filesService.shareFile(meetingId, userId, file);
  }

  listSharedFiles(meetingId: string, userId: string) {
    return this.filesService.listSharedFiles(meetingId, userId);
  }

  startRecording(meetingId: string, userId: string) {
    return this.recordingService.startRecording(meetingId, userId);
  }

  stopRecording(
    meetingId: string,
    userId: string | null,
    opts: {
      autoStopped?: boolean;
      storageKey?: string;
      storageUrl?: string;
      fileSize?: number;
    } = {},
  ) {
    return this.recordingService.stopRecording(meetingId, userId, opts);
  }

  listRecordings(meetingId: string, userId: string) {
    return this.recordingService.listRecordings(meetingId, userId);
  }

  presignRecordingUpload(
    meetingId: string,
    recordingId: string,
    userId: string,
    mimeType: string,
    fileSize: number,
  ) {
    return this.recordingService.presignRecordingUpload(
      meetingId,
      recordingId,
      userId,
      mimeType,
      fileSize,
    );
  }
}
