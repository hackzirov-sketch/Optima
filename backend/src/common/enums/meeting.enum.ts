export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  /**
   * Room is empty but the link/code is still valid — like Google Meet, an
   * abandoned meeting doesn't kill its own link. The next join reactivates
   * it straight back to LIVE. Only an explicit host "End meeting" transitions
   * to ENDED, and so does the retention sweep once a room has sat INACTIVE
   * longer than MEETING_INACTIVE_RETENTION_DAYS.
   */
  INACTIVE = 'inactive',
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
