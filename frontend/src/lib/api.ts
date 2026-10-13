import type {
  AuditEntry,
  AuthResult,
  ChannelSettings,
  ChatMessage,
  ChatRoom,
  GlobalSearchResult,
  Meeting,
  MeetingJoinRequest,
  MeetingRecording,
  Note,
  NotificationItem,
  RoomInvite,
  RoomRole,
  User,
  UserChatSettings,
  Group,
  GroupMember,
} from "../types";
import { session } from "./session";

export interface RoomVoiceChat {
  meetingId: string;
  code: string;
  hostId: string;
  canEnd: boolean;
  canSpeak: boolean;
  participants: Array<{ id: string; firstName: string; lastName: string; avatarUrl: string | null }>;
}
export interface LibraryBook {
  key: string;
  id: string;
  title: string;
  authors: string[];
  languages: string[];
  year: string | null;
  downloads: number;
  description: string;
  cover: string;
  embedUrl: string | null;
  textUrl: string | null;
  sourceUrl: string;
  source: "openlibrary" | "gutenberg";
  readable: boolean;
}
export interface LibraryReviews {
  count: number;
  average: number | null;
  likes?: number;
  liked?: boolean;
  saved?: boolean;
  items: Array<{ id: string; rating: number; body: string; createdAt: string; updatedAt: string; mine: boolean; author: { id: string; firstName: string; lastName: string; username: string | null; avatarUrl: string | null } }>;
}
export interface AdminOverview {
  onlineNow: number;
  users: { total: number; blocked: number; newToday: number; activeToday: number };
  rooms: { groups: number; channels: number; direct: number; blocked: number };
  meetings: { live: number; inCalls: number };
  requests: { chat: number; meeting: number };
  ai: { messagesToday: number };
}
export interface AdminUser { id: string; firstName: string; lastName: string; username: string | null; email: string; avatarUrl: string | null; createdAt: string; lastSeen: string | null; isActive: boolean; blockedAt: string | null; blockedReason: string | null; online: boolean; superAdmin: boolean }
export interface AdminRoom { id: string; name: string | null; type: "group" | "channel"; scope: string; slug: string | null; avatarUrl: string | null; createdAt: string; blockedAt: string | null; blockedReason: string | null; lastMessageAt: string | null; memberCount: number; pendingRequests: number; ownerFirstName: string | null; ownerLastName: string | null; ownerUsername: string | null }
export interface AdminChatRequest { id: string; createdAt: string; roomId: string; roomName: string | null; roomType: string; userId: string; firstName: string; lastName: string; username: string | null }
export interface AdminMeetingRequest { id: string; createdAt: string; meetingId: string; meetingTitle: string; code: string; userId: string; firstName: string; lastName: string; username: string | null }
export interface AdminMeeting { id: string; title: string; code: string; scope: string; startTime: string; chatRoomId: string | null; hostFirstName: string; hostLastName: string; participants: number }
export interface AdminAuditEntry { id: string; action: string; targetType: string; targetId: string | null; details: Record<string, string>; createdAt: string; actorFirstName: string | null; actorLastName: string | null; targetName: string | null }

export interface AiReplyResult { reply: string; provider: "gemini" | "groq"; grounded: boolean; sources: Array<{ title: string; url: string }> }

/** The watch page's description card. */
export interface YoutubeDetails {
  description: string;
  tags: string[];
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  channel: { id: string; title: string; handle: string | null; avatarUrl: string | null; subscribers: number | null } | null;
}
export interface YoutubeVideo {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string | null;
  durationSeconds: number;
  views: number | null;
}
import { envUrl } from "./env-url";
import { deviceId } from "./device";
import { decryptEnvelope, decryptMessage, decryptMessages, encryptFile, isRoomE2ee, sendWithE2ee, UNDECRYPTABLE_TEXT, type E2eeEnvelope, type OutgoingAttachment } from "./e2ee";

const API_URL = envUrl(import.meta.env.VITE_API_URL) || "/api/v1";
export type OAuthProvider = "google";

export interface ChatDraftRecord {
  roomId: string;
  content: string | null;
  e2ee: E2eeEnvelope | null;
  updatedAt: string | null;
  clientId?: string | null;
}

/** A YouTube video or library book under our own slug, with live counts. */
export interface MediaPage {
  slug: string;
  provider: "youtube" | "library";
  externalId: string;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  meta: { youtubeViews?: number; book?: LibraryBook };
  views: number;
  likes: number;
  liked: boolean;
  myViews: number;
  /** Books: where I stopped reading (position is a 0..1 fraction of the text). */
  progress: ReadingProgress | null;
}

export interface ReadingProgress { position: number; page: number; totalPages: number; updatedAt?: string }

/**
 * Sent on every request. The backend's CsrfGuard requires it on any
 * state-changing request that carries the session cookie: a cross-site form
 * cannot set a custom header, and a cross-site fetch that tries is stopped by
 * the CORS preflight first. The value is not a secret and doesn't need to be —
 * the protection is that the header exists at all. Both call sites below add
 * it, so keep them in sync if a third one ever appears.
 */
const CLIENT_HEADER = "X-UPZ-Client";
const CLIENT_HEADER_VALUE = "web";

