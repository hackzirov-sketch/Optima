import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import {
  MeetingJoinPolicy,
  MeetingStatus,
} from '../../../common/enums/meeting.enum';
import { RoomScope } from '../../../common/enums';
import { MeetingsService } from '../meetings.service';
import { SFU_MAX_PARTICIPANTS } from '../meetings.constants';

interface RoomRef {
  id: string;
  type: 'direct' | 'group' | 'channel';
  name: string | null;
  role: string | null;
}

export interface RoomVoiceChat {
  meetingId: string;
  code: string;
  hostId: string;
  /** May this user end the chat (room owner/admin, or whoever started it). */
  canEnd: boolean;
  /** Channels are live streams: only admins speak; subscribers listen. */
  canSpeak: boolean;
  participants: Array<{
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  }>;
}

/** An empty video chat stays joinable this long before a new one replaces it. */
const IDLE_MINUTES = 30;

/**
 * Telegram-style video chats for groups and channels: one meeting attached to
 * the room, started and joined from the room itself. Membership of the chat
 * is the access rule — joining pre-approves the member on the meeting, so the
 * meeting's own admission checks (invite-only) do the rest.
 */
@Injectable()
export class RoomVoiceChatService {
  constructor(
    private readonly db: DatabaseService,
    private readonly meetings: MeetingsService,
  ) {}

