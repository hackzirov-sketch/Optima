import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import {
  MeetingJoinPolicy,
  MeetingJoinRequestStatus,
} from '../../../common/enums/meeting.enum';
import { RoomScope } from '../../../common/enums';
import { JOIN_REQUEST_COLUMNS_SQL } from '../meetings.sql';

export interface MeetingAccess {
  isHost: boolean;
  isParticipant: boolean;
  /** True if calling join() right now will succeed immediately. */
  canJoin: boolean;
  /** True if calling requestToJoin() right now makes sense (not already pending). */
  canRequest: boolean;
  requestStatus: MeetingJoinRequestStatus | null;
  /** Seconds until a declined requester may ask again; 0 when they may now. */
  retryAfterSeconds?: number;
  deniedReason?: 'group_only' | 'invite_only' | 'locked';
}

/** Mirrors REJECTED_REQUEST_COOLDOWN_SECONDS in MeetingJoinRequestService. */
const REJECTED_REQUEST_COOLDOWN_SECONDS = 60;

export type AccessDecision =
  | { kind: 'host' }
  | { kind: 'participant' }
  | { kind: 'auto' }
  | {
      kind: 'approval';
      joinRequest: {
        id: string;
        status: MeetingJoinRequestStatus;
        /** When the host decided; drives the post-rejection cooldown. */
        reviewedAt: Date | string | null;
      } | null;
    }
  | { kind: 'denied'; reason: 'group_only' | 'invite_only' | 'locked' };

@Injectable()
export class MeetingAccessService {
  constructor(private readonly dataSource: DatabaseService) {}

  /**
   * Central Meeting Join Policy decision point — used by both getOne() (view
   * access) and join()/requestToJoin() (join access) so the two can never
   * drift out of sync. Visibility (meeting.scope) decides who is even
   * eligible; joinPolicy decides whether an eligible user joins instantly
   * or lands in the waiting room. A meeting_join_requests row with
   * status='approved' (host pre-invite, or a prior approval) always
   * short-circuits straight to instant join.
   */
  async resolveAccess(meeting: any, userId: string): Promise<AccessDecision> {
    if (meeting.hostId === userId) return { kind: 'host' };

    // Only someone *currently* in the meeting counts as a participant. Without
    // `left_at IS NULL` the row survives the person leaving, so anyone who ever
    // joined kept a permanent pass — including past the `locked` check below,
    // which is the one control a host has for "no more people". Rejoining after
    // a drop still works: the row is only closed when the leave is finalised,
    // after the reconnect grace window.
    const participantRows = await this.dataSource.query(
      `SELECT id FROM meeting_participants
       WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [meeting.id, userId],
    );
    if (participantRows[0]) return { kind: 'participant' };

    // Lock Meeting blocks any NEW join outright, regardless of visibility/join
    // policy/pre-approval — existing participants (caught above) can still
    // reconnect, matching the "host locked the door, but people already
    // inside stay inside" mental model.
    if (meeting.locked) return { kind: 'denied', reason: 'locked' };

    let isGroupMember = false;
    if (meeting.groupId) {
      const memberRows = await this.dataSource.query(
        `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [meeting.groupId, userId],
      );
      isGroupMember = !!memberRows[0];
    }

    const joinReqRows = await this.dataSource.query(
      `SELECT ${JOIN_REQUEST_COLUMNS_SQL} FROM meeting_join_requests WHERE meeting_id = $1 AND user_id = $2`,
      [meeting.id, userId],
    );
    const joinRequest = joinReqRows[0] ?? null;
    const preApproved =
      joinRequest?.status === MeetingJoinRequestStatus.APPROVED;

    switch (meeting.scope) {
      case RoomScope.GROUP_ONLY:
        if (!isGroupMember)
          return { kind: 'denied', reason: 'group_only' };
        if (preApproved || meeting.joinPolicy === MeetingJoinPolicy.AUTO)
          return { kind: 'auto' };
        return { kind: 'approval', joinRequest };

      case RoomScope.PUBLIC:
        if (preApproved || meeting.joinPolicy === MeetingJoinPolicy.AUTO)
          return { kind: 'auto' };
        return { kind: 'approval', joinRequest };

      case RoomScope.PRIVATE:
        // PRIVATE always behaves as REQUEST_APPROVAL for non-invited users,
        // regardless of joinPolicy — "Request to Join" is the whole point.
        if (preApproved) return { kind: 'auto' };
        return { kind: 'approval', joinRequest };

      case RoomScope.INVITE_ONLY:
        // No request fallback — either you were pre-approved (invited) or you're out.
        if (preApproved) return { kind: 'auto' };
        return { kind: 'denied', reason: 'invite_only' };

      default:
        return { kind: 'denied', reason: 'group_only' };
    }
  }

  /** Seconds left before a declined requester may ask again; 0 if they may now. */
  rejectionCooldownRemaining(reviewedAt: Date | string | null): number {
    if (!reviewedAt) return 0;
    const elapsedMs = Date.now() - new Date(reviewedAt).getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
    const remainingMs = REJECTED_REQUEST_COOLDOWN_SECONDS * 1000 - elapsedMs;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  describeAccess(decision: AccessDecision): MeetingAccess {
    switch (decision.kind) {
      case 'host':
        return {
          isHost: true,
          isParticipant: true,
          canJoin: true,
          canRequest: false,
          requestStatus: null,
        };
      case 'participant':
        return {
          isHost: false,
          isParticipant: true,
          canJoin: true,
          canRequest: false,
          requestStatus: null,
        };
      case 'auto':
        return {
          isHost: false,
          isParticipant: false,
          canJoin: true,
          canRequest: false,
          requestStatus: null,
        };
      case 'approval': {
        // The client renders "Request to Join" off canRequest, so it has to
        // agree with what requestToJoin will actually accept — including the
        // cooldown a declined request now carries, which is reported here so
        // the button can show the wait instead of failing on click.
        const retryAfterSeconds =
          decision.joinRequest?.status === MeetingJoinRequestStatus.REJECTED
            ? this.rejectionCooldownRemaining(decision.joinRequest.reviewedAt)
            : 0;
        return {
          isHost: false,
          isParticipant: false,
          canJoin: false,
          canRequest:
            decision.joinRequest?.status !== MeetingJoinRequestStatus.PENDING &&
            retryAfterSeconds === 0,
          requestStatus: decision.joinRequest?.status ?? null,
          retryAfterSeconds,
        };
      }
      case 'denied':
        return {
          isHost: false,
          isParticipant: false,
          canJoin: false,
          canRequest: false,
          requestStatus: null,
          deniedReason: decision.reason,
        };
    }
  }

  accessDeniedMessage(
    reason: 'group_only' | 'invite_only' | 'locked',
  ): string {
    if (reason === 'group_only')
      return 'This meeting is available only for group members.';
    if (reason === 'locked')
      return 'The host has locked this meeting — no new participants can join right now.';
    return "You don't have access to this meeting.";
  }
}
