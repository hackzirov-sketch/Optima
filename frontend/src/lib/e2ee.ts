/**
 * End-to-end encryption for private conversations (Telegram-style split).
 *
 *   1:1 chats, private groups, private channels → E2EE (this module)
 *   public groups / public channels             → server-side encryption at rest
 *
 * The backend decides which rooms are E2EE (`GET /chat/rooms/:id/e2ee`) and
 * only ever sees public keys, wrapped room keys and ciphertext.
 *
 * Keys:
 *  - Each browser is a "device" with an ECDH P-256 key pair. The private key
 *    is generated non-extractable and kept in IndexedDB — JS on the page can
 *    use it but can't read it out, and it never leaves this browser.
 *  - Each E2EE room has a series of random AES-256 room keys ("epochs"). A
 *    member device creates one when the member/device set changes, and wraps
 *    it for every member device with AES-GCM under
 *    HKDF(ECDH(creator device, recipient device)).
 *  - Messages are AES-256-GCM under the current room key, with
 *    `roomId|epoch|senderId` as associated data, so the server can't move a
 *    ciphertext to another room or re-attribute it to another sender.
 *
 * Limits (deliberate, for now): a new device or a new member can only read
 * messages sent after it joined — there is no history transfer. Attachments
 * are not yet encrypted; only message text is.
 */
import { ApiError, apiFetch } from "./api";

export interface E2eeEnvelope {
  v: 1;
  epoch: number;
  device: string;
  iv: string;
  ct: string;
}

interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

interface DeviceRecord {
  deviceId: string;
  privateKey: CryptoKey;
  publicJwk: PublicJwk;
}

interface WrappedKey {
  epoch: number;
  wrappedKey: string;
  iv: string;
  creatorUserId: string | null;
  creatorDeviceId: string;
  creatorPublicKey: PublicJwk | null;
}

/** `enabled: false` = public room; `keys` still opens history from when it was private. */
interface RoomState {
  roomId: string;
  enabled: boolean;
  epoch: number;
  needsRotation: boolean;
  devices: Array<{ userId: string; deviceId: string; publicKey: PublicJwk }>;
  keys: WrappedKey[];
}

/** Error codes on which a send is retried after refreshing the room key. */
const RETRYABLE = new Set(["E2EE_REKEY_REQUIRED", "E2EE_STALE_EPOCH", "E2EE_DEVICE_SET_CHANGED"]);

const DB_NAME = "optima-e2ee";
const STORE = "devices";
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ─── small helpers ────────────────────────────────────────

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomId(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(18))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idbOpen();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.code;
  if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code);
  return undefined;
}

export function isRetryableE2eeError(error: unknown): boolean {
  const code = errorCode(error);
  return !!code && RETRYABLE.has(code);
}

// ─── crypto primitives ────────────────────────────────────

