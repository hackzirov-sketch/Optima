import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';

import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

interface MeetingPermissions {
  allowScreenShare: boolean;
  allowReactions: boolean;
  allowMicrophone: boolean;
  allowVideo: boolean;
  allowChat: boolean;
}

/**
 * What a participant may publish, from the meeting's host controls. Hosts and
 * co-hosts are never restricted. Reactions travel over the socket, so they
 * are not a LiveKit concern; chat uses LiveKit data, so allowChat maps to
 * canPublishData.
 */
function publishGrants(permissions: MeetingPermissions, moderator: boolean) {
  const sources: TrackSource[] = [];
  if (moderator || permissions.allowMicrophone)
    sources.push(TrackSource.MICROPHONE);
  if (moderator || permissions.allowVideo) sources.push(TrackSource.CAMERA);
  if (moderator || permissions.allowScreenShare)
    sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  return {
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: moderator || permissions.allowChat,
    canSubscribe: true,
  };
}

export type MeetingMediaSession =
  | { provider: 'livekit'; url: string; token: string; room: string }
  | { provider: 'p2p' };

/**
 * Media for meetings through a LiveKit SFU instead of a browser-to-browser
 * mesh.
 *
 * Mesh WebRTC is fine on one network and falls apart across countries: every
 * participant uploads a full-quality copy to every other participant, nothing
 * adapts to a slow link, and two people behind carrier-grade NAT (most mobile
 * networks) only connect at all through a TURN relay. LiveKit takes one
 * upload per participant, sends each viewer the simulcast layer their link can
 * carry, and has TURN (UDP and TLS/443) built in.
 *
 * NestJS still owns who may be in a meeting — the waiting room, locks and
 * capacity all run in MeetingsService.join over the socket as before. This
 * only issues a short-lived token for a participant who is already in, scoped
 * to that meeting's room. When LIVEKIT_* is not configured the client keeps
 * using the peer-to-peer path.
 */
@Injectable()
export class MeetingLiveKitService {
  private readonly logger = new Logger(MeetingLiveKitService.name);
  private readonly url = process.env.LIVEKIT_URL?.trim() || '';
  private readonly apiKey = process.env.LIVEKIT_API_KEY?.trim() || '';
  private readonly apiSecret = process.env.LIVEKIT_API_SECRET?.trim() || '';
  private rooms: RoomServiceClient | null = null;

