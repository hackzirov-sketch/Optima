import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { MeetingAccess } from '../services/meeting-access.service';
import { MEETING_COLUMNS_SQL, PARTICIPANT_COLUMNS_SQL } from '../meetings.sql';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class MeetingsRepository {
  constructor(private readonly dataSource: DatabaseService) {}

  async findMeeting(meetingId: string): Promise<any | null> {
    const rows = await this.dataSource.query(
      `SELECT ${MEETING_COLUMNS_SQL} FROM meetings WHERE id = $1`,
      [meetingId],
    );
    return rows[0] ?? null;
  }

  async findMeetingWithHost(meetingId: string): Promise<any | null> {
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

  async findParticipants(meetingId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT ${PARTICIPANT_COLUMNS_SQL} FROM meeting_participants WHERE meeting_id = $1`,
      [meetingId],
    );
  }

  async findMeetingIdByCode(code: string): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT id FROM meetings WHERE meeting_code = $1`,
      [code.toUpperCase()],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.MEETING_CODE_INVALID,
        message: 'Invalid meeting code',
      });
    return rows[0].id;
  }

  enrichMeeting(meeting: any, participants: any[], access?: MeetingAccess) {
    return {
      id: meeting.id,
      workspaceId: meeting.workspaceId,
      hostId: meeting.hostId,
      host: meeting.host ?? null,
      title: meeting.title,
      description: meeting.description ?? null,
      code: meeting.meetingCode,
      status: meeting.status,
      scope: meeting.scope,
      joinPolicy: meeting.joinPolicy,
      locked: meeting.locked ?? false,
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
      ...(access ? { access } : {}),
    };
  }
}
