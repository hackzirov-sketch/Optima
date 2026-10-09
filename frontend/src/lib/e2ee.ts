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
 *  - Files are encrypted here too, each with its own random AES key; the
 *    key, real name, type and size travel inside the message ciphertext
 *    (envelope v2), and storage only ever holds an opaque blob.
 *
 * History: a member's new device is sent the older room keys that member
 * already had (any of their other member devices — or anyone's — re-wraps
 * them, see shareHistory). Someone who joins later still can't read what was
 * said before they joined.
 */
import { ApiError, apiFetch } from "./api";

export interface E2eeEnvelope {
  /** 1: plaintext is the text. 2: plaintext is JSON `{ t, f }` (text + file secrets). */
  v: 1 | 2;
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
  /** Older keys a member's new device lacks — re-wrapped by shareHistory. */
  missing?: Array<{ epoch: number; userId: string; deviceId: string; publicKey: PublicJwk }>;
}

/** Everything needed to open one encrypted file; lives only inside the encrypted envelope. */
export interface FileSecret {
  /** real file name */
  n: string;
  /** real MIME type */
  m: string;
  /** real size in bytes */
  s: number;
  /** AES-256-GCM key, base64 */
  k: string;
  iv: string;
}

/** An attachment as the composer stages it. `secret` is set for E2EE uploads and is never sent as-is. */
export interface OutgoingAttachment {
  storageKey: string;
  storageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  secret?: FileSecret;
}

/** What the server stores for a file encrypted on the device (mirrors E2EE_ATTACHMENT_MIME). */
export const E2EE_FILE_MIME = "application/vnd.optima.e2ee";

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
      .then((state) => {
        if (state.missing?.length) void shareHistory(roomId, state).catch(() => undefined);
        return state;
      })
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
      // Extractable (in memory only) so it can be re-wrapped for a member's new device.
      keys.set(entry.epoch, await subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]));
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

/** Re-wrap of a given key for a given device is posted once per session. */
const sharedHistory = new Set<string>();

/**
 * Hands older room keys to a member's newly added device. The server lists
 * which (epoch, device) pairs are missing and only accepts keys for members
 * who already had that epoch, so this can't leak history to newcomers.
 */
async function shareHistory(roomId: string, state: RoomState) {
  const device = await getDevice();
  const userId = requireUser();
  const keys = await unwrapKeys(roomId, state);
  const wrapper = `${userId}:${device.deviceId}`;
  const out: Array<{ epoch: number; userId: string; deviceId: string; wrappedKey: string; iv: string }> = [];
  for (const target of state.missing ?? []) {
    const roomKey = keys.get(target.epoch);
    const id = `${roomId}|${target.epoch}|${target.userId}:${target.deviceId}`;
    if (!roomKey || sharedHistory.has(id)) continue;
    sharedHistory.add(id);
    const raw = new Uint8Array(await subtle.exportKey("raw", roomKey));
    const kek = await deriveWrappingKey(device.privateKey, target.publicKey, roomId, target.epoch, wrapper, `${target.userId}:${target.deviceId}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    out.push({ epoch: target.epoch, userId: target.userId, deviceId: target.deviceId, wrappedKey: toB64(await subtle.encrypt({ name: "AES-GCM", iv }, kek, raw)), iv: toB64(iv) });
    raw.fill(0);
  }
  if (out.length) {
    await apiFetch(`/chat/rooms/${roomId}/e2ee/keys/share`, {
      method: "POST",
      body: JSON.stringify({ deviceId: device.deviceId, keys: out }),
    });
  }
}

const MENTION_PATTERN = /(^|[^a-zA-Z0-9_-])@([a-zA-Z0-9_-]{3,50})/g;

/** Same rule as the backend's mention.util — the server can't parse E2EE text itself. */
function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_PATTERN)) {
    seen.add(match[2].toLowerCase());
    if (seen.size >= 10) break;
  }
  return [...seen];
}

// ─── public API ───────────────────────────────────────────

/** Whether a room is end-to-end encrypted (DMs and non-public rooms). */
export async function isRoomE2ee(roomId: string): Promise<boolean> {
  return (await getState(roomId)).enabled;
}

/** Encrypts a file with a fresh key before upload; the secret goes into the message. */
export async function encryptFile(file: Blob, name: string): Promise<{ blob: Blob; secret: FileSecret }> {
  const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, await file.arrayBuffer());
  return {
    blob: new Blob([ct], { type: E2EE_FILE_MIME }),
    secret: {
      n: name,
      m: file.type || "application/octet-stream",
      s: file.size,
      k: toB64(await subtle.exportKey("raw", key)),
      iv: toB64(iv),
    },
  };
}

const openedFiles = new Map<string, Promise<string>>();

/** Downloads and decrypts an encrypted file once per session; resolves to a blob: URL. */
export function openEncryptedFile(url: string, secret: FileSecret): Promise<string> {
  const cacheKey = `${url}#${secret.k}`;
  let pending = openedFiles.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`E2EE file download failed (${response.status})`);
      const key = await subtle.importKey("raw", fromB64(secret.k), "AES-GCM", false, ["decrypt"]);
      const plain = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(secret.iv) }, key, await response.arrayBuffer());
      return URL.createObjectURL(new Blob([plain], { type: secret.m }));
    })();
    pending.catch(() => openedFiles.delete(cacheKey));
    openedFiles.set(cacheKey, pending);
  }
  return pending;
}

