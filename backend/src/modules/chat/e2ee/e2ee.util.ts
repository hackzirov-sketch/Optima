/**
 * Which rooms are end-to-end encrypted — the single source of that decision.
 *
 * Telegram-style split:
 *   direct (1:1)                      → E2EE
 *   group / channel, scope <> public  → E2EE
 *   group / channel, scope = public   → server-side encryption at rest
 *
 * Public content is readable by non-members, and the server can always act as
 * a non-member reader, so E2EE could not hide anything from it there. Public
 * rooms therefore keep CHAT_ENCRYPTION_KEY at-rest encryption and no per-user
 * keys are generated for them.
 */
export function isE2eeRoom(room: { type: string; scope: string }): boolean {
  return room.type === 'direct' || room.scope !== 'public';
}

/**
 * Ciphertext of one message as the client produced it. The server stores and
 * relays it verbatim; it has no key that opens it.
 *
 *  - `epoch`  — which room key it was encrypted under (chat_room_key_epochs)
 *  - `device` — the sender's device id, so recipients know whose key signed off
 *  - `iv`/`ct` — AES-256-GCM nonce and ciphertext+tag, base64
 */
export interface E2eeEnvelope {
  v: 1;
  epoch: number;
  device: string;
  iv: string;
  ct: string;
}

/** Client-visible error codes; the frontend retries on the first two. */
export const E2EE_ERRORS = {
  REKEY_REQUIRED: 'E2EE_REKEY_REQUIRED',
  STALE_EPOCH: 'E2EE_STALE_EPOCH',
  DEVICE_SET_CHANGED: 'E2EE_DEVICE_SET_CHANGED',
  REQUIRED: 'E2EE_REQUIRED',
  NOT_ALLOWED: 'E2EE_NOT_ALLOWED',
  UNKNOWN_DEVICE: 'E2EE_UNKNOWN_DEVICE',
  DEVICE_KEY_MISMATCH: 'E2EE_DEVICE_KEY_MISMATCH',
} as const;

/** Upper bound on an envelope's ciphertext (base64). 1500 chars of UTF-8 is at most 6000 bytes. */
export const E2EE_MAX_CIPHERTEXT_LENGTH = 12_000;

/** How many active devices a user may have; registering more retires the least recently seen. */
export const E2EE_MAX_DEVICES_PER_USER = 10;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Shape check + copy of a client envelope. The REST DTO validates too, but
 * socket payloads bypass the global ValidationPipe, and whatever passes here
 * is stored as jsonb verbatim — so only the known fields survive.
 */
export function normalizeEnvelope(raw: unknown): E2eeEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== 1) return null;
  if (!Number.isInteger(e.epoch) || (e.epoch as number) < 1) return null;
  if (typeof e.device !== 'string' || !DEVICE_ID.test(e.device)) return null;
  if (typeof e.iv !== 'string' || e.iv.length > 32 || !BASE64.test(e.iv))
    return null;
  if (
    typeof e.ct !== 'string' ||
    e.ct.length === 0 ||
    e.ct.length > E2EE_MAX_CIPHERTEXT_LENGTH ||
    !BASE64.test(e.ct)
  )
    return null;
  return {
    v: 1,
    epoch: e.epoch as number,
    device: e.device,
    iv: e.iv,
    ct: e.ct,
  };
}