/** KEK for one (creator device → recipient device) pair in one room epoch. */
async function deriveWrappingKey(
  privateKey: CryptoKey,
  peerJwk: PublicJwk,
  roomId: string,
  epoch: number,
  creator: string,
  recipient: string,
): Promise<CryptoKey> {
  const peer = await subtle.importKey("jwk", { ...peerJwk, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const hkdfKey = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode(`optima-e2ee-v1|${roomId}|${epoch}`),
      info: enc.encode(`${creator}->${recipient}`),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function messageAad(roomId: string, epoch: number, senderId: string) {
  return enc.encode(`optima-msg-v1|${roomId}|${epoch}|${senderId}`);
}

// ─── module state ─────────────────────────────────────────

let currentUserId: string | null = null;
let devicePromise: Promise<DeviceRecord> | null = null;
const stateCache = new Map<string, Promise<RoomState>>();
const keyCache = new Map<string, Map<number, CryptoKey>>();

/** Called by AuthProvider whenever the signed-in user changes. */
export function setE2eeUser(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  devicePromise = null;
  stateCache.clear();
  keyCache.clear();
}

function requireUser(): string {
  if (!currentUserId) throw new Error("E2EE: no signed-in user");
  return currentUserId;
}

async function createDevice(userId: string): Promise<DeviceRecord> {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const jwk = (await subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const record: DeviceRecord = {
    deviceId: randomId(),
    privateKey: pair.privateKey,
    publicJwk: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! },
  };
  await idb("readwrite", (store) => store.put(record, userId));
  return record;
}

/** This browser's device for the current user — created and registered on first use. */
function getDevice(): Promise<DeviceRecord> {
  const userId = requireUser();
  if (!devicePromise) {
    devicePromise = (async () => {
      let record = await idb<DeviceRecord | undefined>("readonly", (store) => store.get(userId)).catch(() => undefined);
      if (!record) record = await createDevice(userId);
      try {
        await apiFetch("/chat/e2ee/devices", {
          method: "PUT",
          body: JSON.stringify({ deviceId: record.deviceId, publicKey: record.publicJwk }),
        });
      } catch (error) {
        // The id is bound to a different key server-side (e.g. storage was
        // partially restored): start over as a fresh device.
        if (errorCode(error) !== "E2EE_DEVICE_KEY_MISMATCH") throw error;
        record = await createDevice(userId);
        await apiFetch("/chat/e2ee/devices", {
          method: "PUT",
          body: JSON.stringify({ deviceId: record.deviceId, publicKey: record.publicJwk }),
        });
      }
      return record;
    })().catch((error) => {
      devicePromise = null;
      throw error;
    });
  }
  return devicePromise;
}

function getState(roomId: string): Promise<RoomState> {
  let pending = stateCache.get(roomId);
  if (!pending) {
    pending = getDevice()
      .then((device) => apiFetch<RoomState>(`/chat/rooms/${roomId}/e2ee?deviceId=${encodeURIComponent(device.deviceId)}`))
      .catch((error) => {
        stateCache.delete(roomId);
        throw error;
      });
    stateCache.set(roomId, pending);
  }
  return pending;
}

/** Forget cached key state — on `room_key_rotated`, membership changes, or a rejected send. */
export function invalidateRoom(roomId: string) {
  stateCache.delete(roomId);
}

async function unwrapKeys(roomId: string, state: RoomState) {
  const device = await getDevice();
  const userId = requireUser();
  const keys = keyCache.get(roomId) ?? new Map<number, CryptoKey>();
  keyCache.set(roomId, keys);
  for (const entry of state.keys) {
    if (keys.has(entry.epoch) || !entry.creatorPublicKey || !entry.creatorUserId) continue;
    try {
      const kek = await deriveWrappingKey(
        device.privateKey,
        entry.creatorPublicKey,
        roomId,
        entry.epoch,
        `${entry.creatorUserId}:${entry.creatorDeviceId}`,
        `${userId}:${device.deviceId}`,
      );
      const raw = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(entry.iv) }, kek, fromB64(entry.wrappedKey));
      keys.set(entry.epoch, await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    } catch {
      // A key we can't open (tampered, or wrapped for a key we no longer
      // hold) just leaves that epoch unreadable — never fatal.
    }
  }
  return keys;
}

/** Generates the next room key and wraps it for every active member device. */
async function rotate(roomId: string, state: RoomState) {
  const device = await getDevice();
  const userId = requireUser();
  const epoch = state.epoch + 1;
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const creator = `${userId}:${device.deviceId}`;
  const keys = await Promise.all(state.devices.map(async (target) => {
    const kek = await deriveWrappingKey(device.privateKey, target.publicKey, roomId, epoch, creator, `${target.userId}:${target.deviceId}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
    return { userId: target.userId, deviceId: target.deviceId, wrappedKey: toB64(wrapped), iv: toB64(iv) };
  }));
  try {
    await apiFetch(`/chat/rooms/${roomId}/e2ee/epochs`, {
      method: "POST",
      body: JSON.stringify({ deviceId: device.deviceId, epoch, keys }),
    });
  } catch (error) {
    // Someone else rotated first, or the device set moved under us — the
    // caller refetches and either uses their key or tries again.
    if (!isRetryableE2eeError(error)) throw error;
  } finally {
    raw.fill(0);
    invalidateRoom(roomId);
  }
}

// ─── public API ───────────────────────────────────────────

/** Whether a room is end-to-end encrypted (DMs and non-public rooms). */
export async function isRoomE2ee(roomId: string): Promise<boolean> {
  return (await getState(roomId)).enabled;
}

/**
 * The body to send for `text` in `roomId`: `{ content }` for public rooms
 * (the server encrypts at rest), `{ e2ee }` for E2EE rooms. Rotates the room
 * key first when the server says the member/device set changed.
 */
export async function prepareOutgoing(roomId: string, text: string): Promise<{ content?: string; e2ee?: E2eeEnvelope }> {
  let state = await getState(roomId);
  if (!state.enabled) return { content: text };
  if (!text) return {};

  for (let attempt = 0; state.needsRotation && attempt < 3; attempt++) {
    await rotate(roomId, state);
    state = await getState(roomId);
  }
  if (!state.enabled) return { content: text };

  const keys = await unwrapKeys(roomId, state);
  const key = keys.get(state.epoch);
  if (!key) throw new Error("E2EE: the current room key is not available on this device");

  const device = await getDevice();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: messageAad(roomId, state.epoch, requireUser()) },
    key,
    enc.encode(text),
  );
  return { e2ee: { v: 1, epoch: state.epoch, device: device.deviceId, iv: toB64(iv), ct: toB64(ct) } };
}

/**
 * Runs a send built from `prepareOutgoing`, refreshing the room key and
 * re-encrypting when the server rejects the ciphertext as stale.
 */
export async function sendWithE2ee<T>(roomId: string, text: string, send: (body: { content?: string; e2ee?: E2eeEnvelope }) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const body = await prepareOutgoing(roomId, text);
    try {
      return await send(body);
    } catch (error) {
      if (attempt >= 2 || !isRetryableE2eeError(error)) throw error;
      invalidateRoom(roomId);
    }
  }
}

/** Opens one envelope; null when this device has no key for it. */
export async function decryptEnvelope(roomId: string, senderId: string, envelope: E2eeEnvelope): Promise<string | null> {
  try {
    const state = await getState(roomId);
    let keys = await unwrapKeys(roomId, state);
    if (!keys.has(envelope.epoch) && envelope.epoch > state.epoch) {
      // Newer than our cached state: someone rotated since we last looked.
      invalidateRoom(roomId);
      keys = await unwrapKeys(roomId, await getState(roomId));
    }
    const key = keys.get(envelope.epoch);
    if (!key) return null;
    const plain = await subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(envelope.iv), additionalData: messageAad(roomId, envelope.epoch, senderId) },
      key,
      fromB64(envelope.ct),
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}

/** Shown in place of a message this device can't open. */
export const UNDECRYPTABLE_TEXT = "🔒 Bu xabarni ushbu qurilmada ochib bo‘lmaydi";

interface MaybeEncrypted {
  roomId: string;
  senderId: string;
  content: string | null;
  e2ee?: E2eeEnvelope | null;
}

/** Replaces `e2ee` envelopes with plaintext in-place-shaped copies. */
export async function decryptMessage<T extends MaybeEncrypted>(message: T): Promise<T & { content: string; e2eeFailed?: boolean }> {
  if (!message.e2ee) return { ...message, content: message.content ?? "" };
  const text = await decryptEnvelope(message.roomId, message.senderId, message.e2ee);
  return text === null
    ? { ...message, content: UNDECRYPTABLE_TEXT, e2eeFailed: true }
    : { ...message, content: text };
}

export function decryptMessages<T extends MaybeEncrypted>(messages: T[]) {
  return Promise.all(messages.map((message) => decryptMessage(message)));
}
