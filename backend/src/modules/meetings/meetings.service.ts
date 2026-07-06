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
import { MeetingStatus, MeetingParticipantRole } from '../../common/enums/meeting.enum';
import { NotificationType } from '../../common/enums';
import { MembersService } from '../workspaces/members.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReminderSchedulerService } from '../notifications/reminder-scheduler.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { buildUpdateSet, normalizeReturning } from '../../common/utils/sql.util';
import * as crypto from 'crypto';

const MEETING_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", host_id AS "hostId", title, description,
  meeting_code AS "meetingCode", status, start_time AS "startTime", end_time AS "endTime",
  max_participants AS "maxParticipants", is_recurring AS "isRecurring", agenda,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

const PARTICIPANT_COLUMNS_SQL = `
  id, meeting_id AS "meetingId", user_id AS "userId", role, joined_at AS "joinedAt",
  left_at AS "leftAt", is_muted AS "isMuted", camera_enabled AS "cameraEnabled",
  screen_sharing AS "screenSharing", created_at AS "createdAt"
`;

function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (n: number) =>
    Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `UPZ-${segment(3)}-${segment(4)}`;
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
    return { ...meeting, host: h_id ? { id: h_id, firstName: h_firstName, lastName: h_lastName, avatarUrl: h_avatarUrl } : null };
  }

  private async findParticipants(meetingId: string) {
    return this.dataSource.query(
      `SELECT ${PARTICIPANT_COLUMNS_SQL} FROM meeting_participants WHERE meeting_id = $1`,
      [meetingId],
    );
  }

  private async assertHost(meetingId: string, userId: string) {
    const m = await this.findMeeting(meetingId);
    if (!m) throw new NotFoundException({ code: ErrorCode.MEETING_NOT_FOUND, message: 'Meeting not found' });
    if (m.hostId !== userId)
      throw new ForbiddenException({ code: ErrorCode.MEETING_HOST_ONLY, message: 'Only the host can perform this action' });
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
       FROM (SELECT ${MEETING_COLUMNS_SQL} FROM meetings WHERE workspace_id = $1 ORDER BY start_time DESC) m
       LEFT JOIN users u ON u.id = m."hostId"`,
      [workspaceId],
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
      const host = h_id ? { id: h_id, firstName: h_firstName, lastName: h_lastName, avatarUrl: h_avatarUrl } : null;
      return this.enrichMeeting({ ...meeting, host }, byMeeting.get(m.id) ?? []);
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateMeetingDto) {
    await this.membersService.assertMember(workspaceId, userId);

    let code: string;
    let attempts = 0;
    do {
      code = generateMeetingCode();
      if (++attempts > 10) throw new BadRequestException({ code: ErrorCode.MEETING_CODE_GENERATION_FAILED, message: 'Could not generate unique meeting code' });
      const existing = await this.dataSource.query(`SELECT id FROM meetings WHERE meeting_code = $1`, [code]);
      if (!existing[0]) break;
    } while (true);

    let saved: any;
    try {
      const rows = await this.dataSource.query(
        `INSERT INTO meetings
           (workspace_id, host_id, title, description, meeting_code, start_time, end_time,
            max_participants, is_recurring, agenda)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 100), COALESCE($9, false), $10)
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
        ],
      );
      saved = rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException({ code: ErrorCode.MEETING_CODE_GENERATION_FAILED, message: 'Meeting code collision — please retry' });
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
      this.reminderScheduler.scheduleMeetingReminders(saved.id, saved.startTime).catch(() => {});
    }

    return this.enrichMeeting(full, participants);
  }

  async getOne(meetingId: string, userId: string) {
    const meeting = await this.findMeetingWithHost(meetingId);
    if (!meeting) throw new NotFoundException({ code: ErrorCode.MEETING_NOT_FOUND, message: 'Meeting not found' });
    await this.membersService.assertMember(meeting.workspaceId, userId);

    const participants = await this.findParticipants(meetingId);
    return this.enrichMeeting(meeting, participants);
  }

  async update(meetingId: string, userId: string, dto: UpdateMeetingDto) {
    const meeting = await this.assertHost(meetingId, userId);
    if (meeting.status === MeetingStatus.ENDED || meeting.status === MeetingStatus.CANCELLED) {
      throw new ForbiddenException({ code: ErrorCode.MEETING_ALREADY_FINISHED, message: 'Cannot update a finished meeting' });
    }

    const patch: Record<string, unknown> = { ...dto };
    if (dto.startTime !== undefined) patch.startTime = new Date(dto.startTime);
    if (dto.endTime !== undefined) patch.endTime = new Date(dto.endTime);

    const { setClause, values } = buildUpdateSet(patch, 2, { status: 'meeting_status_enum' });
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
      this.reminderScheduler.scheduleMeetingReminders(saved.id, saved.startTime).catch(() => {});
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
    if (!meeting) throw new NotFoundException({ code: ErrorCode.MEETING_NOT_FOUND, message: 'Meeting not found' });
    if (meeting.status === MeetingStatus.ENDED || meeting.status === MeetingStatus.CANCELLED) {
      throw new ForbiddenException({ code: ErrorCode.MEETING_ENDED, message: 'Meeting is no longer active' });
    }
    await this.membersService.assertMember(meeting.workspaceId, userId);

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
      throw new ConflictException({ code: ErrorCode.MEETING_FULL, message: 'Meeting is at full capacity' });
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

  async leave(meetingId: string, userId: string) {
    const participantRows = await this.dataSource.query(
      `SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meetingId, userId],
    );
    if (!participantRows[0]) throw new NotFoundException({ code: ErrorCode.MEETING_NOT_PARTICIPANT, message: 'You are not in this meeting' });

    await this.dataSource.query(`UPDATE meeting_participants SET left_at = now() WHERE id = $1`, [participantRows[0].id]);

    // If host leaves and meeting is live, end it
    const meeting = await this.findMeeting(meetingId);
    if (meeting && meeting.hostId === userId && meeting.status === MeetingStatus.LIVE) {
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
    if (!meeting) throw new NotFoundException({ code: ErrorCode.MEETING_CODE_INVALID, message: 'Invalid meeting code' });
    return this.join(meeting.id, userId);
  }

  async inviteMembers(meetingId: string, inviterId: string, targetUserIds: string[]) {
    const meeting = await this.findMeeting(meetingId);
    if (!meeting) throw new NotFoundException({ code: ErrorCode.MEETING_NOT_FOUND, message: 'Meeting not found' });

    // Ensure inviter is a member of the workspace
    await this.membersService.assertMember(meeting.workspaceId, inviterId);

    // Server-side guard: never let the inviter invite themself, and
    // de-duplicate. The frontend also filters the host out of the invite
    // list, but that filter must not be the only line of defense — a
    // stale UI, another client, or a direct API call could still send
    // the inviter's own id.
    const targetIds = Array.from(new Set(targetUserIds)).filter((uid) => uid !== inviterId);

    // Filter valid workspace members
    const validMembers = await Promise.all(
      targetIds.map(async (uid) => {
        try {
          await this.membersService.assertMember(meeting.workspaceId, uid);
          return uid;
        } catch {
          return null;
        }
      })
    );
    const validUserIds = validMembers.filter(Boolean) as string[];

    const notifications = validUserIds.map(uid => this.notificationsService.create({
      userId: uid,
      actorId: inviterId,
      type: NotificationType.MEETING_INVITE,
      title: 'Meeting Invitation',
      message: `Sizni "${meeting.title || 'Uchrashuv'}" nomli meetingga taklif qilishdi.`,
      entityType: 'meeting',
      entityId: meeting.id,
      actionUrl: `/app/meetings`,
      metadata: { joinCode: meeting.meetingCode }
    }));

    await Promise.all(notifications);
    return { success: true, invitedCount: validUserIds.length };
  }
}
