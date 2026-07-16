import type {
  AuthResult,
  ChatMessage,
  ChatRoom,
  GlobalSearchResult,
  Meeting,
  NotificationItem,
  RoomInvite,
  User,
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

let refreshPromise: Promise<boolean> | null = null;

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

async function renewSession(): Promise<boolean> {
  const refreshToken = session.refreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      // Another tab may have already rotated this exact refresh token
      // concurrently (same account open in two tabs, both refreshing at
      // once) — localStorage is shared across tabs, so if it now holds a
      // different refresh token than the one we just sent, that rotation
      // already succeeded elsewhere. Use it instead of logging the user out.
      const latestToken = session.refreshToken();
      return !!latestToken && latestToken !== refreshToken;
    }
    session.save((await response.json()) as AuthResult);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (!options.anonymous) {
    const token = session.accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && !options.anonymous && options.retry !== false) {
    refreshPromise ??= renewSession().finally(() => {
      refreshPromise = null;
    });
    if (await refreshPromise) return apiFetch<T>(path, { ...options, retry: false });
    session.clear();
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const normalized = errorMessage(body, `Request failed (${response.status})`);
    throw new ApiError(normalized.message, response.status, normalized.code, body);
  }
  if (body && typeof body === "object" && "success" in body && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
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
      apiFetch<Pick<AuthResult, "accessToken" | "refreshToken">>("/auth/exchange-code", {
        method: "POST",
        anonymous: true,
        body: JSON.stringify({ code }),
      }),
    logout: (refreshToken: string) =>
      apiFetch<{ message: string }>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),
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
    update: (data: Partial<User>) =>
      apiFetch<User>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
    uploadAvatar: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return apiFetch<User>("/users/me/avatar/upload", { method: "POST", body });
    },
    settings: (data: Record<string, boolean>) =>
      apiFetch<User>("/users/me/settings", { method: "PATCH", body: JSON.stringify(data) }),
  },
  workspaces: {
    list: () => apiFetch<Workspace[]>("/workspaces"),
    create: (data: { name: string; slug: string; description?: string }) =>
      apiFetch<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(data) }),
    members: (workspaceId: string) => apiFetch<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
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
    rooms: (workspaceId: string) => apiFetch<ChatRoom[]>(`/workspaces/${workspaceId}/chat/rooms`),
    createRoom: (workspaceId: string, data: Record<string, unknown>) =>
      apiFetch<ChatRoom>(`/workspaces/${workspaceId}/chat/rooms`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    messages: (roomId: string) =>
      apiFetch<{ data: ChatMessage[]; total: number }>(`/chat/rooms/${roomId}/messages?limit=80`),
    send: (roomId: string, content: string, clientMessageId: string) =>
      apiFetch<ChatMessage>(`/chat/rooms/${roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, clientMessageId }),
      }),
    uploadAudio: (roomId: string, blob: Blob) => {
      const body = new FormData();
      body.append("file", blob, `voice-${Date.now()}.webm`);
      return apiFetch<{ storageKey: string; storageUrl: string; fileName: string; fileSize: number; mimeType: string }>(`/chat/rooms/${roomId}/attachments/audio`, { method: "POST", body });
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
  },
  notifications: {
    list: () => apiFetch<NotificationItem[]>("/notifications?limit=20"),
    readAll: () => apiFetch("/notifications/read-all", { method: "POST" }),
  },
};
