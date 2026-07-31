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
  deniedReason?: 'workspace_only' | 'invite_only' | 'locked';
}

export type AccessDecision =
  | { kind: 'host' }
  | { kind: 'participant' }
  | { kind: 'auto' }
  | {
      kind: 'approval';
      joinRequest: { id: string; status: MeetingJoinRequestStatus } | null;
    }
  | { kind: 'denied'; reason: 'workspace_only' | 'invite_only' | 'locked' };

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

    const participantRows = await this.dataSource.query(
      `SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [meeting.id, userId],
    );
    if (participantRows[0]) return { kind: 'participant' };

    // Lock Meeting blocks any NEW join outright, regardless of visibility/join
    // policy/pre-approval — existing participants (caught above) can still
    // reconnect, matching the "host locked the door, but people already
    // inside stay inside" mental model.
    if (meeting.locked) return { kind: 'denied', reason: 'locked' };

    let isWorkspaceMember = false;
    if (meeting.workspaceId) {
      const memberRows = await this.dataSource.query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [meeting.workspaceId, userId],
      );
      isWorkspaceMember = !!memberRows[0];
    }

    const joinReqRows = await this.dataSource.query(
      `SELECT ${JOIN_REQUEST_COLUMNS_SQL} FROM meeting_join_requests WHERE meeting_id = $1 AND user_id = $2`,
      [meeting.id, userId],
    );
    const joinRequest = joinReqRows[0] ?? null;
    const preApproved =
      joinRequest?.status === MeetingJoinRequestStatus.APPROVED;

    switch (meeting.scope) {
      case RoomScope.WORKSPACE_ONLY:
        if (!isWorkspaceMember)
          return { kind: 'denied', reason: 'workspace_only' };
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
        return { kind: 'denied', reason: 'workspace_only' };
    }
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
      case 'approval':
        return {
          isHost: false,
          isParticipant: false,
          canJoin: false,
          canRequest:
            decision.joinRequest?.status !== MeetingJoinRequestStatus.PENDING,
          requestStatus: decision.joinRequest?.status ?? null,
        };
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
    reason: 'workspace_only' | 'invite_only' | 'locked',
  ): string {
    if (reason === 'workspace_only')
      return 'This meeting is available only for workspace members.';
    if (reason === 'locked')
      return 'The host has locked this meeting — no new participants can join right now.';
    return "You don't have access to this meeting.";
  }
}