export function oauthStartUrl(provider: OAuthProvider): string {
  return `${API_URL}/auth/${provider}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface ApiOptions extends RequestInit {
  anonymous?: boolean;
  retry?: boolean;
}

let refreshPromise: Promise<RefreshResult> | null = null;

function errorMessage(body: unknown, fallback: string): { message: string; code?: string } {
  if (!body || typeof body !== "object") return { message: fallback };
  const value = body as Record<string, unknown>;
  // AllExceptionsFilter wraps every error as {success:false, error:{code, message}} —
  // that's the shape every backend response actually has. Fall back to reading
  // the top level directly in case something ever forwards a bare exception body.
  const container =
    value.error && typeof value.error === "object" ? (value.error as Record<string, unknown>) : value;
  const nested = typeof container.message === "object" ? (container.message as Record<string, unknown>) : null;
  const message =
    (typeof container.message === "string" && container.message) ||
    (typeof nested?.message === "string" && nested.message) ||
    (Array.isArray(container.message) && container.message.join(". ")) ||
    fallback;
  const code =
    (typeof container.code === "string" && container.code) ||
    (typeof nested?.code === "string" && nested.code) ||
    undefined;
  return { message, code };
}

/** Every backend response is wrapped in `{success, data}` by the global
 * NestJS response interceptor. `apiFetch` unwraps this automatically, but a
 * couple of call sites talk to `fetch()` directly (see `renewSession` below)
 * and must unwrap it themselves — skipping this silently saves the wrapper
 * object's `undefined` fields (e.g. `accessToken`) instead of the real
 * token pair, which corrupts the session on every refresh. */
function unwrapEnvelope<T>(body: unknown): T {
  if (body && typeof body === "object" && "success" in body && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

interface RefreshResult {
  ok: boolean;
  /** True when we couldn't even reach the server (offline, waking from
   * sleep before the network is back, DNS hiccup, etc). Distinguishing this
   * from a real auth rejection matters: a device that was idle/asleep and
   * hasn't reconnected to the network yet must NOT be treated as having an
   * invalid session — only an explicit rejection from the server means the
   * tokens are actually dead. */
  networkError: boolean;
}

/** Tokens live in httpOnly cookies now — the browser sends/receives them
 * automatically via `credentials: "include"`, so there's no token for this
 * function to read, compare, or store; it only needs to know whether the
 * rotation succeeded. */
async function renewSession(): Promise<RefreshResult> {
  if (!session.isActive()) return { ok: false, networkError: false };
  let response: Response;
  try {
    // No body: the refresh token is an httpOnly cookie, and JwtRefreshStrategy
    // reads it from there. `credentials: "include"` is what carries it.
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", [CLIENT_HEADER]: CLIENT_HEADER_VALUE, "X-Device-Id": deviceId() },
      body: "{}",
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[auth] POST /auth/refresh threw:", error);
    return { ok: false, networkError: true };
  }
  if (response.ok) {
    // The rotated pair arrives as Set-Cookie; the body carries no tokens.
    session.markActive();
    // The open socket still runs on the old token — lib/socketAuth.ts moves it over.
    window.dispatchEvent(new Event("optima:session-refreshed"));
    return { ok: true, networkError: false };
  }

  // Losing a concurrent-refresh race (another tab's request rotated the
  // cookie a beat before ours landed) surfaces as a benign 401 here — the
  // server intentionally distinguishes this from real token theft. Give the
  // winner a brief moment to finish, then retry once before giving up.
  const body = await response.text().catch(() => "");
  // eslint-disable-next-line no-console
  console.warn(`[auth] POST /auth/refresh -> ${response.status}: ${body}`);
  return { ok: false, networkError: false };
}

/** Exported so callers (e.g. auth.tsx's periodic/visibility-triggered refresh)
 * can proactively renew, sharing the same in-flight dedup as apiFetch's 401 retry. */
export async function refreshSession(): Promise<RefreshResult> {
  refreshPromise ??= renewSession().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** What the API hands back for a browser → storage upload (StorageService.getPresignedUploadUrl). */
interface DirectUploadTicket {
  provider?: "r2" | "cloudinary";
  method?: "PUT" | "POST";
  uploadUrl: string;
  fields?: Record<string, string>;
  storageKey: string;
  storageUrl: string;
}

/** Cloudinary takes big files in pieces; each must be ≥5 MB except the last. */
const CLOUDINARY_CHUNK_BYTES = 20 * 1024 * 1024;

/**
 * Uploads `body` with a ticket from a presign endpoint and returns where it
 * ended up. R2: one presigned PUT. Cloudinary: signed multipart POST, chunked
 * for large files, and the final URL is whatever Cloudinary answers with.
 */
async function directUpload(ticket: DirectUploadTicket, body: Blob, mimeType: string, failMessage: string) {
  if (ticket.provider !== "cloudinary") {
    const uploaded = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body });
    if (!uploaded.ok) throw new ApiError(failMessage, uploaded.status);
    return { storageKey: ticket.storageKey, storageUrl: ticket.storageUrl };
  }

  const uploadId = crypto.randomUUID();
  const total = body.size;
  let result: { public_id?: string; secure_url?: string } | null = null;
  for (let start = 0; start < total || (total === 0 && start === 0); start += CLOUDINARY_CHUNK_BYTES) {
    const end = Math.min(start + CLOUDINARY_CHUNK_BYTES, total);
    const form = new FormData();
    for (const [name, value] of Object.entries(ticket.fields ?? {})) form.append(name, value);
    form.append("file", body.slice(start, end), "upload");
    const chunked = total > CLOUDINARY_CHUNK_BYTES;
    const response = await fetch(ticket.uploadUrl, {
      method: "POST",
      headers: chunked ? { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${total}` } : undefined,
      body: form,
    });
    if (!response.ok) throw new ApiError(failMessage, response.status);
    result = await response.json().catch(() => null);
    if (total === 0) break;
  }
  if (!result?.secure_url) throw new ApiError(failMessage, 502);
  return { storageKey: ticket.storageKey, storageUrl: result.secure_url };
}

type StoredUpload = { storageKey: string; storageUrl: string; fileName: string; fileSize: number; mimeType: string };

/**
 * Chat attachment upload. In E2EE chats the bytes are encrypted on this
 * device first and storage receives an opaque blob; the returned `secret`
 * (key, real name/type/size) is sent only inside the encrypted message.
 */
async function uploadChatData(roomId: string, data: Blob, name: string, plainPath: "audio" | "file"): Promise<OutgoingAttachment> {
  const body = new FormData();
  if (await isRoomE2ee(roomId)) {
    const { blob, secret } = await encryptFile(data, name);
    body.append("file", blob, "encrypted.bin");
    const stored = await apiFetch<StoredUpload>(`/chat/rooms/${roomId}/attachments/file`, { method: "POST", body });
    return { ...stored, secret };
  }
  body.append("file", data, name);
  return apiFetch<StoredUpload>(`/chat/rooms/${roomId}/attachments/${plainPath}`, { method: "POST", body });
}

