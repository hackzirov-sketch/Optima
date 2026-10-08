import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
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
import { MembersService } from '../groups/services/members.service';
import { ReminderSchedulerService } from '../notifications/reminder-scheduler.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { buildUpdateSet } from '../../common/utils/sql.util';
import {
  MEETING_COLUMNS_SQL,
  PARTICIPANT_COLUMNS_SQL,
  generateMeetingCode,
  defaultJoinPolicy,
} from './meetings.sql';
import {
  MEETING_LIFECYCLE_QUEUE,
  MEETING_AUTO_END_GRACE_SECONDS,
  MEETING_INACTIVE_RETENTION_DAYS,
  MESH_MAX_PARTICIPANTS,
  effectiveCapacity,
} from './meetings.constants';
import { MeetingsRepository } from './repositories/meetings.repository';
import { MeetingAccessService } from './services/meeting-access.service';
import { MeetingRecordingService } from './services/meeting-recording.service';
import { MeetingJoinRequestService } from './services/meeting-join-request.service';
import { MeetingFilesService } from './services/meeting-files.service';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.keys';

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
  private readonly logger = new Logger(MeetingsService.name);

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
    private readonly redisService: RedisService,
  ) {}

  async listForGroup(groupId: string, userId: string) {
    await this.membersService.assertMember(groupId, userId);

    const meetings = await this.dataSource.query<any>(
      `SELECT m.*, u.id AS "h_id", u.first_name AS "h_firstName", u.last_name AS "h_lastName", u.avatar_url AS "h_avatarUrl"
       FROM (SELECT ${MEETING_COLUMNS_SQL} FROM meetings
             WHERE group_id = $1
               AND (host_id = $2 OR EXISTS (
                 SELECT 1 FROM meeting_participants mp
                 WHERE mp.meeting_id = meetings.id AND mp.user_id = $2
               ))
             ORDER BY start_time DESC) m
       LEFT JOIN users u ON u.id = m."hostId"`,
      [groupId, userId],
    );
    if (!meetings.length) return [];

    const meetingIds = meetings.map((m) => m.id);
    const participants = await this.dataSource.query<any>(
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
    const meetings = await this.dataSource.query<any>(
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
    const participants = await this.dataSource.query<any>(
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
        group_id,
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
          groupId: group_id,
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

  async create(groupId: string | null, userId: string, dto: CreateMeetingDto) {
    const scope = dto.scope ?? RoomScope.GROUP_ONLY;
    const joinPolicy = dto.joinPolicy ?? defaultJoinPolicy(scope);
    if (scope === RoomScope.GROUP_ONLY && !groupId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'group_only meetings require a group',
      });
    }
    if (groupId) {
      await this.membersService.assertMember(groupId, userId);
    }

    let code = '';
    for (let attempts = 0; attempts < 10 && !code; attempts++) {
      const candidate = generateMeetingCode();
      const existing = await this.dataSource.query(
        `SELECT id FROM meetings WHERE meeting_code = $1`,
        [candidate],
      );
      if (!existing[0]) code = candidate;
    }
    if (!code) {
      throw new BadRequestException({
        code: ErrorCode.MEETING_CODE_GENERATION_FAILED,
        message: 'Could not generate unique meeting code',
      });
    }

    let saved: any;
    try {
      // The ::int casts on the max_participants COALESCE are load-bearing.
      // Postgres resolves a COALESCE from its own arguments before the target
      // column is considered, so two bare placeholders have nothing to resolve
      // against and the whole expression comes back as text — "column
      // max_participants is of type integer but expression is of type text",
      // on every meeting creation rather than in some edge case. The boolean
      // COALESCE beside it needs no cast: the `false` literal supplies a type.
      const rows = await this.dataSource.query(
        `INSERT INTO meetings
           (group_id, host_id, title, description, meeting_code, start_time, end_time,
            max_participants, is_recurring, agenda, scope, join_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::int, $13::int), COALESCE($9, false), $10, $11, $12)
         RETURNING ${MEETING_COLUMNS_SQL}`,
        [
          groupId,
          userId,
          dto.title,
          dto.description ?? null,
          code,
          new Date(dto.startTime),
          dto.endTime ? new Date(dto.endTime) : null,
          dto.maxParticipants ?? null,
          dto.isRecurring ?? null,
          dto.agenda ?? null,
          scope,
          joinPolicy,
          MESH_MAX_PARTICIPANTS,
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
      const rows = await this.dataSource.query(
        `UPDATE meetings SET ${setClause} WHERE id = $1 RETURNING ${MEETING_COLUMNS_SQL}`,
        [meetingId, ...values],
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
    const rows = await this.dataSource.query(
      `UPDATE meetings SET locked = true WHERE id = $1 RETURNING ${MEETING_COLUMNS_SQL}`,
      [meetingId],
    );
    return rows[0];
  }

  async unlockMeeting(meetingId: string, userId: string) {
    await this.assertHost(meetingId, userId);
    const rows = await this.dataSource.query(
      `UPDATE meetings SET locked = false WHERE id = $1 RETURNING ${MEETING_COLUMNS_SQL}`,
      [meetingId],
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
    // Only a row that is still *open* short-circuits the checks below: that is
    // someone already in the call reconnecting, and re-admitting them costs the
    // meeting nothing because they were never counted out of it.
    //
    // A closed row (left_at set) is a different person entirely as far as this
    // method is concerned — they left, and the door may have changed since.
    // Treating any historical row as a permanent pass meant a returning
    // participant walked straight past both the lock the host had just turned
    // ("no new participants") and the mesh capacity limit, so a full 8-person
    // call could be pushed to 9 by anyone who had ever been in it.
    const openRows = await this.dataSource.query<{ id: string }>(
      `SELECT id FROM meeting_participants
        WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    if (openRows[0]) {
      await this.dataSource.query(
        `UPDATE meeting_participants SET joined_at = now() WHERE id = $1`,
        [openRows[0].id],
      );
      await this.dataSource.query(
        `UPDATE meetings SET last_activity_at = now() WHERE id = $1`,
        [meetingId],
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
    // The stored limit is a host preference; the mesh limit is physics.
    if (activeCount >= effectiveCapacity(meeting.maxParticipants)) {
      throw new ConflictException({
        code: ErrorCode.MEETING_FULL,
        message: 'Meeting is at full capacity',
      });
    }

    // Auto-start meeting when first non-host joins; also reactivates an
    // abandoned-but-not-ended room ("old link should still work" — see
    // migration 015 and MeetingsService.sweepExpiredInactiveMeetings).
    if (
      meeting.status === MeetingStatus.SCHEDULED ||
      meeting.status === MeetingStatus.INACTIVE
    ) {
      await this.dataSource.query(
        `UPDATE meetings SET status = $2::meeting_status_enum, last_activity_at = now() WHERE id = $1`,
        [meetingId, MeetingStatus.LIVE],
      );
    } else {
      await this.dataSource.query(
        `UPDATE meetings SET last_activity_at = now() WHERE id = $1`,
        [meetingId],
      );
    }

    // ON CONFLICT reopens the closed row of someone who left and has now been
    // re-vetted above (uq_meeting_participants_meeting_user, migration 012).
    // The role is left as it was, so a co-host who drops off the call and comes
    // back is still a co-host.
    await this.dataSource.query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role, joined_at)
       VALUES ($1, $2, $3::meeting_participant_role_enum, now())
       ON CONFLICT (meeting_id, user_id)
       DO UPDATE SET joined_at = now(), left_at = NULL`,
      [meetingId, userId, MeetingParticipantRole.PARTICIPANT],
    );
    return this.getOne(meetingId, userId);
  }

  /**
   * STUN/TURN configuration for a caller's peer connections.
   *
   * TURN credentials are minted per request and expire, rather than being one
   * shared username and password handed to everyone. A static credential is
   * permanent bandwidth: it sits in the browser of every user who has ever
   * joined a call, in their devtools network log, and in any HAR file they
   * send to support — and relaying traffic is the expensive thing a TURN
   * server does. One leak and strangers are proxying through it indefinitely,
   * with nothing to revoke short of rotating the secret for everybody.
   *
   * The scheme is coturn's `use-auth-secret` mode (the TURN REST API in
   * RFC 7635's lineage), which every mainstream TURN server implements:
   * the username is an expiry timestamp, optionally with an identifier after
   * a colon, and the password is its HMAC-SHA1 under a secret shared only
   * between this service and the TURN server. Nothing is stored on either
   * side — the server recomputes the same HMAC and checks the timestamp.
   *
   * Falls back to the old static pair when no secret is configured, so an
   * existing deployment keeps working until it sets TURN_SECRET.
   */
  getIceServers(userId?: string) {
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

    if (!urls.length) return iceServers;

    const secret = process.env.TURN_SECRET;
    if (secret) {
      // Long enough to place a call and survive an ICE restart, short enough
      // that a captured credential is worth little. It only has to be valid at
      // allocation time; an established relay is not torn down when it lapses.
      const ttlSeconds = Number(process.env.TURN_TTL_SECONDS) || 3600;
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      // The user id makes each credential attributable, so abuse can be traced
      // to an account rather than to "someone with the secret".
      const username = userId ? `${expiresAt}:${userId}` : String(expiresAt);
      const credential = crypto
        .createHmac('sha1', secret)
        .update(username)
        .digest('base64');
      iceServers.push({ urls, username, credential });
      return iceServers;
    }

    if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      this.logger.warn(
        'TURN is using a static credential — set TURN_SECRET to issue expiring ones',
      );
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
  /**
   * Persists a participant's own audio/video/screen state and enforces who may
   * change it.
   *
   * Previously `meeting:toggle` was broadcast-only: nothing was written, so
   * `meeting_participants.screen_sharing` stayed false forever, the REST
   * participant list disagreed with what clients were showing, and state was
   * lost on every reconnect. It also meant screen sharing had no gate at all —
   * any participant could start sharing and no one could stop them.
   *
   * Screen share is exclusive: one sharer at a time, claimed atomically so two
   * simultaneous requests can't both win.
   */
  async setParticipantMedia(
    meetingId: string,
    userId: string,
    kind: 'audio' | 'video' | 'screen',
    enabled: boolean,
  ): Promise<{ kind: string; enabled: boolean }> {
    const column = {
      audio: 'is_muted',
      video: 'camera_enabled',
      screen: 'screen_sharing',
    }[kind];

    // `audio` is expressed as is_muted, i.e. the inverse of "enabled".
    const value = kind === 'audio' ? !enabled : enabled;

    if (kind === 'screen' && enabled) {
      const claimed = await this.dataSource.query<{ id: string }>(
        `UPDATE meeting_participants SET screen_sharing = true
         WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM meeting_participants
             WHERE meeting_id = $1 AND screen_sharing = true
               AND left_at IS NULL AND user_id <> $2
           )
         RETURNING id`,
        [meetingId, userId],
      );
      if (!claimed[0]) {
        throw new ConflictException({
          code: ErrorCode.MEETING_SCREEN_SHARE_TAKEN,
          message: 'Someone else is already sharing their screen',
        });
      }
      return { kind, enabled: true };
    }

    const updated = await this.dataSource.query<{ id: string }>(
      `UPDATE meeting_participants SET ${column} = $3
       WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL
       RETURNING id`,
      [meetingId, userId, value],
    );
    if (!updated[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'You are not in this meeting',
      });
    }
    return { kind, enabled };
  }

  /**
   * Host/co-host override: cut someone else's screen share.
   *
   * The moderation half of the requirement — a participant controls their own
   * media, but only a host or co-host can act on somebody else's.
   */
  async forceStopScreenShare(
    meetingId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<{ stopped: boolean }> {
    await this.assertHostOrCoHost(meetingId, actorId);

    await this.dataSource.query(
      `UPDATE meeting_participants SET screen_sharing = false
       WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, targetUserId],
    );
    return { stopped: true };
  }

  /**
   * Host-only: promote a participant to co-host, or demote them back.
   *
   * Co-host is checked in four places — recording control, cutting someone
   * else's screen share, the waiting room, and who gets notified of a join
   * request — but nothing ever *granted* it: `role` was only ever written as
   * 'host' (at creation) or 'participant' (on join), so every one of those
   * branches was unreachable and the host was alone in a call they could not
   * share moderation of. This is the missing half.
   *
   * The host's own row is untouchable: demoting themself would leave the
   * meeting with a host_id whose participant row says otherwise.
   */
  async setParticipantRole(
    meetingId: string,
    actorId: string,
    targetUserId: string,
    role: MeetingParticipantRole.CO_HOST | MeetingParticipantRole.PARTICIPANT,
  ) {
    const meeting = (await this.assertHost(meetingId, actorId)) as {
      hostId: string;
    };
    if (targetUserId === meeting.hostId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: "The host's own role cannot be changed",
      });
    }

    const rows = await this.dataSource.query<{ id: string; role: string }>(
      `UPDATE meeting_participants SET role = $3::meeting_participant_role_enum
          WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL
          RETURNING ${PARTICIPANT_COLUMNS_SQL}`,
      [meetingId, targetUserId, role],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'That person is not currently in this meeting',
      });
    }
    return rows[0];
  }

  /** Host, or a participant promoted to co-host. */
  async assertHostOrCoHost(meetingId: string, userId: string): Promise<void> {
    const meeting = await this.meetingsRepository.findMeeting(meetingId);
    if (!meeting) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    }
    if (meeting.hostId === userId) return;

    const rows = await this.dataSource.query<{ role: string }>(
      `SELECT role FROM meeting_participants
       WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    if (rows[0]?.role !== MeetingParticipantRole.CO_HOST) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_HOST_ONLY,
        message: 'Only the host or a co-host can perform this action',
      });
    }
  }

  // ── Raise hand ("qo'l ko'tarish") ─────────────────────────────────────────
  // Ephemeral, session-scoped, like reactions — a visibility cue for the
  // host, not a permission grant, so there's no review/approve step and no
  // Postgres table. The gateway is what makes it real-time; this just owns
  // the authoritative "who currently has a hand up" set so a host who
  // refreshes mid-call (see leave()/scheduleMeetingLeaveGrace above) doesn't
  // lose it.

  /** Idempotent: raising an already-raised hand or lowering an unraised one is a no-op. */
  async setHandRaised(
    meetingId: string,
    userId: string,
    raised: boolean,
  ): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    const key = RedisKeys.meetingRaisedHands(meetingId);
    if (raised) await client.sadd(key, userId);
    else await client.srem(key, userId);
  }

  /** Host (or a reconnecting/late-joining client): who currently has a hand up. */
  async listRaisedHands(meetingId: string): Promise<string[]> {
    return (
      (await this.redisService
        .getClient()
        ?.smembers(RedisKeys.meetingRaisedHands(meetingId))) ?? []
    );
  }

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
   * Queues the "did they come back?" check for a socket that just dropped.
   *
   * jobId is per (meeting, user) so a flapping connection replaces its own
   * pending check instead of stacking one per disconnect; the delay is the
   * reconnect grace window, and the processor re-checks live socket presence
   * at fire time, so a reconnect inside the window makes it a no-op.
   */
  async scheduleMeetingLeaveGrace(
    meetingId: string,
    userId: string,
    delayMs: number,
  ) {
    const jobId = `leave-grace_${meetingId}_${userId}`;
    const pending = await this.lifecycleQueue.getJob(jobId);
    await pending?.remove().catch(() => undefined);
    await this.lifecycleQueue.add(
      'check-leave-grace',
      { meetingId, userId },
      { delay: delayMs, jobId },
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

    return this.deactivateMeeting(meetingId);
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
   * Empty-room transition (Google Meet-style): LIVE → INACTIVE, not ENDED.
   * The link/code stays valid — join() reactivates it straight back to LIVE
   * (see the "Auto-start meeting" block there). Nothing is left running for
   * an INACTIVE room: no socket, no media session, no TURN allocation — it's
   * pure metadata sitting in Postgres until either someone rejoins or
   * sweepExpiredInactiveMeetings() finally retires it. That split (durable
   * cheap metadata vs. torn-down-immediately runtime resources) is the same
   * one finishMeeting() draws for a fully ENDED meeting; this is just the
   * non-final version of it.
   */
  private async deactivateMeeting(meetingId: string) {
    const rows = await this.dataSource.query(
      `UPDATE meetings SET status = $2::meeting_status_enum, last_activity_at = now()
         WHERE id = $1 AND status = $3::meeting_status_enum
         RETURNING ${MEETING_COLUMNS_SQL}`,
      [meetingId, MeetingStatus.INACTIVE, MeetingStatus.LIVE],
    );
    const meeting = rows[0];
    if (!meeting) return null; // already changed under us — no-op

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
   * Retention sweep (see MeetingRetentionSweepService for the timer that
   * calls this): an INACTIVE room older than MEETING_INACTIVE_RETENTION_DAYS
   * finally becomes ENDED — the link stops working for good. Returns how
   * many rows were swept, purely for logging.
   */
  async sweepExpiredInactiveMeetings(): Promise<number> {
    const rows = await this.dataSource.query<{ id: string }>(
      `UPDATE meetings SET status = $1::meeting_status_enum, end_time = now()
         WHERE status = $2::meeting_status_enum
           AND last_activity_at < now() - ($3 || ' days')::interval
         RETURNING id`,
      [
        MeetingStatus.ENDED,
        MeetingStatus.INACTIVE,
        MEETING_INACTIVE_RETENTION_DAYS,
      ],
    );
    return rows.length;
  }

  /**
   * Shared terminal transition, used by both the explicit host "End meeting"
   * action and the retention sweep. Marks the meeting ENDED (history is
   * never deleted — only ever transitions to ENDED/CANCELLED), force-closes
   * any still-active participant rows, auto-stops an in-progress recording,
   * and cancels any pending auto-end job so it doesn't fire twice. Allowed
   * from LIVE, INACTIVE or SCHEDULED — a host can kill an abandoned link
   * just as validly as a live call.
   */
  private async finishMeeting(meetingId: string) {
    const rows = await this.dataSource.query(
      `UPDATE meetings SET status = $2::meeting_status_enum, end_time = now()
         WHERE id = $1 AND status = ANY($3::meeting_status_enum[])
         RETURNING ${MEETING_COLUMNS_SQL}`,
      [
        meetingId,
        MeetingStatus.ENDED,
        [MeetingStatus.LIVE, MeetingStatus.INACTIVE, MeetingStatus.SCHEDULED],
      ],
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

  /** Identities for a set of user ids — used by the gateway's roster payloads. */
  getParticipantProfiles(userIds: string[]) {
    return this.meetingsRepository.findUserProfiles([...new Set(userIds)]);
  }

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
