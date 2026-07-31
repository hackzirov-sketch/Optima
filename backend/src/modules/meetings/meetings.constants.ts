export const MEETING_RECORDING_QUEUE = 'meeting-recording';
export const MAX_RECORDING_DURATION_SECONDS = 60 * 60; // hard 1-hour cap, enforced server-side regardless of client behavior

export const MEETING_LIFECYCLE_QUEUE = 'meeting-lifecycle';
// Google Meet-style grace window: a brief network drop/reload for the last
// remaining participant shouldn't tear the meeting down. Re-checked at fire
// time by MeetingLifecycleProcessor, not just at schedule time.
export const MEETING_AUTO_END_GRACE_SECONDS = 20;
