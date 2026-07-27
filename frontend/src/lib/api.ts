import type {
  AuthResult,
  ChatMessage,
  ChatRoom,
  GlobalSearchResult,
  Meeting,
  MeetingFile,
  MeetingRecording,
  NotificationItem,
  RoomInvite,
  User,
  UserChatSettings,
  Workspace,
  WorkspaceMember,
} from "../types";
import { session } from "./session";

const API_URL = (import.meta.env.VITE_API_URL || "/api/v1").replace(/\/$/, "");
export type OAuthProvider = "google" | "github";

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
  const nested = typeof value.message === "object" ? (value.message as Record<string, unknown>) : null;
  const message =
    (typeof value.message === "string" && value.message) ||
    (typeof nested?.message === "string" && nested.message) ||
    (Array.isArray(value.message) && value.message.join(". ")) ||
    fallback;
  const code =
    (typeof value.code === "string" && value.code) ||
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
  const refreshToken = session.refreshToken();
  if (!refreshToken) return { ok: false, networkError: false };
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[auth] POST /auth/refresh threw:", error);
    return { ok: false, networkError: true };
  }
  if (response.ok) {
    const result = unwrapEnvelope<AuthResult>(await response.json());
    session.save(result.accessToken, result.refreshToken);
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

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const accessToken = session.accessToken();
  if (!options.anonymous && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

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
    logout: () => apiFetch<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: session.refreshToken() }),
    }),
    /** The access token is an httpOnly cookie the frontend can't decode — this
     * is how it learns which workspace the current session is scoped to. */
    session: () => apiFetch<{ workspaceId: string | null }>("/auth/session"),
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
  users: {
    me: () => apiFetch<User>("/users/me"),
    publicProfile: (identifier: string) => apiFetch<Pick<User, "publicId" | "firstName" | "lastName" | "username" | "avatarUrl">>(`/users/profile/${encodeURIComponent(identifier)}`),
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
  workspaces: {
    list: () => apiFetch<Workspace[]>("/workspaces"),
    create: (data: { name: string; slug: string; description?: string }) =>
      apiFetch<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(data) }),
    members: (workspaceId: string) => apiFetch<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
    /** Reissues the auth cookies scoped to this workspace (embedded as a `workspaceId` JWT claim). */
    select: (workspaceId: string) =>
      apiFetch<{ workspaceId: string }>(`/workspaces/${workspaceId}/select`, { method: "POST" }),
    invite: (workspaceId: string, email: string, role: string) =>
      apiFetch<{ id: string; email: string; role: string; token: string }>(`/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
  },
  invitations: {
    accept: (token: string) => apiFetch<{ workspaceId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
  },
  search: {
    global: (query: string) => apiFetch<GlobalSearchResult>(`/search?q=${encodeURIComponent(query)}`),
  },
  chat: {
    community: () => apiFetch<{ channel: ChatRoom | null; group: ChatRoom | null }>("/chat/community"),
    mute: (roomId: string, muted: boolean) => apiFetch<{ isMuted: boolean }>(`/chat/rooms/${roomId}/mute`, { method: "PATCH", body: JSON.stringify({ muted }) }),
    updateRoomBackground: (roomId: string, data: { backgroundUrl: string | null; backgroundType: NonNullable<ChatRoom["backgroundType"]> }) =>
      apiFetch<ChatRoom>(`/chat/rooms/${roomId}/settings`, { method: "PATCH", body: JSON.stringify(data) }),
    updateRoomSettings: (roomId: string, data: { name?: string; description?: string; avatarUrl?: string | null; slug?: string | null }) =>
      apiFetch<ChatRoom>(`/chat/rooms/${roomId}/settings`, { method: "PATCH", body: JSON.stringify(data) }),
    resolveRoute: (workspaceId: string, type: "direct" | "group" | "channel", identifier: string) =>
      apiFetch<{ roomId: string; type: string; slug: string | null; publicId: number } | { redirectSlug: string }>(`/workspaces/${workspaceId}/chat/resolve/${type}/${encodeURIComponent(identifier)}`),
    getAppearance: (roomId: string) => apiFetch<UserChatSettings | null>(`/chat/rooms/${roomId}/appearance`),
    getDraft: (roomId: string) => apiFetch<{ content: string }>(`/chat/rooms/${roomId}/draft`),
    saveDraft: (roomId: string, content: string) => apiFetch<{ content: string }>(`/chat/rooms/${roomId}/draft`, { method: "PATCH", body: JSON.stringify({ content }) }),
    updateAppearance: (roomId: string, data: Partial<Pick<UserChatSettings, "backgroundUrl" | "backgroundType" | "theme" | "fontSize" | "compactMode" | "animationEnabled">>) =>
      apiFetch<UserChatSettings>(`/chat/rooms/${roomId}/appearance`, { method: "PATCH", body: JSON.stringify(data) }),
    roomMembers: (roomId: string, query = "") => apiFetch<{ items: Array<{ publicId: string; firstName: string; lastName: string; username?: string | null; avatarUrl?: string | null; lastSeen?: string | null; role: string }>; total: number }>(`/chat/rooms/${roomId}/members?q=${encodeURIComponent(query)}&limit=50`),
    readReceipts: (roomId: string) => apiFetch<Array<{ userId: string; lastReadSeq: number }>>(`/chat/rooms/${roomId}/read-receipts`),
    shared: (roomId: string, kind: "media" | "files" | "links" | "music" | "voice") => apiFetch<Array<{ id?: string; messageId: string; fileName?: string; fileSize?: number; mimeType?: string; storageUrl?: string; content?: string; url?: string[] | string; username?: string; createdAt: string }>>(`/chat/rooms/${roomId}/shared?kind=${kind}&limit=30`),
    rooms: (workspaceId: string) => apiFetch<ChatRoom[]>(`/workspaces/${workspaceId}/chat/rooms`),
    createRoom: (workspaceId: string, data: Record<string, unknown>) =>
      apiFetch<ChatRoom>(`/workspaces/${workspaceId}/chat/rooms`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    messages: (roomId: string, cursor?: number) =>
      apiFetch<{ data: ChatMessage[]; total?: number }>(`/chat/rooms/${roomId}/messages?limit=80${cursor ? `&cursor=${cursor}` : ""}`),
    send: (roomId: string, content: string, clientMessageId: string, replyToId?: string, attachments?: Array<{ storageKey: string; storageUrl: string; fileName: string; fileSize: number; mimeType: string }>) =>
      apiFetch<ChatMessage>(`/chat/rooms/${roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, clientMessageId, replyToId, attachments }),
      }),
    editMessage: (messageId: string, content: string) =>
      apiFetch<ChatMessage>(`/chat/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ content }) }),
    deleteMessage: (messageId: string) =>
      apiFetch<void>(`/chat/messages/${messageId}`, { method: "DELETE" }),
    getThread: (messageId: string) =>
      apiFetch<{ root: ChatMessage; replies: ChatMessage[] }>(`/chat/messages/${messageId}/thread`),
    sendThreadReply: (messageId: string, content: string, clientMessageId: string) =>
      apiFetch<ChatMessage>(`/chat/messages/${messageId}/thread`, { method: "POST", body: JSON.stringify({ content, clientMessageId }) }),
    addReaction: (messageId: string, emoji: string) =>
      apiFetch(`/chat/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }),
    removeReaction: (messageId: string, emoji: string) =>
      apiFetch<void>(`/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" }),
    presignAttachment: (roomId: string, file: File) =>
      apiFetch<{ uploadUrl: string; storageKey: string; storageUrl: string; expiresIn: number }>(`/chat/rooms/${roomId}/attachments/presign`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size }),
      }),
    uploadAudio: (roomId: string, blob: Blob) => {
      const body = new FormData();
      body.append("file", blob, `voice-${Date.now()}.webm`);
      return apiFetch<{ storageKey: string; storageUrl: string; fileName: string; fileSize: number; mimeType: string }>(`/chat/rooms/${roomId}/attachments/audio`, { method: "POST", body });
    },
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
    joinByCode: (code: string) =>
      apiFetch<ChatRoom>(`/chat/join/${encodeURIComponent(code)}`, { method: "POST" }),
    discussion: (messageId: string) =>
      apiFetch<{ id: string; roomId: string; sourceChannelMessageId: string }>(`/chat/community/posts/${messageId}/discussion`, { method: "POST" }),
    deleteRoom: (roomId: string) =>
      apiFetch<void>(`/chat/rooms/${roomId}`, { method: "DELETE" }),
    ai: (message: string, history: Array<{ role: "user" | "model"; text: string }>) =>
      apiFetch<{ reply: string; provider: "gemini" | "groq"; grounded: boolean; sources: Array<{ title: string; url: string }> }>("/chat/ai", { method: "POST", body: JSON.stringify({ message, history }) }),
  },
  meetings: {
    iceServers: () => apiFetch<RTCIceServer[]>("/meetings/ice-servers"),
    list: (workspaceId: string) => apiFetch<Meeting[]>(`/workspaces/${workspaceId}/meetings`),
    create: (workspaceId: string, data: Record<string, unknown>) =>
      apiFetch<Meeting>(`/workspaces/${workspaceId}/meetings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    one: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}`),
    join: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}/join`, { method: "POST" }),
    joinByCode: (code: string) =>
      apiFetch<Meeting>("/meetings/join-by-code", { method: "POST", body: JSON.stringify({ code }) }),
    leave: (meetingId: string) => apiFetch<{ left: boolean }>(`/meetings/${meetingId}/leave`, { method: "POST" }),
    end: (meetingId: string) => apiFetch<Meeting>(`/meetings/${meetingId}/end`, { method: "POST" }),
    remove: (meetingId: string) => apiFetch<void>(`/meetings/${meetingId}`, { method: "DELETE" }),
    recordings: {
      list: (meetingId: string) => apiFetch<MeetingRecording[]>(`/meetings/${meetingId}/recordings`),
      start: (meetingId: string) => apiFetch<MeetingRecording>(`/meetings/${meetingId}/recordings/start`, { method: "POST" }),
      stop: (meetingId: string, data?: { storageKey: string; storageUrl: string; fileSize: number }) =>
        apiFetch<MeetingRecording>(`/meetings/${meetingId}/recordings/stop`, { method: "POST", body: JSON.stringify(data || {}) }),
      upload: async (meetingId: string, recordingId: string, blob: Blob) => {
        const mimeType = blob.type || "video/webm";
        const signed = await apiFetch<{ uploadUrl: string; storageKey: string; storageUrl: string }>(`/meetings/${meetingId}/recordings/${recordingId}/presign`, {
          method: "POST",
          body: JSON.stringify({ mimeType, fileSize: blob.size }),
        });
        const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
        if (!uploaded.ok) throw new ApiError("Yozuv bulutga yuklanmadi", uploaded.status);
        return signed;
      },
    },
    files: (meetingId: string) => apiFetch<MeetingFile[]>(`/meetings/${meetingId}/files`),
    shareFile: async (meetingId: string, file: File) => {
      const mimeType = file.type || "application/octet-stream";
      const signed = await apiFetch<{ uploadUrl: string; storageKey: string; storageUrl: string }>(`/meetings/${meetingId}/files/presign`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size }),
      });
      const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
      if (!uploaded.ok) throw new ApiError("Fayl bulutga yuklanmadi", uploaded.status);
      return apiFetch<MeetingFile>(`/meetings/${meetingId}/files`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType, fileSize: file.size, storageKey: signed.storageKey, storageUrl: signed.storageUrl }),
      });
    },
  },
  library: {
    read: (url: string) => apiFetch<{ content: string; contentType: string }>(`/library/read?url=${encodeURIComponent(url)}`),
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
    list: () => apiFetch<NotificationItem[]>("/notifications?limit=20"),
    readAll: () => apiFetch("/notifications/read-all", { method: "POST" }),
  },
};
