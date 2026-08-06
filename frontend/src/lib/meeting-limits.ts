/**
 * Mirrors MESH_MAX_PARTICIPANTS in the backend's meetings.constants.ts.
 *
 * Calls are a full mesh: every participant opens a peer connection to every
 * other one and uploads a separate copy of their video to each, so the cost
 * per person grows with the size of the meeting. Browsers give out somewhere
 * around eight.
 *
 * The backend rejects anything larger, so a form that offers more than this
 * produces a validation error the user cannot act on. Kept as a named constant
 * rather than a literal in each form so the two stay findable together — if
 * the backend ever moves to an SFU, this is the other half of that change.
 */
export const MESH_MAX_PARTICIPANTS = 8;

/** Clamp a desired size into what a call can actually carry. */
export function clampParticipants(desired: number): number {
  if (!Number.isFinite(desired)) return MESH_MAX_PARTICIPANTS;
  return Math.max(2, Math.min(Math.round(desired), MESH_MAX_PARTICIPANTS));
}
