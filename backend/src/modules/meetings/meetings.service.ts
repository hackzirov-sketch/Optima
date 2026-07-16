import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import {
  MeetingStatus,
  MeetingParticipantRole,
} from '../../common/enums/meeting.enum';
import { NotificationType } from '../../common/enums';
import { MembersService } from '../workspaces/members.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReminderSchedulerService } from '../notifications/reminder-scheduler.service';
import { StorageService } from '../storage/storage.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../common/utils/sql.util';
import * as crypto from 'crypto';

export const MEETING_RECORDING_QUEUE = 'meeting-recording';

const MEETING_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", host_id AS "hostId", title, description,
  meeting_code AS "meetingCode", status, visibility, start_time AS "startTime", end_time AS "endTime",
  max_participants AS "maxParticipants", is_recurring AS "isRecurring", agenda,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

const PARTICIPANT_COLUMNS_SQL = `
  id, meeting_id AS "meetingId", user_id AS "userId", role, joined_at AS "joinedAt",
  left_at AS "leftAt", is_muted AS "isMuted", camera_enabled AS "cameraEnabled",
  screen_sharing AS "screenSharing", created_at AS "createdAt"
`;

const RECORDING_COLUMNS_SQL = `
  id, meeting_id AS "meetingId", started_by AS "startedBy", status,
  started_at AS "startedAt", stopped_at AS "stoppedAt", duration_seconds AS "durationSeconds",
  auto_stopped AS "autoStopped", storage_key AS "storageKey", storage_url AS "storageUrl",
  file_size AS "fileSize", created_at AS "createdAt", updated_at AS "updatedAt"
`;

function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (n: number) =>
    Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join(
      '',
    );
  return `OPTIMA-${segment(3)}-${segment(4)}`;
}

