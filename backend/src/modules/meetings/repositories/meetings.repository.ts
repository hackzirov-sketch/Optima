import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { MeetingAccess } from '../services/meeting-access.service';
import { MEETING_COLUMNS_SQL, PARTICIPANT_COLUMNS_SQL } from '../meetings.sql';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class MeetingsRepository {
  constructor(private readonly dataSource: DatabaseService) {}

  async findMeeting(meetingId: string): Promise<any> {
    const rows = await this.dataSource.query(
      `SELECT ${MEETING_COLUMNS_SQL} FROM meetings WHERE id = $1`,
      [meetingId],
    );
    return rows[0] ?? null;
  }

  async findMeetingWithHost(meetingId: string): Promise<any> {
    const rows = await this.dataSource.query<any>(
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

  /**
   * Participants with the identity needed to render them.
   *
   * The profile is joined in here rather than left to the client, because the
   * client had no way to find it: it was resolving names against the *
   * workspace* member list, so anyone in a standalone meeting — or any guest
   * who doesn't share a workspace with the viewer — rendered as the generic
   * "Qatnashchi" fallback with a matching placeholder avatar. Being in the
   * meeting is the relationship that matters here, not sharing an
   * organisation.
   */
  async findParticipants(meetingId: string): Promise<any[]> {
    // The column list is selected in a subquery before the join, exactly as
    // findMeetingWithHost does. PARTICIPANT_COLUMNS_SQL names `id` and
    // `created_at` unqualified — harmless on its own, ambiguous the moment a
    // table with the same column names is joined alongside it, which is what
    // "column reference id is ambiguous" was. Aliasing here rather than
    // qualifying the shared constant keeps it usable from the plain
    // `SELECT ... FROM meeting_participants` call sites too.
    const rows = await this.dataSource.query<any>(
      `SELECT p.*,
              u.first_name AS "u_firstName", u.last_name AS "u_lastName",
              u.username AS "u_username", u.avatar_url AS "u_avatarUrl"
         FROM (SELECT ${PARTICIPANT_COLUMNS_SQL}
                 FROM meeting_participants WHERE meeting_id = $1) p
         LEFT JOIN users u ON u.id = p."userId"`,
      [meetingId],
    );
    return rows.map((row) => {
      const {
        u_firstName,
        u_lastName,
        u_username,
        u_avatarUrl,
        ...participant
      } = row;
      return {
        ...participant,
        user: {
          id: participant.userId,
          firstName: u_firstName ?? null,
          lastName: u_lastName ?? null,
          username: u_username ?? null,
          avatarUrl: u_avatarUrl ?? null,
        },
      };
    });
  }

  /** The same identity shape, for a set of user ids (socket payloads). */
  async findUserProfiles(userIds: string[]): Promise<any[]> {
    if (!userIds.length) return [];
    return this.dataSource.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName",
              username, avatar_url AS "avatarUrl"
         FROM users WHERE id = ANY($1::uuid[])`,
      [userIds],
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
        // Who they are, so the client can label the tile without guessing.
        user: p.user ?? null,
      })),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
      ...(access ? { access } : {}),
    };
  }
}