/** Sidebar previews of E2EE rooms arrive as ciphertext; open them here. */
async function decryptRoomPreviews(rooms: ChatRoom[]): Promise<ChatRoom[]> {
  return Promise.all(rooms.map(async (room) => {
    const last = room.lastMessage;
    if (!last?.e2ee) return room;
    const text = await decryptEnvelope(room.id, last.senderId, last.e2ee);
    return { ...room, lastMessage: { ...last, content: text ?? UNDECRYPTABLE_TEXT } };
  }));
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set(CLIENT_HEADER, CLIENT_HEADER_VALUE);
  headers.set("X-Device-Id", deviceId());
  // No Authorization header on purpose: JwtStrategy/JwtRefreshStrategy read the
  // token from the httpOnly cookie only, so `credentials: "include"` below is
  // the whole auth mechanism. Setting the header did nothing but leak a
  // "Bearer undefined" once the token stopped being returned in the body.

  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
  if (response.status === 401 && !options.anonymous && options.retry !== false) {
    const result = await refreshSession();
    if (result.ok) return apiFetch<T>(path, { ...options, retry: false });
    // A network-level failure to refresh doesn't mean the session is
    // actually invalid — don't tell the app to log out just because the
    // network hasn't come back yet (e.g. right after waking from sleep).
    if (!result.networkError) {
      // eslint-disable-next-line no-console
      console.warn(`[auth] refresh failed on ${path}, session is invalid`);
      // NOTE: this must only ever clear local state, never trigger a
      // re-fetch (e.g. re-running bootstrap) — a genuinely dead session
      // means EVERY authenticated call on the page is about to 401 the same
      // way, and re-fetching in response to each one is an infinite loop
      // that floods the server (session.ts's listener is responsible for
      // keeping this side-effect-free; see auth.tsx).
      session.clear();
      session.notify();
    }
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const normalized = errorMessage(body, `Request failed (${response.status})`);
    throw new ApiError(normalized.message, response.status, normalized.code, body);
  }
  return unwrapEnvelope<T>(body);
}

