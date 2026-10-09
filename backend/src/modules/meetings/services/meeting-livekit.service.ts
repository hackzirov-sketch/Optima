import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

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
    const rows = await this.dataSource.query<{
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      avatarUrl: string | null;
    }>(
      `SELECT u.first_name AS "firstName", u.last_name AS "lastName",
              u.username, u.avatar_url AS "avatarUrl"
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
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
    });

    return {
      provider: 'livekit',
      url: this.url,
      token: await token.toJwt(),
      room,
    };
  }
}
