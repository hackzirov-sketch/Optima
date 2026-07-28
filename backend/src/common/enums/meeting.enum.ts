export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export enum MeetingParticipantRole {
  HOST = 'host',
  CO_HOST = 'co_host',
  PARTICIPANT = 'participant',
}

/**
 * Orthogonal to RoomScope (visibility = "who can find/see this meeting").
 * JoinPolicy = "what happens once an eligible user tries to join":
 *  - AUTO:              join immediately, no host approval needed
 *  - REQUEST_APPROVAL:  join is held in a meeting_join_requests row until
 *                        the host/co-host accepts or rejects it (waiting room)
 */
export enum MeetingJoinPolicy {
  AUTO = 'auto',
  REQUEST_APPROVAL = 'request_approval',
}

export enum MeetingJoinRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}
