import * as crypto from 'crypto';
import { MeetingJoinPolicy } from '../../common/enums/meeting.enum';
import { RoomScope } from '../../common/enums';

export const MEETING_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", host_id AS "hostId", title, description,
  meeting_code AS "meetingCode", status, scope, join_policy AS "joinPolicy", locked,
  start_time AS "startTime", end_time AS "endTime",
  max_participants AS "maxParticipants", is_recurring AS "isRecurring", agenda,
  created_at AS "createdAt", updated_at AS "updatedAt", last_activity_at AS "lastActivityAt"
`;

export const JOIN_REQUEST_COLUMNS_SQL = `
  id, meeting_id AS "meetingId", user_id AS "userId", status,
  requested_at AS "requestedAt", reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
`;

export const PARTICIPANT_COLUMNS_SQL = `
  id, meeting_id AS "meetingId", user_id AS "userId", role, joined_at AS "joinedAt",
  left_at AS "leftAt", is_muted AS "isMuted", camera_enabled AS "cameraEnabled",
  screen_sharing AS "screenSharing", created_at AS "createdAt"
`;

export const RECORDING_COLUMNS_SQL = `
  id, meeting_id AS "meetingId", started_by AS "startedBy", status,
  started_at AS "startedAt", stopped_at AS "stoppedAt", duration_seconds AS "durationSeconds",
  auto_stopped AS "autoStopped", storage_key AS "storageKey", storage_url AS "storageUrl",
  file_size AS "fileSize", created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (n: number) =>
    Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join(
      '',
    );
  return `OPTIMA-${segment(3)}-${segment(4)}`;
}

/**
 * Default join policy when the client doesn't specify one explicitly:
 * PRIVATE meetings default to a waiting room (matches "Request to Join" UX),
 * everything else defaults to instant join.
 */
export function defaultJoinPolicy(scope: RoomScope): MeetingJoinPolicy {
  return scope === RoomScope.PRIVATE
    ? MeetingJoinPolicy.REQUEST_APPROVAL
    : MeetingJoinPolicy.AUTO;
}