@Injectable()
export class MeetingsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
    // MeetingsService -> NotificationsService -> EventsGateway -> MeetingsService
    // closes a cycle; forwardRef required here to avoid undefined at runtime.
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ReminderSchedulerService))
    private readonly reminderScheduler: ReminderSchedulerService,
    private readonly storageService: StorageService,
  ) {}

  private async findMeeting(meetingId: string) {
    const rows = await this.dataSource.query(
      `SELECT ${MEETING_COLUMNS_SQL} FROM meetings WHERE id = $1`,
      [meetingId],
    );
    return rows[0] ?? null;
  }

  private async findMeetingWithHost(meetingId: string) {
    const rows: any[] = await this.dataSource.query(
      `SELECT m.*, u.id AS "h_id", u.first_name AS "h_firstName", u.last_name AS "h_lastName", u.avatar_url AS "h_avatarUrl"
       FROM (SELECT ${MEETING_COLUMNS_SQL} FROM meetings WHERE id = $1) m
       LEFT JOIN users u ON u.id = m."hostId"`,
      [meetingId],
    );
    const row = rows[0];
    if (!row) return null;
    const { h_id, h_firstName, h_lastName, h_avatarUrl, ...meeting } = row;
    return {
      ...meeting,
      host: h_id
        ? {
            id: h_id,
            firstName: h_firstName,
            lastName: h_lastName,
            avatarUrl: h_avatarUrl,
          }
        : null,
    };
  }

  private async findParticipants(meetingId: string) {
    return this.dataSource.query(
      `SELECT ${PARTICIPANT_COLUMNS_SQL} FROM meeting_participants WHERE meeting_id = $1`,
      [meetingId],
    );
  }

  private async assertHost(meetingId: string, userId: string) {
    const m = await this.findMeeting(meetingId);
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

  private enrichMeeting(meeting: any, participants: any[]) {
    return {
      id: meeting.id,
      workspaceId: meeting.workspaceId,
      hostId: meeting.hostId,
      host: meeting.host ?? null,
      title: meeting.title,
      description: meeting.description ?? null,
      code: meeting.meetingCode,
      status: meeting.status,
      startTime: meeting.startTime,
      endTime: meeting.endTime ?? null,
      maxParticipants: meeting.maxParticipants,
      isRecurring: meeting.isRecurring,
      agenda: meeting.agenda ?? null,
      participantCount: participants.filter((p) => !p.leftAt).length,
      participants: participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        role: p.role,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt ?? null,
        isMuted: p.isMuted,
        cameraEnabled: p.cameraEnabled,
        screenSharing: p.screenSharing,
      })),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }

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
      return this.enrichMeeting(
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
      return this.enrichMeeting(
        {
          ...meetingRest,
          workspaceId: workspace_id,
          hostId: host_id,
          meetingCode: meeting_code,
          startTime: start_time,
          endTime: end_time,
          maxParticipants: max_participants,
          isRecurring: is_recurring,
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
            max_participants, is_recurring, agenda, visibility)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 100), COALESCE($9, false), $10, $11)
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
          dto.visibility ?? 'workspace',
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

    const full = await this.findMeetingWithHost(saved.id);
    const participants = await this.findParticipants(saved.id);

    // Schedule reminders if meeting has a scheduledAt/startTime
    if (saved.startTime) {
      this.reminderScheduler
        .scheduleMeetingReminders(saved.id, saved.startTime)
        .catch(() => {});
    }

    return this.enrichMeeting(full, participants);
  }

  async getOne(meetingId: string, userId: string) {
    const meeting = await this.findMeetingWithHost(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });

    const participants = await this.findParticipants(meetingId);
    return this.enrichMeeting(meeting, participants);
  }

  private async assertMeetingParticipant(meetingId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT m.id
       FROM meetings m
       LEFT JOIN meeting_participants p
         ON p.meeting_id = m.id AND p.user_id = $2 AND p.left_at IS NULL
       WHERE m.id = $1 AND (m.host_id = $2 OR p.id IS NOT NULL)`,
      [meetingId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'Join the meeting before sharing files',
      });
    }
  }

  async presignSharedFile(meetingId: string, userId: string, fileName: string, mimeType: string, fileSize: number) {
    await this.assertMeetingParticipant(meetingId, userId);
    return this.storageService.getPresignedUploadUrl('meeting-files', userId, fileName, mimeType, fileSize);
  }

  async shareFile(meetingId: string, userId: string, file: { fileName: string; mimeType: string; fileSize: number; storageKey: string; storageUrl: string }) {
    await this.assertMeetingParticipant(meetingId, userId);
    if (!file.storageKey.startsWith(`meeting-files/${userId}/`)) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Invalid meeting file key' });
    }
    if (!file.storageUrl.endsWith(`/${file.storageKey}`)) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Invalid meeting file URL' });
    }
    const rows = normalizeReturning(await this.dataSource.query(
      `INSERT INTO meeting_shared_files
         (meeting_id, shared_by, file_name, mime_type, file_size, storage_key, storage_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, meeting_id AS "meetingId", shared_by AS "sharedBy", file_name AS "fileName",
                 mime_type AS "mimeType", file_size::text AS "fileSize", storage_url AS "storageUrl", created_at AS "createdAt"`,
      [meetingId, userId, file.fileName, file.mimeType, file.fileSize, file.storageKey, file.storageUrl],
    ));
    return rows[0];
  }

  async listSharedFiles(meetingId: string, userId: string) {
    await this.assertMeetingParticipant(meetingId, userId);
    return this.dataSource.query(
      `SELECT f.id, f.meeting_id AS "meetingId", f.shared_by AS "sharedBy", f.file_name AS "fileName",
              f.mime_type AS "mimeType", f.file_size::text AS "fileSize", f.storage_url AS "storageUrl",
              f.created_at AS "createdAt", u.first_name AS "firstName", u.last_name AS "lastName"
       FROM meeting_shared_files f
       JOIN users u ON u.id = f.shared_by
       WHERE f.meeting_id = $1
       ORDER BY f.created_at DESC
       LIMIT 100`,
      [meetingId],
    );
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

    const full = await this.findMeetingWithHost(saved.id);
    const participants = await this.findParticipants(saved.id);
    return this.enrichMeeting(full, participants);
  }

  async remove(meetingId: string, userId: string) {
    await this.assertHost(meetingId, userId);
    await this.dataSource.query(
      `UPDATE meetings SET status = $2::meeting_status_enum WHERE id = $1`,
      [meetingId, MeetingStatus.CANCELLED],
    );
    this.reminderScheduler.cancelMeetingReminders(meetingId).catch(() => {});
  }

  async join(meetingId: string, userId: string) {
    const meeting = await this.findMeeting(meetingId);
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
      `SELECT ${PARTICIPANT_COLUMNS_SQL} FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [meetingId, userId],
    );
    const existing = existingRows[0];
    if (existing) {
      // Re-joining after leaving
      await this.dataSource.query(
        `UPDATE meeting_participants SET joined_at = now(), left_at = NULL WHERE id = $1`,
        [existing.id],
      );
      return this.getOne(meetingId, userId);
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

    // If host leaves and meeting is live, end it
    const meeting = await this.findMeeting(meetingId);
    if (
      meeting &&
      meeting.hostId === userId &&
      meeting.status === MeetingStatus.LIVE
    ) {
      await this.dataSource.query(
        `UPDATE meetings SET status = $2::meeting_status_enum, end_time = now() WHERE id = $1`,
        [meetingId, MeetingStatus.ENDED],
      );
    }

    return { left: true };
  }

  async joinByCode(code: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT ${MEETING_COLUMNS_SQL} FROM meetings WHERE meeting_code = $1`,
      [code.toUpperCase()],
    );
    const meeting = rows[0];
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_CODE_INVALID,
        message: 'Invalid meeting code',
      });
    return this.join(meeting.id, userId);
  }

  async inviteMembers(
    meetingId: string,
    inviterId: string,
    targetUserIds: string[],
  ) {
    const meeting = await this.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });

    // Ensure inviter is a member of the workspace
    await this.membersService.assertMember(meeting.workspaceId, inviterId);

    // Server-side guard: never let the inviter invite themself, and
    // de-duplicate. The frontend also filters the host out of the invite
    // list, but that filter must not be the only line of defense — a
    // stale UI, another client, or a direct API call could still send
    // the inviter's own id.
    const targetIds = Array.from(new Set(targetUserIds)).filter(
      (uid) => uid !== inviterId,
    );

    // Filter valid workspace members
    const validMembers = await Promise.all(
      targetIds.map(async (uid) => {
        try {
          await this.membersService.assertMember(meeting.workspaceId, uid);
          return uid;
        } catch {
          return null;
        }
      }),
    );
    const validUserIds = validMembers.filter(Boolean) as string[];

    const notifications = validUserIds.map((uid) =>
      this.notificationsService.create({
        userId: uid,
        actorId: inviterId,
        type: NotificationType.MEETING_INVITE,
        title: 'Meeting Invitation',
        message: `Sizni "${meeting.title || 'Uchrashuv'}" nomli meetingga taklif qilishdi.`,
        entityType: 'meeting',
        entityId: meeting.id,
        actionUrl: `/app/meetings`,
        metadata: { joinCode: meeting.meetingCode },
      }),
    );

    await Promise.all(notifications);
    return { success: true, invitedCount: validUserIds.length };
  }

  // ─────────────────────────────────────────────
  //  Recording (hard 1-hour cap, enforced server-side)
  // ─────────────────────────────────────────────

  /**
   * Only the host or a co-host can start a recording. Enforced here (not
   * just in the UI) because the WebSocket handler is a thin wrapper around
   * this method — this is the actual authorization boundary.
   */
  private async assertCanRecord(meetingId: string, userId: string) {
    const meeting = await this.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });

    if (meeting.hostId === userId) return meeting;

    const participantRows = await this.dataSource.query(
      `SELECT role FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    const role = participantRows[0]?.role;
    if (role !== MeetingParticipantRole.CO_HOST) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_HOST_ONLY,
        message: 'Only the host or a co-host can control recording',
      });
    }
    return meeting;
  }

  async startRecording(meetingId: string, userId: string) {
    await this.assertCanRecord(meetingId, userId);

    const activeRows = await this.dataSource.query(
      `SELECT id FROM meeting_recordings WHERE meeting_id = $1 AND status = 'recording'`,
      [meetingId],
    );
    if (activeRows[0]) {
      throw new ConflictException({
        code: ErrorCode.MEETING_RECORDING_ALREADY_ACTIVE,
        message: 'A recording is already in progress for this meeting',
      });
    }

    const rows = await this.dataSource.query(
      `INSERT INTO meeting_recordings (meeting_id, started_by, status, started_at)
       VALUES ($1, $2, 'recording', now())
       RETURNING ${RECORDING_COLUMNS_SQL}`,
      [meetingId, userId],
    );
    const recording = rows[0];

    return recording;
  }

  /** Called by the host or a legacy auto-stop job created before unlimited recordings. */
  async stopRecording(
    meetingId: string,
    userId: string | null,
    opts: {
      autoStopped?: boolean;
      storageKey?: string;
      storageUrl?: string;
      fileSize?: number;
    } = {},
  ) {
    if (userId) await this.assertCanRecord(meetingId, userId);

    const rows = await this.dataSource.query(
      `SELECT ${RECORDING_COLUMNS_SQL} FROM meeting_recordings WHERE meeting_id = $1 AND status = 'recording'`,
      [meetingId],
    );
    const recording = rows[0];
    if (!recording) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_RECORDING_NOT_ACTIVE,
        message: 'No active recording for this meeting',
      });
    }

    const durationSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(recording.startedAt).getTime()) / 1000),
    );

    const updatedRows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE meeting_recordings
         SET status = 'completed', stopped_at = now(), duration_seconds = $2,
             auto_stopped = $3, storage_key = COALESCE($4, storage_key),
             storage_url = COALESCE($5, storage_url), file_size = COALESCE($6, file_size)
         WHERE id = $1
         RETURNING ${RECORDING_COLUMNS_SQL}`,
        [
          recording.id,
          durationSeconds,
          opts.autoStopped ?? false,
          opts.storageKey ?? null,
          opts.storageUrl ?? null,
          opts.fileSize ?? null,
        ],
      ),
    );

    return updatedRows[0];
  }

  async listRecordings(meetingId: string, userId: string) {
    const meeting = await this.findMeeting(meetingId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'Meeting not found',
      });
    await this.membersService.assertMember(meeting.workspaceId, userId);

    return this.dataSource.query(
      `SELECT ${RECORDING_COLUMNS_SQL} FROM meeting_recordings WHERE meeting_id = $1 ORDER BY started_at DESC`,
      [meetingId],
    );
  }

  /** Presigned PUT URL for the client to upload the recorded blob directly to R2 once stopped. */
  async presignRecordingUpload(
    meetingId: string,
    recordingId: string,
    userId: string,
    mimeType: string,
    fileSize: number,
  ) {
    await this.assertCanRecord(meetingId, userId);

    const rows = await this.dataSource.query(
      `SELECT id FROM meeting_recordings WHERE id = $1 AND meeting_id = $2`,
      [recordingId, meetingId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEETING_RECORDING_NOT_FOUND,
        message: 'Recording not found',
      });
    }

    const ext = mimeType === 'video/mp4' ? 'mp4' : 'webm';
    const { uploadUrl, storageKey, storageUrl } =
      await this.storageService.getPresignedUploadUrl(
        'meeting-recordings',
        meetingId,
        `${recordingId}.${ext}`,
        mimeType,
        fileSize,
      );
    return { uploadUrl, storageKey, storageUrl };
  }
}