export interface OutgoingBody {
  content?: string;
  e2ee?: E2eeEnvelope;
  /** E2EE rooms: @handles from the text, so mention notifications still work. */
  mentions?: string[];
  attachments: Array<Omit<OutgoingAttachment, "secret">>;
}

/**
 * The body to send for `text` (+ staged files) in `roomId`: plaintext for
 * public rooms (the server encrypts at rest), an envelope for E2EE rooms —
 * v2 when files are attached, carrying their keys. Rotates the room key first
 * when the server says the member/device set changed.
 */
export async function prepareOutgoing(roomId: string, text: string, attachments: OutgoingAttachment[] = []): Promise<OutgoingBody> {
  const plainAttachments = attachments.map(({ secret: _secret, ...rest }) => rest);
  let state = await getState(roomId);
  if (!state.enabled) {
    if (attachments.some((item) => item.secret)) throw new Error("E2EE: encrypted file staged for a public room");
    return { content: text, attachments: plainAttachments };
  }
  if (!text && attachments.length === 0) return { attachments: [] };
  if (attachments.some((item) => !item.secret)) throw new Error("E2EE: files in this chat must be encrypted on this device");

  for (let attempt = 0; state.needsRotation && attempt < 3; attempt++) {
    await rotate(roomId, state);
    state = await getState(roomId);
  }
  if (!state.enabled) return { content: text, attachments: plainAttachments };

  const keys = await unwrapKeys(roomId, state);
  const key = keys.get(state.epoch);
  if (!key) throw new Error("E2EE: the current room key is not available on this device");

  const withFiles = attachments.length > 0;
  const plaintext = withFiles ? JSON.stringify({ t: text, f: attachments.map((item) => item.secret) }) : text;
  const device = await getDevice();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: messageAad(roomId, state.epoch, requireUser()) },
    key,
    enc.encode(plaintext),
  );
  return {
    e2ee: { v: withFiles ? 2 : 1, epoch: state.epoch, device: device.deviceId, iv: toB64(iv), ct: toB64(ct) },
    mentions: extractMentions(text),
    attachments: plainAttachments,
  };
}

/**
 * Runs a send built from `prepareOutgoing`, refreshing the room key and
 * re-encrypting when the server rejects the ciphertext as stale.
 */
export async function sendWithE2ee<T>(roomId: string, text: string, send: (body: OutgoingBody) => Promise<T>, attachments: OutgoingAttachment[] = []): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const body = await prepareOutgoing(roomId, text, attachments);
    try {
      return await send(body);
    } catch (error) {
      if (attempt >= 2 || !isRetryableE2eeError(error)) throw error;
      invalidateRoom(roomId);
    }
  }
}

