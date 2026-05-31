import cookie from "js-cookie"

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';

// ─── Token management ─────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('upz_access_token');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('upz_access_token', accessToken);
  cookie.set('upz_refresh_token', refreshToken, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: 7, // 7 days
  });
}

export function clearTokens() {
  localStorage.removeItem('upz_access_token');
  cookie.remove('upz_refresh_token', { path: '/' });
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return cookie.get('upz_refresh_token') || null;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  skipAuth?: boolean;
}

async function request<T = unknown>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, params, skipAuth } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).reduce(
        (acc, [k, v]) => ({ ...acc, [k]: String(v) }),
        {} as Record<string, string>,
      ),
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
    cache: 'no-store',
  });

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      const retry = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'include',
        cache: 'no-store',
      });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({}));
        throw { status: retry.status, ...(err as object) };
      }
      return retry.json() as Promise<T>;
    }
    // Refresh failed → clear tokens
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/';
    throw { status: 401, message: 'Session expired' };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[API] ${method} ${path} failed:`, res.status, err);
    throw { 
      status: res.status, 
      message: err?.message || err?.error || err?.msg,
      ...err 
    };
  }

  // 204 No Content
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.data?.accessToken) {
      setTokens(data.data.accessToken, data.data.refreshToken || rt);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface LoginDto { email: string; password: string }
export interface RegisterDto { 
  email: string
  password: string
  firstName: string
  lastName: string
  username: string
  phoneNumber?: number
}
export interface AuthResponse { accessToken: string; refreshToken: string; user: ApiUser }
export interface VerifyEmailResponse extends AuthResponse { redirect?: string }

export const authApi = {
  login: (dto: LoginDto) =>
    request<{ data: AuthResponse }>('POST', '/auth/login', { body: dto, skipAuth: true }),

  register: (dto: RegisterDto) =>
    request<{ data: AuthResponse }>('POST', '/auth/register', { body: dto, skipAuth: true }),

  refresh: (refreshToken: string) =>
    request<{ data: { accessToken: string; refreshToken: string } }>('POST', '/auth/refresh', {
      body: { refreshToken },
      skipAuth: true,
    }),

  logout: () => request('POST', '/auth/logout'),

  me: () => request<{ data: ApiUser }>('GET', '/users/me'),

  verifyEmail: (code: string) =>
    request<VerifyEmailResponse>('POST', '/auth/verify-email', { body: { code }, skipAuth: true }),

  setPassword: (password: string) =>
    request('POST', '/auth/set-password', { body: { password } }),

  forgotPassword: (email: string) =>
    request('POST', '/auth/forgot-password', { body: { email }, skipAuth: true }),

  resetPassword: (token: string, password: string) =>
    request('POST', '/auth/reset-password', { body: { token, password }, skipAuth: true }),
};

// ─── Users ────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  avatarUrl?: string;
  createdAt: string;
}

export const usersApi = {
  getMe: () => request<{ data: ApiUser }>('GET', '/users/me'),

  updateMe: (data: Partial<ApiUser>) =>
    request<{ data: ApiUser }>('PATCH', '/users/me', { body: data }),

  getById: (id: string) => request<{ data: ApiUser }>('GET', `/users/${id}`),
};

// ─── Workspaces ───────────────────────────────────────────────────────────

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  ownerId: string;
  createdAt: string;
}

export const workspacesApi = {
  list: () => request<{ data: ApiWorkspace[] }>('GET', '/workspaces'),

  getOne: (id: string) => request<{ data: ApiWorkspace }>('GET', `/workspaces/${id}`),

  create: (data: { name: string; slug: string; description?: string }) =>
    request<{ data: ApiWorkspace }>('POST', '/workspaces', { body: data }),

  update: (id: string, data: Partial<ApiWorkspace>) =>
    request<{ data: ApiWorkspace }>('PATCH', `/workspaces/${id}`, { body: data }),

  members: (id: string) =>
    request<{ data: ApiUser[] }>('GET', `/workspaces/${id}/members`),

  invite: (id: string, email: string, role?: string) =>
    request('POST', `/workspaces/${id}/invite`, { body: { email, role } }),
};

// ─── Chat ─────────────────────────────────────────────────────────────────

export interface ApiChatRoom {
  id: string;
  name: string;
  type: string;
  workspaceId: string;
  memberIds: string[];
  lastMessage?: ApiChatMessage;
  unreadCount?: number;
  createdAt: string;
}

export interface ApiChatMessage {
  id: string;
  roomId: string;
  userId: string;
  text: string;
  replyToId?: string;
  timestamp: number;
  edited?: boolean;
  reactions?: { emoji: string; userIds: string[] }[];
  attachments?: { id: string; url: string; name: string; size: number }[];
}

export const chatApi = {
  listRooms: (workspaceId: string) =>
    request<{ data: ApiChatRoom[] }>('GET', `/workspaces/${workspaceId}/chat/rooms`),

  createRoom: (workspaceId: string, data: { name: string; type: string; memberIds?: string[] }) =>
    request<{ data: ApiChatRoom }>('POST', `/workspaces/${workspaceId}/chat/rooms`, { body: data }),

  getMessages: (roomId: string, page = 1, limit = 50) =>
    request<{ data: ApiChatMessage[]; total: number }>('GET', `/chat/rooms/${roomId}/messages`, {
      params: { page, limit },
    }),

  sendMessage: (roomId: string, text: string, replyToId?: string) =>
    request<{ data: ApiChatMessage }>('POST', `/chat/rooms/${roomId}/messages`, {
      body: { text, replyToId },
    }),

  editMessage: (roomId: string, messageId: string, text: string) =>
    request<{ data: ApiChatMessage }>('PATCH', `/chat/rooms/${roomId}/messages/${messageId}`, {
      body: { text },
    }),

  deleteMessage: (roomId: string, messageId: string) =>
    request('DELETE', `/chat/rooms/${roomId}/messages/${messageId}`),

  addReaction: (roomId: string, messageId: string, emoji: string) =>
    request('POST', `/chat/rooms/${roomId}/messages/${messageId}/reactions`, { body: { emoji } }),
};

// ─── Notifications ────────────────────────────────────────────────────────

export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  actorId?: string;
  actor?: ApiUser;
  resourceType?: string;
  resourceId?: string;
  createdAt: string;
}

export const notificationsApi = {
  list: (page = 1, limit = 30) =>
    request<{ data: { data: ApiNotification[]; total: number; page: number } }>('GET', '/notifications', {
      params: { page, limit },
    }),

  markRead: (id: string) => request('PATCH', `/notifications/${id}/read`),

  markAllRead: () => request('POST', '/notifications/read-all'),
};

// ─── Tasks ────────────────────────────────────────────────────────────────

export interface ApiTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeId?: string;
  dueDate?: string;
  projectId?: string;
  workspaceId: string;
  createdAt: string;
}

export const tasksApi = {
  list: (workspaceId: string, params?: Record<string, string>) =>
    request<{ data: ApiTask[] }>('GET', `/workspaces/${workspaceId}/tasks`, { params }),

  create: (workspaceId: string, data: Partial<ApiTask>) =>
    request<{ data: ApiTask }>('POST', `/workspaces/${workspaceId}/tasks`, { body: data }),

  update: (taskId: string, data: Partial<ApiTask>) =>
    request<{ data: ApiTask }>('PATCH', `/tasks/${taskId}`, { body: data }),

  delete: (taskId: string) => request('DELETE', `/tasks/${taskId}`),
};

// ─── Projects ─────────────────────────────────────────────────────────────

export interface ApiProject {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  status: string;
  ownerId: string;
  createdAt: string;
}

export const projectsApi = {
  list: (workspaceId: string) =>
    request<{ data: ApiProject[] }>('GET', `/workspaces/${workspaceId}/projects`),

  create: (workspaceId: string, data: { name: string; description?: string }) =>
    request<{ data: ApiProject }>('POST', `/workspaces/${workspaceId}/projects`, { body: data }),

  update: (projectId: string, data: Partial<ApiProject>) =>
    request<{ data: ApiProject }>('PATCH', `/projects/${projectId}`, { body: data }),
};

// ─── Analytics ────────────────────────────────────────────────────────────

export const analyticsApi = {
  getDeveloperStats: (workspaceId: string, period?: string) =>
    request('GET', `/workspaces/${workspaceId}/analytics/developer`, {
      params: period ? { period } : {},
    }),

  getProjectStats: (workspaceId: string) =>
    request('GET', `/workspaces/${workspaceId}/analytics/project`),
};

export default {
  auth: authApi,
  users: usersApi,
  workspaces: workspacesApi,
  chat: chatApi,
  notifications: notificationsApi,
  tasks: tasksApi,
  projects: projectsApi,
  analytics: analyticsApi,
};
