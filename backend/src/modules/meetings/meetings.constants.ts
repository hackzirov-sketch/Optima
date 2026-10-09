export const MEETING_RECORDING_QUEUE = 'meeting-recording';
export const MAX_RECORDING_DURATION_SECONDS = 60 * 60; // hard 1-hour cap, enforced server-side regardless of client behavior

/**
 * The most people one meeting can hold, set by the transport rather than by
 * product preference.
 *
 * Calls are a full mesh: every participant opens a peer connection to every
 * other one and uploads a separate copy of their own video to each
 * (see MeetingRoomPage's `onParticipants` → `sendOffer` fan-out). Cost per
 * participant therefore grows with N, not with the meeting: at eight people
 * each browser maintains seven connections and seven upstreams, which is
 * already several Mbit/s of upload and enough encoding to warm a laptop.
 *
 * The API used to accept up to 500 and default to 100 — roughly fifteen times
 * what the transport can carry. That is worse than a low limit, because the
 * meeting is created, everyone is let in, and it simply stops working. A
 * failure that looks like a bug is more expensive than a limit that says no.
 *
 * Raising this means moving off mesh to an SFU (mediasoup, LiveKit, Janus),
 * where each client sends one upstream and the server fans it out. Until then
 * this is the honest number.
 */
export const MESH_MAX_PARTICIPANTS = 8;

/** Upper bound behind the LiveKit SFU (and what the database allows). */
export const SFU_MAX_PARTICIPANTS = 100;

/** The capacity ceiling for the transport this deployment actually runs. */
export function transportMaxParticipants(): number {
  const sfu = Boolean(
    process.env.LIVEKIT_URL?.trim() &&
      process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim(),
  );
  return sfu ? SFU_MAX_PARTICIPANTS : MESH_MAX_PARTICIPANTS;
}

/**
 * How many people a given meeting may actually hold.
 *
 * A host may ask for fewer than the mesh allows — a four-person standup is a
 * reasonable thing to configure — but never for more, so the two limits
 * combine as a minimum. Rows written before the cap existed still say 100, and
 * this is what keeps them from being honoured; a missing or nonsensical value
 * falls back to the mesh limit rather than to no limit at all, since `>=`
 * against undefined is silently false and would let a meeting grow forever.
 */
export function effectiveCapacity(storedLimit: number | null | undefined) {
  const ceiling = transportMaxParticipants();
  if (typeof storedLimit !== 'number' || !Number.isFinite(storedLimit))
    return ceiling;
  return Math.max(1, Math.min(storedLimit, ceiling));
}

export const MEETING_LIFECYCLE_QUEUE = 'meeting-lifecycle';
// Google Meet-style grace window: a brief network drop/reload for the last
// remaining participant shouldn't tear the meeting down. Re-checked at fire
// time by MeetingLifecycleProcessor, not just at schedule time.
export const MEETING_AUTO_END_GRACE_SECONDS = 20;

// How long a room may sit empty (INACTIVE, link still valid, next join
// reactivates it) before the retention sweep finally marks it ENDED for
// good. Google Meet doesn't keep an abandoned link alive forever either —
// this is the same idea: metadata can sit around cheaply, but nothing here
// keeps a live process, socket, or media resource running for it.
export const MEETING_INACTIVE_RETENTION_DAYS = 30;
// How often the sweep runs. Cheap indexed query (see migration
// 015_meeting_inactive_lifecycle.sql), so hourly is plenty.
export const MEETING_RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