interface OpenedPayload {
  text: string;
  files: FileSecret[];
}

async function openPayload(roomId: string, senderId: string, envelope: E2eeEnvelope): Promise<OpenedPayload | null> {
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
    const plain = dec.decode(await subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(envelope.iv), additionalData: messageAad(roomId, envelope.epoch, senderId) },
      key,
      fromB64(envelope.ct),
    ));
    if (envelope.v !== 2) return { text: plain, files: [] };
    const parsed = JSON.parse(plain) as { t?: unknown; f?: unknown };
    return {
      text: typeof parsed.t === "string" ? parsed.t : "",
      files: Array.isArray(parsed.f) ? (parsed.f as FileSecret[]) : [],
    };
  } catch {
    return null;
  }
}

/** Opens one envelope to its text (a file name for file-only messages); null when this device has no key. */
export async function decryptEnvelope(roomId: string, senderId: string, envelope: E2eeEnvelope): Promise<string | null> {
  const opened = await openPayload(roomId, senderId, envelope);
  if (!opened) return null;
  return opened.text || (opened.files[0] ? `📎 ${opened.files[0].n}` : "");
}

/** Shown in place of a message this device can't open. */
export const UNDECRYPTABLE_TEXT = "🔒 Bu xabarni ushbu qurilmada ochib bo‘lmaydi";

interface StoredAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  width?: number | null;
  height?: number | null;
}

/** An attachment after decryption: real metadata, a blob: URL, and what's needed to forward or edit it. */
export type OpenedAttachment = StoredAttachment & { sourceUrl?: string; storageKey?: string; secret?: FileSecret };

interface MaybeEncrypted {
  roomId: string;
  senderId: string;
  content: string | null;
  e2ee?: E2eeEnvelope | null;
  attachments?: StoredAttachment[];
}

/** Replaces `e2ee` envelopes with plaintext — and encrypted files with their decrypted blob: URLs. */
export async function decryptMessage<T extends MaybeEncrypted>(message: T): Promise<T & { content: string; e2eeFailed?: boolean }> {
  if (!message.e2ee) return { ...message, content: message.content ?? "" };
  const opened = await openPayload(message.roomId, message.senderId, message.e2ee);
  if (!opened) return { ...message, content: UNDECRYPTABLE_TEXT, e2eeFailed: true };
  const attachments = message.attachments
    ? await Promise.all(message.attachments.map(async (attachment, index): Promise<OpenedAttachment> => {
      const secret = opened.files[index];
      if (!secret) return attachment;
      const url = await openEncryptedFile(attachment.url, secret).catch(() => "");
      return { ...attachment, fileName: secret.n, mimeType: secret.m, fileSize: secret.s, url, sourceUrl: attachment.url, secret };
    }))
    : message.attachments;
  return { ...message, content: opened.text, attachments };
}

export function decryptMessages<T extends MaybeEncrypted>(messages: T[]) {
  return Promise.all(messages.map((message) => decryptMessage(message)));
}

/**
 * A code every member can compare out loud or side by side: a hash over all
 * member devices' public keys. If the server slipped in a device (or swapped
 * a key), members see different codes. It changes whenever anyone adds or
 * removes a device.
 */
export async function roomSafetyCode(roomId: string): Promise<string | null> {
  const state = await getState(roomId);
  if (!state.enabled || state.devices.length === 0) return null;
  const material = state.devices
    .map((d) => `${d.userId}|${d.deviceId}|${d.publicKey.x}|${d.publicKey.y}`)
    .sort()
    .join("\n");
  const digest = new Uint8Array(await subtle.digest("SHA-256", enc.encode(`optima-safety-v1\n${roomId}\n${material}`)));
  const groups: string[] = [];
  for (let i = 0; i < 24; i += 2) groups.push(String(((digest[i] << 8) | digest[i + 1]) % 100000).padStart(5, "0"));
  return groups.join(" ");
}