  private async room(roomId: string, userId: string): Promise<RoomRef> {
    const rows = await this.db.query<RoomRef>(
      `SELECT r.id, r.type, r.name, m.role
         FROM chat_rooms r
         JOIN chat_members m ON m.room_id = r.id AND m.user_id = $2
                            AND m.left_at IS NULL AND m.status = 'active'
        WHERE r.id = $1`,
      [roomId, userId],
    );
    const room = rows[0];
    if (!room)
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat',
      });
    if (room.type === 'direct')
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Direct chats use calls, not video chats',
      });
    return room;
  }

  private isAdmin(room: RoomRef) {
    return ['owner', 'admin', 'moderator'].includes(room.role ?? '');
  }

  private async activeMeeting(roomId: string) {
    const rows = await this.db.query<{
      id: string;
      code: string;
      hostId: string;
    }>(
      `SELECT id, meeting_code AS code, host_id AS "hostId"
         FROM meetings
        WHERE chat_room_id = $1
          AND (status = $2::meeting_status_enum
               OR (status IN ($3::meeting_status_enum, 'scheduled'::meeting_status_enum)
                   AND last_activity_at > now() - make_interval(mins => $4)
                   -- A chat scheduled for later isn't running yet.
                   AND start_time <= now() + interval '1 minute'))
        ORDER BY created_at ASC
        LIMIT 1`,
      [roomId, MeetingStatus.LIVE, MeetingStatus.INACTIVE, IDLE_MINUTES],
    );
    return rows[0] ?? null;
  }

  private async describe(
    meeting: { id: string; code: string; hostId: string },
    room: RoomRef,
    userId: string,
  ): Promise<RoomVoiceChat> {
    const participants = await this.db.query<
      RoomVoiceChat['participants'][number]
    >(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.avatar_url AS "avatarUrl"
         FROM meeting_participants p JOIN users u ON u.id = p.user_id
        WHERE p.meeting_id = $1 AND p.left_at IS NULL
        ORDER BY p.joined_at ASC
        LIMIT 50`,
      [meeting.id],
    );
    const admin = this.isAdmin(room) || meeting.hostId === userId;
    return {
      meetingId: meeting.id,
      code: meeting.code,
      hostId: meeting.hostId,
      canEnd: admin,
      canSpeak: room.type !== 'channel' || admin,
      participants,
    };
  }

  /** The room's live video chat, or null. */
  async get(roomId: string, userId: string) {
    const room = await this.room(roomId, userId);
    const meeting = await this.activeMeeting(roomId);
    return meeting ? this.describe(meeting, room, userId) : null;
  }

  /**
   * Join the room's video chat, starting one if there is none. In a channel
   * only admins can start it (a live stream); in a group any member can.
   */
  async join(roomId: string, userId: string) {
    const room = await this.room(roomId, userId);
    let meeting = await this.activeMeeting(roomId);
    let started = false;
    if (!meeting) {
      if (room.type === 'channel' && !this.isAdmin(room))
        throw new ForbiddenException({
          code: ErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Only channel admins can start a live stream',
        });
      const created = await this.meetings.create(null, userId, {
        title: room.name || 'Video chat',
        startTime: new Date().toISOString(),
        scope: RoomScope.INVITE_ONLY,
        joinPolicy: MeetingJoinPolicy.AUTO,
        maxParticipants: SFU_MAX_PARTICIPANTS,
      } as never);
      const listenOnly = room.type === 'channel';
      await this.db.query(
        `UPDATE meetings
            SET chat_room_id = $2,
                allow_microphone = NOT $3, allow_video = NOT $3, allow_screen_share = NOT $3
          WHERE id = $1`,
        [created.id, roomId, listenOnly],
      );
      // Two members pressing "start" together: the oldest chat wins and the
      // newer one is folded away before anyone joins it.
      meeting = await this.activeMeeting(roomId);
      if (meeting && meeting.id !== created.id) {
        await this.meetings
          .endMeeting(created.id, userId)
          .catch(() => undefined);
      }
      meeting ??= {
        id: created.id,
        code: (created as { code?: string }).code ?? '',
        hostId: userId,
      };
      started = meeting.id === created.id;
    }
    // Admission: the chat member is pre-approved on the invite-only meeting;
    // room admins are co-hosts (in a channel, the ones who may speak).
    await this.db.query(
      `INSERT INTO meeting_join_requests (meeting_id, user_id, status, requested_at, reviewed_by, reviewed_at)
       VALUES ($1, $2, 'approved', now(), $3, now())
       ON CONFLICT (meeting_id, user_id) DO UPDATE SET status = 'approved'`,
      [meeting.id, userId, meeting.hostId],
    );
    if (this.isAdmin(room) && meeting.hostId !== userId) {
      await this.db.query(
        `INSERT INTO meeting_participants (meeting_id, user_id, role, joined_at, left_at)
         VALUES ($1, $2, 'co_host', now(), now())
         ON CONFLICT (meeting_id, user_id) DO UPDATE SET role = 'co_host'`,
        [meeting.id, userId],
      );
    }
    await this.meetings.join(meeting.id, userId);
    return { started, chat: await this.describe(meeting, room, userId) };
  }

  /** The next scheduled (not yet started) video chat of the room, or null. */
  async scheduled(roomId: string, userId: string) {
    const room = await this.room(roomId, userId);
    const rows = await this.db.query<{ meetingId: string; title: string; startTime: Date; hostId: string }>(
      `SELECT id AS "meetingId", title, start_time AS "startTime", host_id AS "hostId"
         FROM meetings
        WHERE chat_room_id = $1 AND status = 'scheduled'::meeting_status_enum
          AND start_time > now() + interval '1 minute'
        ORDER BY start_time ASC LIMIT 1`,
      [roomId],
    );
    const next = rows[0];
    return next ? { ...next, canCancel: this.isAdmin(room) || next.hostId === userId } : null;
  }

  /**
   * Plan a video chat for later. It starts by itself at that time (see
   * MeetingLifecycleProcessor 'start-room-voice-chat'): members are told and
   * the room's banner offers to join. Channel streams: admins only.
   */
  async schedule(roomId: string, userId: string, startTime: Date, title?: string) {
    const room = await this.room(roomId, userId);
    if (room.type === 'channel' ? !this.isAdmin(room) : false)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only channel admins can schedule a live stream',
      });
    const at = startTime.getTime();
    if (!Number.isFinite(at) || at < Date.now() + 60_000 || at > Date.now() + 60 * 86400_000)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Pick a time between one minute and 60 days from now',
      });
    const existing = await this.scheduled(roomId, userId);
    if (existing)
      throw new BadRequestException({
        code: 'VOICE_CHAT_ALREADY_SCHEDULED',
        message: 'A video chat is already scheduled for this chat',
      });
    const created = await this.meetings.create(null, userId, {
      title: (title?.trim() || room.name || 'Video chat').slice(0, 200),
      startTime: startTime.toISOString(),
      scope: RoomScope.INVITE_ONLY,
      joinPolicy: MeetingJoinPolicy.AUTO,
      maxParticipants: SFU_MAX_PARTICIPANTS,
    } as never);
    const listenOnly = room.type === 'channel';
    await this.db.query(
      `UPDATE meetings
          SET chat_room_id = $2, last_activity_at = start_time,
              allow_microphone = NOT $3, allow_video = NOT $3, allow_screen_share = NOT $3
        WHERE id = $1`,
      [created.id, roomId, listenOnly],
    );
    await this.meetings.scheduleRoomVoiceStart(created.id, at - Date.now());
    return this.scheduled(roomId, userId);
  }

  /** Call off a scheduled chat — room admins, or whoever scheduled it. */
  async cancelScheduled(roomId: string, userId: string) {
    const next = await this.scheduled(roomId, userId);
    if (!next)
      throw new NotFoundException({ code: ErrorCode.MEETING_NOT_FOUND, message: 'Nothing is scheduled' });
    if (!next.canCancel)
      throw new ForbiddenException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'Only admins can cancel it' });
    await this.db.query(
      `UPDATE meetings SET status = 'ended'::meeting_status_enum, end_time = now() WHERE id = $1`,
      [next.meetingId],
    );
    return { meetingId: next.meetingId };
  }

  /**
   * Fired at the scheduled time: the chat becomes the room's live one (open
   * to join for the usual idle window). Returns its room, or null if it was
   * cancelled meanwhile.
   */
  async startScheduled(meetingId: string) {
    const rows = await this.db.query<{ roomId: string }>(
      `UPDATE meetings SET last_activity_at = now()
        WHERE id = $1 AND status = 'scheduled'::meeting_status_enum AND chat_room_id IS NOT NULL
        RETURNING chat_room_id AS "roomId"`,
      [meetingId],
    );
    return rows[0]?.roomId ?? null;
  }

  /** End for everyone — room admins, or whoever started it. */
  async end(roomId: string, userId: string) {
    const room = await this.room(roomId, userId);
    const meeting = await this.activeMeeting(roomId);
    if (!meeting)
      throw new NotFoundException({
        code: ErrorCode.MEETING_NOT_FOUND,
        message: 'No video chat is running',
      });
    if (!this.isAdmin(room) && meeting.hostId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only admins can end the video chat',
      });
    // endMeeting checks for the host; room admins act on the host's behalf.
    await this.meetings.endMeeting(meeting.id, meeting.hostId);
    return { meetingId: meeting.id };
  }
}