  constructor(private readonly dataSource: DatabaseService) {
    if (this.isEnabled()) {
      this.logger.log(`Meeting media via LiveKit at ${this.url}`);
    } else {
      this.logger.warn(
        'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — meetings use peer-to-peer WebRTC',
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.url && this.apiKey && this.apiSecret);
  }

  static roomName(meetingId: string) {
    return `meeting-${meetingId}`;
  }

  async createSession(
    meetingId: string,
    userId: string,
  ): Promise<MeetingMediaSession> {
    if (!this.isEnabled()) return { provider: 'p2p' };

    // In the meeting right now: the socket join (with every admission rule)
    // has already happened. A token is never the way in.
    const rows = await this.dataSource.query<
      {
        firstName: string | null;
        lastName: string | null;
        username: string | null;
        avatarUrl: string | null;
        moderator: boolean;
      } & MeetingPermissions
    >(
      `SELECT u.first_name AS "firstName", u.last_name AS "lastName",
              u.username, u.avatar_url AS "avatarUrl",
              (m.host_id = $2 OR p.role IN ('host', 'co_host')) AS "moderator",
              m.allow_screen_share AS "allowScreenShare", m.allow_reactions AS "allowReactions",
              m.allow_microphone AS "allowMicrophone", m.allow_video AS "allowVideo",
              m.allow_chat AS "allowChat"
         FROM meetings m
         JOIN users u ON u.id = $2
         LEFT JOIN meeting_participants p
           ON p.meeting_id = m.id AND p.user_id = $2 AND p.left_at IS NULL
        WHERE m.id = $1
          AND m.status NOT IN ('ended', 'cancelled')
          AND (m.host_id = $2 OR p.id IS NOT NULL)`,
      [meetingId, userId],
    );
    const profile = rows[0];
    if (!profile) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'Join the meeting before connecting to its media',
      });
    }

    const room = MeetingLiveKitService.roomName(meetingId);
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      // The user id, so the client maps LiveKit participants straight onto
      // the meeting roster it already keeps.
      identity: userId,
      name:
        [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
        profile.username ||
        undefined,
      // Only has to be valid to connect; an established session outlives it.
      ttl: '10m',
    });
    token.addGrant({
      room,
      roomJoin: true,
      ...publishGrants(profile, Boolean(profile.moderator)),
    });

    return {
      provider: 'livekit',
      url: this.url,
      token: await token.toJwt(),
      room,
    };
  }

  /**
   * Re-applies host controls to everyone already in the LiveKit room, so a
   * change takes effect mid-call: LiveKit unpublishes tracks a participant is
   * no longer allowed to send. Best-effort — the socket-side gates still hold
   * if the SFU can't be reached.
   */
  /**
   * Ends the SFU room with the meeting: LiveKit disconnects everyone still in
   * it. Without this, a client that missed (or ignored) `meeting:ended` kept
   * sending and receiving media for as long as its token lasted.
   * Best-effort — an already-empty room is simply not found.
   */
  async closeRoom(meetingId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      this.rooms ??= new RoomServiceClient(
        this.url.replace(/^ws/, 'http'),
        this.apiKey,
        this.apiSecret,
      );
      await this.rooms.deleteRoom(MeetingLiveKitService.roomName(meetingId));
    } catch (err) {
      this.logger.debug(
        `LiveKit room for ${meetingId} not closed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Is this person still connected to the meeting's media room? A phone that
   * puts the browser in the background often loses the signalling socket
   * while LiveKit keeps the call (they still hear everyone). null = unknown
   * (LiveKit off or unreachable).
   */
  async isInRoom(meetingId: string, userId: string): Promise<boolean | null> {
    if (!this.isEnabled()) return null;
    try {
      this.rooms ??= new RoomServiceClient(
        this.url.replace(/^ws/, 'http'),
        this.apiKey,
        this.apiSecret,
      );
      const participants = await this.rooms.listParticipants(MeetingLiveKitService.roomName(meetingId));
      return participants.some((participant) => participant.identity === userId);
    } catch (err) {
      this.logger.debug(`LiveKit presence check for ${meetingId} failed: ${(err as Error).message}`);
      return null;
    }
  }

  async applyPermissions(meetingId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      this.rooms ??= new RoomServiceClient(
        this.url.replace(/^ws/, 'http'),
        this.apiKey,
        this.apiSecret,
      );
      const room = MeetingLiveKitService.roomName(meetingId);
      const [meeting] = await this.dataSource.query<
        MeetingPermissions & { hostId: string }
      >(
        `SELECT host_id AS "hostId",
                allow_screen_share AS "allowScreenShare", allow_reactions AS "allowReactions",
                allow_microphone AS "allowMicrophone", allow_video AS "allowVideo",
                allow_chat AS "allowChat"
           FROM meetings WHERE id = $1`,
        [meetingId],
      );
      if (!meeting) return;
      const moderators = new Set(
        (
          await this.dataSource.query<{ userId: string }>(
            `SELECT user_id AS "userId" FROM meeting_participants
              WHERE meeting_id = $1 AND left_at IS NULL AND role IN ('host', 'co_host')`,
            [meetingId],
          )
        ).map((row) => row.userId),
      );
      moderators.add(meeting.hostId);
      const participants = await this.rooms.listParticipants(room);
      await Promise.all(
        participants
          .filter((participant) => !moderators.has(participant.identity))
          .map((participant) =>
            this.rooms!.updateParticipant(
              room,
              participant.identity,
              undefined,
              publishGrants(meeting, false),
            ),
          ),
      );
    } catch (err) {
      this.logger.warn(
        `Could not apply host controls in LiveKit for ${meetingId}: ${(err as Error).message}`,
      );
    }
  }
}