export const api = {
  auth: {
    /** Signs every session out on success — the caller included. */
    changePassword: (currentPassword: string, newPassword: string) =>
      apiFetch<{ message: string; sessionsRevoked: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
    login: (email: string, password: string) =>
      apiFetch<AuthResult>("/auth/login", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ email, password }),
      }),
    register: (data: Record<string, unknown>) =>
      apiFetch<{ message: string; userId: string; verifyToken: string; devVerificationCode?: string }>("/auth/register", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify(data),
      }),
    verify: (verifyToken: string, code: string) =>
      apiFetch<AuthResult>("/auth/verify-email", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ verifyToken, code }),
      }),
    forgotPassword: (email: string) =>
      apiFetch<{ message: string; resetToken?: string; devResetCode?: string }>("/auth/forgot-password", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ email }),
      }),
    verifyResetOtp: (resetToken: string, otp: string) =>
      apiFetch<{ message: string; confirmedToken: string }>("/auth/verify-reset-otp", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ resetToken, otp }),
      }),
    resetPassword: (confirmedToken: string, password: string) =>
      apiFetch<{ message: string }>("/auth/reset-password", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ confirmedToken, password }),
      }),
    resendVerification: (email: string) =>
      apiFetch<{ message: string; verifyToken: string; devVerificationCode?: string }>("/auth/resend-verification", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ email }),
      }),
    exchangeOAuthCode: (code: string) =>
      // Tokens never appear in the body — the response sets httpOnly cookies directly.
      apiFetch<AuthResult>("/auth/exchange-code", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ code }),
      }),
    // The server revokes the pair it reads from the request cookies.
    logout: () => apiFetch<{ message: string }>("/auth/logout", {
      method: "POST",
      body: "{}",
    }),
    /** The access token is an httpOnly cookie the frontend can't decode — this
     * is how it learns which group the current session is scoped to. */
    session: () => apiFetch<{ groupId: string | null }>("/auth/session"),
    sessions: () => apiFetch<Array<{
      id: string;
      deviceName?: string | null;
      deviceType?: string | null;
      browser?: string | null;
      os?: string | null;
      ipAddress?: string | null;
      lastUsedAt?: string;
      createdAt: string;
    }>>("/auth/sessions"),
    revokeSession: (id: string) => apiFetch(`/auth/sessions/${id}`, { method: "DELETE" }),
    revokeAllSessions: () => apiFetch("/auth/sessions", { method: "DELETE" }),
  },
  admin: {
    overview: () => apiFetch<AdminOverview>("/admin/overview"),
    users: (q = "", filter = "", page = 1) => apiFetch<{ total: number; page: number; items: AdminUser[] }>(`/admin/users?${new URLSearchParams({ q, filter, page: String(page) })}`),
    blockUser: (id: string, reason?: string) => apiFetch(`/admin/users/${id}/block`, { method: "POST", body: JSON.stringify({ reason }) }),
    unblockUser: (id: string) => apiFetch(`/admin/users/${id}/unblock`, { method: "POST" }),
    rooms: (q = "", type = "", filter = "", page = 1) => apiFetch<{ total: number; page: number; items: AdminRoom[] }>(`/admin/rooms?${new URLSearchParams({ q, type, filter, page: String(page) })}`),
    blockRoom: (id: string, reason?: string) => apiFetch(`/admin/rooms/${id}/block`, { method: "POST", body: JSON.stringify({ reason }) }),
    unblockRoom: (id: string) => apiFetch(`/admin/rooms/${id}/unblock`, { method: "POST" }),
    joinRoom: (id: string) => apiFetch(`/admin/rooms/${id}/join`, { method: "POST" }),
    requests: () => apiFetch<{ chat: AdminChatRequest[]; meeting: AdminMeetingRequest[] }>("/admin/requests"),
    meetings: () => apiFetch<AdminMeeting[]>("/admin/meetings"),
    audit: (page = 1) => apiFetch<AdminAuditEntry[]>(`/admin/audit?page=${page}`),
  },
  users: {
    me: () => apiFetch<User>("/users/me"),
    publicProfile: (identifier: string) => apiFetch<Pick<User, "id" | "publicId" | "firstName" | "lastName" | "username" | "nickname" | "avatarUrl" | "nameEmoji" | "bio"> & { accountVisibility?: "public" | "private"; isSuperAdmin?: boolean; channels?: Array<{ id: string; name: string; slug: string | null; avatarUrl: string | null; memberCount: number }> }>(`/users/profile/${encodeURIComponent(identifier)}`),
    update: (data: Partial<User>) =>
      apiFetch<User>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
    uploadAvatar: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return apiFetch<User>("/users/me/avatar/upload", { method: "POST", body });
    },
    uploadBackground: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return apiFetch<User>("/users/me/background/upload", { method: "POST", body });
    },
    removeBackground: () => apiFetch<User>("/users/me/background", { method: "DELETE" }),
    updateAccountVisibility: (visibility: "public" | "private") =>
      apiFetch<User>("/users/me/account-visibility", { method: "PATCH", body: JSON.stringify({ visibility }) }),
    search: (query: string, limit = 20) =>
      apiFetch<{ data: Array<Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">> }>(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    settings: (data: Record<string, boolean>) =>
      apiFetch<User>("/users/me/settings", { method: "PATCH", body: JSON.stringify(data) }),
  },
  audit: {
    group: (groupId: string, params: { action?: string; entityType?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])
      ).toString();
      return apiFetch<{ items: AuditEntry[]; total: number }>(`/groups/${groupId}/audit${query ? `?${query}` : ""}`);
    },
  },
  groups: {
    list: () => apiFetch<Group[]>("/groups"),
    create: (data: { name: string; slug: string; description?: string }) =>
      apiFetch<Group>("/groups", { method: "POST", body: JSON.stringify(data) }),
    members: (groupId: string) => apiFetch<GroupMember[]>(`/groups/${groupId}/members`),
    /** Reissues the auth cookies scoped to this group (embedded as a `groupId` JWT claim). */
    select: (groupId: string) =>
      apiFetch<{ groupId: string }>(`/groups/${groupId}/select`, { method: "POST" }),
    invite: (groupId: string, email: string, role: string) =>
      apiFetch<{ id: string; email: string; role: string; token: string }>(`/groups/${groupId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
  },
  invitations: {
    accept: (token: string) => apiFetch<{ groupId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
  },
  search: {
    global: (query: string) => apiFetch<GlobalSearchResult>(`/search?q=${encodeURIComponent(query)}`),
  },
  chat: {
    community: () => apiFetch<{ channel: ChatRoom | null; group: ChatRoom | null }>("/chat/community"),
    mute: (roomId: string, muted: boolean) => apiFetch<{ isMuted: boolean }>(`/chat/rooms/${roomId}/mute`, { method: "PATCH", body: JSON.stringify({ muted }) }),
    // The room resource itself. NOT /settings — that path belongs to the
    // channel-settings endpoint, and when both were declared on it only the
    // first-registered handler was reachable, so every call here was validated
    // against the wrong DTO and rejected.
    updateRoomBackground: (roomId: string, data: { backgroundUrl: string | null; backgroundType: NonNullable<ChatRoom["backgroundType"]> }) =>
      apiFetch<ChatRoom>(`/chat/rooms/${roomId}`, { method: "PATCH", body: JSON.stringify(data) }),
    updateRoomSettings: (roomId: string, data: { name?: string; description?: string; avatarUrl?: string | null; slug?: string | null; scope?: ChatRoom["scope"] }) =>
      apiFetch<ChatRoom>(`/chat/rooms/${roomId}`, { method: "PATCH", body: JSON.stringify(data) }),
    resolveRoute: (groupId: string, type: "direct" | "group" | "channel", identifier: string) =>
      apiFetch<{ roomId: string; type: string; slug: string | null; publicId: number } | { redirectSlug: string }>(`/groups/${groupId}/chat/resolve/${type}/${encodeURIComponent(identifier)}`),
    getAppearance: (roomId: string) => apiFetch<UserChatSettings | null>(`/chat/rooms/${roomId}/appearance`),
    /** My unsent drafts (one per chat); E2EE chats carry an envelope instead of text. */
    drafts: () => apiFetch<ChatDraftRecord[]>("/chat/drafts"),
    saveDraft: (roomId: string, body: { content?: string; e2ee?: E2eeEnvelope; clientId: string }) =>
      apiFetch<ChatDraftRecord>(`/chat/rooms/${roomId}/draft`, { method: "PATCH", body: JSON.stringify(body) }),
    updateAppearance: (roomId: string, data: Partial<Pick<UserChatSettings, "backgroundUrl" | "backgroundType" | "theme" | "fontSize" | "compactMode" | "animationEnabled">>) =>
      apiFetch<UserChatSettings>(`/chat/rooms/${roomId}/appearance`, { method: "PATCH", body: JSON.stringify(data) }),
    roomMembers: (roomId: string, query = "", page = 1) => apiFetch<{ items: Array<{ id: string; publicId: string; firstName: string; lastName: string; username?: string | null; nickname?: string | null; nameEmoji?: string | null; avatarUrl?: string | null; lastSeen?: string | null; role: string }>; total: number }>(`/chat/rooms/${roomId}/members?q=${encodeURIComponent(query)}&limit=20&page=${page}`),
    readReceipts: (roomId: string) => apiFetch<Array<{ userId: string; lastReadSeq: number }>>(`/chat/rooms/${roomId}/read-receipts`),
    presence: (userIds: string[]) => apiFetch<Record<string, { status: string; lastSeenAt: string | null }>>(`/chat/presence?ids=${userIds.map(encodeURIComponent).join(",")}`),
    shared: (roomId: string, kind: "media" | "files" | "links" | "music" | "voice") => apiFetch<Array<{ id?: string; messageId: string; fileName?: string; fileSize?: number; mimeType?: string; storageUrl?: string; content?: string; url?: string[] | string; username?: string; createdAt: string }>>(`/chat/rooms/${roomId}/shared?kind=${kind}&limit=30`),
    // Chat membership is its own permission, so both of these are
    // group-less: the JWT identifies the user and that's the whole check.
    // A DM, group or channel belongs to its members, not to an organisation.
    rooms: () => apiFetch<ChatRoom[]>("/chat/rooms").then(decryptRoomPreviews),
    // Public channels/groups the user hasn't joined. Platform-wide, not
    // group-scoped: a channel opened from chat belongs to no group.
    discover: (query: string) =>
      apiFetch<Array<{
        id: string;
        type: ChatRoom["type"];
        name: string | null;
        description: string | null;
        avatarUrl: string | null;
        slug: string | null;
        publicId: number;
        memberCount: number;
      }>>(`/chat/discover?q=${encodeURIComponent(query)}`),
    joinRoom: (roomId: string) =>
      apiFetch<ChatRoom>(`/chat/rooms/${roomId}/join`, { method: "POST" }),
    createRoom: (data: Record<string, unknown>) =>
      apiFetch<ChatRoom>("/chat/rooms", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    messages: (roomId: string, cursor?: number) =>
      apiFetch<{ data: ChatMessage[]; total?: number }>(`/chat/rooms/${roomId}/messages?limit=80${cursor ? `&cursor=${cursor}` : ""}`)
        .then(async (result) => ({ ...result, data: await decryptMessages(result.data) })),
    // Text is encrypted on this device for DMs and private rooms (lib/e2ee.ts);
    // public rooms send plaintext, which the server encrypts at rest.
    send: (roomId: string, content: string, clientMessageId: string, replyToId?: string, attachments: OutgoingAttachment[] = []) =>
      sendWithE2ee(roomId, content, (body) => apiFetch<ChatMessage>(`/chat/rooms/${roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ ...body, clientMessageId, replyToId }),
      }), attachments).then(decryptMessage),
    /** `attachments` keeps an E2EE message's file keys in the re-encrypted envelope. */
    editMessage: (messageId: string, content: string, roomId: string, attachments: OutgoingAttachment[] = []) =>
      sendWithE2ee(roomId, content, (body) => apiFetch<ChatMessage>(`/chat/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: body.content, e2ee: body.e2ee }),
      }), attachments).then(decryptMessage),
    deleteMessage: (messageId: string) =>
      apiFetch<void>(`/chat/messages/${messageId}`, { method: "DELETE" }),
    getThread: (messageId: string) =>
      apiFetch<{ root: ChatMessage; replies: ChatMessage[] }>(`/chat/messages/${messageId}/thread`)
        .then(async (result) => ({ root: await decryptMessage(result.root), replies: await decryptMessages(result.replies) })),
    sendThreadReply: (messageId: string, content: string, clientMessageId: string, roomId: string) =>
      sendWithE2ee(roomId, content, (body) => apiFetch<ChatMessage>(`/chat/messages/${messageId}/thread`, {
        method: "POST",
        body: JSON.stringify({ content: body.content, e2ee: body.e2ee, mentions: body.mentions, clientMessageId }),
      })).then(decryptMessage),
    /** Group/channel video chat (Telegram-style). */
    voiceChat: (roomId: string) => apiFetch<RoomVoiceChat | null>(`/chat/rooms/${roomId}/voice-chat`).then((chat) => (chat && "meetingId" in chat ? chat : null)),
    voiceChatJoin: (roomId: string) => apiFetch<RoomVoiceChat>(`/chat/rooms/${roomId}/voice-chat/join`, { method: "POST" }),
    voiceChatEnd: (roomId: string) => apiFetch<{ ended: boolean }>(`/chat/rooms/${roomId}/voice-chat`, { method: "DELETE" }),
    voiceChatScheduled: (roomId: string) =>
      apiFetch<{ meetingId: string; title: string; startTime: string; hostId: string; canCancel: boolean } | null>(`/chat/rooms/${roomId}/voice-chat/scheduled`)
        .then((next) => (next && "meetingId" in next ? next : null)),
    scheduleVoiceChat: (roomId: string, startTime: string, title?: string) =>
      apiFetch(`/chat/rooms/${roomId}/voice-chat/schedule`, { method: "POST", body: JSON.stringify({ startTime, title }) }),
    cancelScheduledVoiceChat: (roomId: string) => apiFetch(`/chat/rooms/${roomId}/voice-chat/scheduled`, { method: "DELETE" }),
    /** Pinned messages of a room, newest pin first (decrypted like the timeline). */
    pins: (roomId: string) => apiFetch<ChatMessage[]>(`/chat/rooms/${roomId}/pins`).then(decryptMessages),
    pin: (messageId: string) => apiFetch(`/chat/messages/${messageId}/pin`, { method: "POST" }),
    unpin: (messageId: string) => apiFetch(`/chat/messages/${messageId}/pin`, { method: "DELETE" }),
    addReaction: (messageId: string, emoji: string) =>
      apiFetch(`/chat/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }),
    removeReaction: (messageId: string, emoji: string) =>
      apiFetch<void>(`/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" }),
    reactors: (messageId: string) =>
      apiFetch<Array<{ userId: string; emoji: string; createdAt: string; firstName: string; lastName: string; avatarUrl: string | null; username: string | null }>>(`/chat/messages/${messageId}/reactions`),
    presignAttachment: (roomId: string, file: File) =>
      apiFetch<{ uploadUrl: string; storageKey: string; storageUrl: string; expiresIn: number }>(`/chat/rooms/${roomId}/attachments/presign`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size }),
      }),
    uploadAudio: (roomId: string, blob: Blob) => uploadChatData(roomId, blob, `voice-${Date.now()}.webm`, "audio"),
    /** A file for a chat message (encrypted on-device in E2EE chats). Not for avatars/backgrounds — see uploadFile. */
    uploadChatFile: (roomId: string, file: File) => uploadChatData(roomId, file, file.name, "file"),
    uploadFile: (roomId: string, file: File) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return apiFetch<{ storageKey: string; storageUrl: string; fileName: string; fileSize: number; mimeType: string }>(`/chat/rooms/${roomId}/attachments/file`, { method: "POST", body });
    },
    acceptInvite: (roomId: string) => apiFetch(`/chat/rooms/${roomId}/invite/accept`, { method: "POST" }),
    createInvite: (roomId: string, data: { maxUses?: number; expiresInHours?: number }) =>
      apiFetch<RoomInvite>(`/chat/rooms/${roomId}/invites`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listInvites: (roomId: string) => apiFetch<RoomInvite[]>(`/chat/rooms/${roomId}/invites`),
    revokeInvite: (roomId: string, inviteId: string) =>
      apiFetch<void>(`/chat/rooms/${roomId}/invites/${inviteId}`, { method: "DELETE" }),
    /** Joins straight away, or — for a private room — files an ask-to-join request. */
    joinByCode: (code: string) =>
      apiFetch<ChatRoom | { joinRequested: true; roomId: string; name: string | null; type: ChatRoom["type"]; avatarUrl: string | null }>(`/chat/join/${encodeURIComponent(code)}`, { method: "POST" }),
    /** The room's standing unlimited invite link (created on first ask) — owner/admin only. */
    inviteCode: (roomId: string) => apiFetch<{ code: string }>(`/chat/rooms/${roomId}/invite-code`, { method: "POST" }),
    joinRequests: (roomId: string) =>
      apiFetch<Array<{ id: string; userId: string; firstName: string; lastName: string; username: string | null; avatarUrl: string | null; createdAt: string }>>(`/chat/rooms/${roomId}/join-requests`),
    resolveJoinRequest: (roomId: string, requestId: string, approve: boolean) =>
      apiFetch<{ userId: string; approved: boolean }>(`/chat/rooms/${roomId}/join-requests/${requestId}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    discussion: (messageId: string) =>
      apiFetch<{ id: string; roomId: string; sourceChannelMessageId: string }>(`/chat/community/posts/${messageId}/discussion`, { method: "POST" }),
    deleteRoom: (roomId: string) =>
      apiFetch<void>(`/chat/rooms/${roomId}`, { method: "DELETE" }),
    // ── Channel settings ────────────────────────────────────────────────────
    channelSettings: (roomId: string) =>
      apiFetch<{ role: RoomRole; canAdminister: boolean; settings: Partial<ChannelSettings> }>(`/chat/rooms/${roomId}/settings`),
    updateChannelSettings: (roomId: string, patch: Partial<ChannelSettings>) =>
      apiFetch<{ settings: ChannelSettings; changes: Record<string, unknown> }>(`/chat/rooms/${roomId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
    channelStats: (roomId: string) =>
      apiFetch<{
        subscribers: number; messages: number; views: number; reach: number; reactions: number;
        storageBytes: number; files: number; engagement: number;
        topPosts: Array<{ id: string; content: string | null; viewCount: number; createdAt: string }>;
        growth: Array<{ day: string; joined: number }>;
      }>(`/chat/rooms/${roomId}/settings/stats`),
    // One shared trail: the same audit_logs rows a group's activity feed
    // reads, filtered to this room.
    channelSettingsAudit: (roomId: string) =>
      apiFetch<AuditEntry[]>(`/chat/rooms/${roomId}/settings/audit`),
    setMemberRole: (roomId: string, memberId: string, role: "admin" | "moderator" | "member") =>
      apiFetch<{ userId: string; role: RoomRole }>(`/chat/rooms/${roomId}/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      }),
    transferOwnership: (roomId: string, userId: string) =>
      apiFetch<{ ownerId: string }>(`/chat/rooms/${roomId}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ userId })
      }),
    // ── Views ───────────────────────────────────────────────────────────────
    recordViews: (roomId: string, messageIds: string[]) =>
      apiFetch<{ buffered: number }>(`/chat/rooms/${roomId}/views`, {
        method: "POST",
        body: JSON.stringify({ messageIds })
      }),
    messageViewers: (messageId: string) =>
      apiFetch<{ count: number; viewers: Array<{ id: string; firstName: string; lastName: string; username: string | null; avatarUrl: string | null; viewedAt: string }> | null }>(`/chat/messages/${messageId}/views`),
    leaveRoom: (roomId: string) =>
      apiFetch<{ left: boolean }>(`/chat/rooms/${roomId}/leave`, { method: "POST" }),
    /** The AI with a picture (multipart: an image is too big for a JSON body). */
    aiImage: (image: File, message: string, history: Array<{ role: "user" | "model"; text: string }>, conversationId?: string) => {
      const form = new FormData();
      form.append("image", image);
      form.append("message", message);
      form.append("history", JSON.stringify(history));
      if (conversationId) form.append("conversationId", conversationId);
      return apiFetch<AiReplyResult & { conversationId: string; title: string }>("/chat/ai/image", { method: "POST", body: form });
    },
    /** Saved to a conversation (started if none given), unless `ephemeral`. */
    ai: (message: string, history: Array<{ role: "user" | "model"; text: string }>, options: { conversationId?: string; ephemeral?: boolean } = {}) =>
      apiFetch<AiReplyResult & { conversationId?: string; title?: string }>("/chat/ai", { method: "POST", body: JSON.stringify({ message, history, ...options }) }),
    aiConversations: () => apiFetch<Array<{ id: string; title: string; updatedAt: string }>>("/chat/ai/conversations"),
    aiConversation: (id: string) => apiFetch<{ id: string; title: string; messages: Array<{ id: string; role: "user" | "model"; text: string; hasImage: boolean; sources: Array<{ title: string; url: string }>; createdAt: string }> }>(`/chat/ai/conversations/${id}`),
    renameAiConversation: (id: string, title: string) => apiFetch<{ id: string; title: string }>(`/chat/ai/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    deleteAiConversation: (id: string) => apiFetch<void>(`/chat/ai/conversations/${id}`, { method: "DELETE" }),
    aiMemory: () => apiFetch<{ content: string; enabled: boolean; updatedAt: string | null }>("/chat/ai/memory"),
    saveAiMemory: (patch: { content?: string; enabled?: boolean }) =>
      apiFetch<{ content: string; enabled: boolean; updatedAt: string | null }>("/chat/ai/memory", { method: "PATCH", body: JSON.stringify(patch) }),
  },
  meetings: {
    iceServers: () => apiFetch<RTCIceServer[]>("/meetings/ice-servers"),
    /** Media transport (LiveKit SFU or p2p) and the participant ceiling it supports. */
    mediaConfig: () => apiFetch<{ provider: "livekit" | "p2p"; maxParticipants: number }>("/meetings/media-config"),
    /** LiveKit token for a participant already in the meeting (after the socket join). */
    mediaSession: (meetingId: string) =>
      apiFetch<{ provider: "livekit"; url: string; token: string; room: string } | { provider: "p2p" }>(`/meetings/${meetingId}/media-session`, { method: "POST" }),
    list: (groupId: string) => apiFetch<Meeting[]>(`/groups/${groupId}/meetings`),
    create: (groupId: string, data: Record<string, unknown>) =>
      apiFetch<Meeting>(`/groups/${groupId}/meetings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    one: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}`),
    update: (meetingId: string, data: Record<string, unknown>) =>
      apiFetch<Meeting>(`/meetings/${meetingId}`, { method: "PATCH", body: JSON.stringify(data) }),
    lock: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}/lock`, { method: "POST" }),
    unlock: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}/unlock`, { method: "POST" }),
    invite: (meetingId: string, data: { userIds?: string[]; emails?: string[] }) =>
      apiFetch<{ success: boolean }>(`/meetings/${meetingId}/invite`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    join: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}/join`, { method: "POST" }),
    joinByCode: (code: string) =>
      apiFetch<Meeting>("/meetings/join-by-code", { method: "POST", body: JSON.stringify({ code }) }),
    resolveByCode: (code: string) =>
      apiFetch<Meeting>("/meetings/resolve-by-code", { method: "POST", body: JSON.stringify({ code }) }),
    leave: (meetingId: string) => apiFetch<{ left: boolean }>(`/meetings/${meetingId}/leave`, { method: "POST" }),
    end: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}/end`, { method: "POST" }),
    remove: (meetingId: string) => apiFetch<void>(`/meetings/${meetingId}`, { method: "DELETE" }),
    requestToJoin: (meetingId: string) =>
      apiFetch<{ status: "joined" | "pending" | "already_joined"; meeting?: Meeting; requestId?: string }>(
        `/meetings/${meetingId}/join-requests`,
        { method: "POST" },
      ),
    cancelJoinRequest: (meetingId: string) =>
      apiFetch<MeetingJoinRequest>(`/meetings/${meetingId}/join-requests/me`, { method: "DELETE" }),
    joinRequests: {
      list: (meetingId: string) => apiFetch<MeetingJoinRequest[]>(`/meetings/${meetingId}/join-requests`),
      approve: (meetingId: string, requestId: string) =>
        apiFetch<MeetingJoinRequest>(`/meetings/${meetingId}/join-requests/${requestId}/approve`, { method: "POST" }),
      reject: (meetingId: string, requestId: string) =>
        apiFetch<MeetingJoinRequest>(`/meetings/${meetingId}/join-requests/${requestId}/reject`, { method: "POST" }),
      approveAll: (meetingId: string) =>
        apiFetch<MeetingJoinRequest[]>(`/meetings/${meetingId}/join-requests/approve-all`, { method: "POST" }),
      rejectAll: (meetingId: string) =>
        apiFetch<MeetingJoinRequest[]>(`/meetings/${meetingId}/join-requests/reject-all`, { method: "POST" }),
    },
    recordings: {
      list: (meetingId: string) => apiFetch<MeetingRecording[]>(`/meetings/${meetingId}/recordings`),
      start: (meetingId: string) => apiFetch<MeetingRecording>(`/meetings/${meetingId}/recordings/start`, { method: "POST" }),
      stop: (meetingId: string, data?: { storageKey: string; storageUrl: string; fileSize: number }) =>
        apiFetch<MeetingRecording>(`/meetings/${meetingId}/recordings/stop`, { method: "POST", body: JSON.stringify(data || {}) }),
      upload: async (meetingId: string, recordingId: string, blob: Blob) => {
        const mimeType = blob.type || "video/webm";
        const signed = await apiFetch<DirectUploadTicket>(`/meetings/${meetingId}/recordings/${recordingId}/presign`, {
          method: "POST",
          body: JSON.stringify({ mimeType, fileSize: blob.size }),
        });
        return directUpload(signed, blob, mimeType, "Yozuv bulutga yuklanmadi");
      },
    },
  },
  library: {
    read: (url: string) => apiFetch<{ content: string; contentType: string }>(`/library/read?url=${encodeURIComponent(url)}`),
    search: (params: { q?: string; lang: string; subject: string; page: number; readable?: boolean }) =>
      apiFetch<{ total: number; items: LibraryBook[]; page: number; hasMore: boolean }>(`/library/search?${new URLSearchParams({ q: params.q ?? "", lang: params.lang, subject: params.subject, page: String(params.page), readable: params.readable === false ? "0" : "1" })}`),
    reviews: (bookKey: string) => apiFetch<LibraryReviews>(`/library/books/${encodeURIComponent(bookKey)}/reviews`),
    saveReview: (bookKey: string, rating: number, body: string) =>
      apiFetch<LibraryReviews>(`/library/books/${encodeURIComponent(bookKey)}/reviews`, { method: "PUT", body: JSON.stringify({ rating, body }) }),
    marks: () => apiFetch<{ liked: string[]; saved: string[] }>("/library/me/marks"),
    saved: () => apiFetch<LibraryBook[]>("/library/me/saved"),
    reading: () => apiFetch<Array<{ slug: string; book: LibraryBook; position: number; updatedAt: string }>>("/library/me/reading"),
    save: (book: LibraryBook) => apiFetch<{ saved: boolean }>(`/library/books/${encodeURIComponent(book.key)}/save`, { method: "PUT", body: JSON.stringify({ book }) }),
    unsave: (bookKey: string) => apiFetch<{ saved: boolean }>(`/library/books/${encodeURIComponent(bookKey)}/save`, { method: "DELETE" }),
    /** Opening a book's page: registers it and returns its slug and counts. */
    open: (book: LibraryBook) => apiFetch<MediaPage>(`/library/books/${encodeURIComponent(book.key)}/open`, { method: "POST", body: JSON.stringify({ book }) }),
    like: (bookKey: string, book?: LibraryBook) => apiFetch<{ liked: boolean; likes: number }>(`/library/books/${encodeURIComponent(bookKey)}/like`, { method: "PUT", body: JSON.stringify({ book }) }),
    unlike: (bookKey: string) => apiFetch<{ liked: boolean; likes: number }>(`/library/books/${encodeURIComponent(bookKey)}/like`, { method: "DELETE" }),
    deleteReview: (bookKey: string) => apiFetch<LibraryReviews>(`/library/books/${encodeURIComponent(bookKey)}/reviews`, { method: "DELETE" }),
  },
  realtime: {
    /** Moves this tab's open socket onto the freshly refreshed session cookie. */
    renew: (socketId: string) => apiFetch<{ renewed: boolean }>("/realtime/renew", { method: "POST", body: JSON.stringify({ socketId }) }),
  },
  /** Our own pages for YouTube videos and library books (/youtube/:slug, /library/:slug). */
  media: {
    youtube: (videoId: string) => apiFetch<MediaPage>("/media/youtube", { method: "POST", body: JSON.stringify({ videoId }) }),
    get: (slug: string) => apiFetch<MediaPage>(`/media/${encodeURIComponent(slug)}`),
    view: (slug: string) => apiFetch<{ views: number }>(`/media/${encodeURIComponent(slug)}/view`, { method: "POST" }),
    like: (slug: string) => apiFetch<{ liked: boolean; likes: number }>(`/media/${encodeURIComponent(slug)}/like`, { method: "PUT" }),
    unlike: (slug: string) => apiFetch<{ liked: boolean; likes: number }>(`/media/${encodeURIComponent(slug)}/like`, { method: "DELETE" }),
    /** Seconds the player actually played (Spend Time). keepalive: also sent while closing. */
    watch: (slug: string, seconds: number) =>
      apiFetch<void>(`/media/${encodeURIComponent(slug)}/watch`, { method: "POST", body: JSON.stringify({ seconds }), keepalive: true }),
    /** keepalive: also sent while the page is closing. */
    progress: (slug: string, progress: ReadingProgress) =>
      apiFetch<{ position: number }>(`/media/${encodeURIComponent(slug)}/progress`, { method: "PUT", body: JSON.stringify(progress), keepalive: true }),
  },
  youtube: {
    status: () => apiFetch<{ enabled: boolean }>("/youtube/status"),
    /** "For you": vetted (nothing off-topic for Optima) and ranked for me. */
    details: (videoId: string) => apiFetch<YoutubeDetails>(`/youtube/videos/${encodeURIComponent(videoId)}/details`),
    feed: (page = 1) => apiFetch<{ items: YoutubeVideo[]; hasMore: boolean }>(`/youtube/feed?page=${page}`),
    search: (q: string, pageToken?: string) => apiFetch<{ items: YoutubeVideo[]; nextPageToken: string | null }>(`/youtube/search?${new URLSearchParams({ q, ...(pageToken ? { pageToken } : {}) })}`),
    popular: (pageToken?: string) => apiFetch<{ items: YoutubeVideo[]; nextPageToken: string | null }>(`/youtube/popular${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`),
  },
  education: {
    home: () => apiFetch<{ subjects: Array<{ id: string; name: string; description: string }>; trustedChannels: Array<{ id: string; name: string; handle?: string; avatarUrl?: string; subjects: string[]; examTypes: string[]; trustLevel: string }>; latest: any[]; continueLearning: any[]; saved: any[] }>("/education/home"),
    dashboard: () => apiFetch<{ subjects: Array<{ subject: string; opened: number; completed: number; progress: number; watchSeconds: number }>; opened: number; completed: number; watchSeconds: number; saved: number; completionRate: number }>("/education/dashboard"),
    videos: (params: { subject?: string; q?: string; page?: number } = {}) => {
      const query = new URLSearchParams({ limit: "40" });
      if (params.subject) query.set("subject", params.subject);
      if (params.q) query.set("q", params.q);
      if (params.page) query.set("page", String(params.page));
      return apiFetch<{ items: any[]; page: number; hasMore: boolean }>(`/education/videos?${query}`);
    },
    video: (id: string) => apiFetch<any>(`/education/videos/${encodeURIComponent(id)}`),
    save: (id: string) => apiFetch<{ saved: boolean }>(`/education/videos/${encodeURIComponent(id)}/save`, { method: "POST" }),
    unsave: (id: string) => apiFetch<{ saved: boolean }>(`/education/videos/${encodeURIComponent(id)}/save`, { method: "DELETE" }),
    complete: (id: string) => apiFetch<{ completed: boolean }>(`/education/videos/${encodeURIComponent(id)}/complete`, { method: "POST" }),
    progress: (id: string, watchProgressPercent: number, lastPositionSeconds: number) =>
      apiFetch(`/education/videos/${encodeURIComponent(id)}/progress`, { method: "POST", body: JSON.stringify({ watchProgressPercent, lastPositionSeconds }) }),
    addNote: (id: string, content: string, timestampSeconds?: number) =>
      apiFetch(`/education/videos/${encodeURIComponent(id)}/notes`, { method: "POST", body: JSON.stringify({ content, timestampSeconds }) }),
    mentor: (videoId: string, message: string) =>
      apiFetch<{ reply: string; provider: string; contextSources: string[] }>("/education/mentor/chat", { method: "POST", body: JSON.stringify({ videoId, message }) }),
  },

  notifications: {
    // The endpoint is paginated — it answers with an envelope, not a bare
    // array, which is what this was typed as.
    list: (limit = 20) =>
      apiFetch<{ data: NotificationItem[]; total: number; page: number; limit: number }>(`/notifications?limit=${limit}`),
    unreadCount: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    markRead: (id: string) => apiFetch<NotificationItem>(`/notifications/${id}/read`, { method: "PATCH" }),
    readAll: () => apiFetch<{ message: string }>("/notifications/read-all", { method: "POST" }),
  },
};
