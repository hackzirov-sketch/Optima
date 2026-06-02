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
    expires: 7,
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
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/';
    throw { status: 401, message: 'Session expired' };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[API] ${method} ${path} failed:`, res.status, err);
    const errorObj = err?.error && typeof err.error === 'object' ? err.error : null;
    throw {
      status: res.status,
      message: errorObj?.message || (typeof err?.message === 'string' ? err.message : undefined) || err?.msg,
      code: errorObj?.code,
      redirect: errorObj?.redirect,
      requiresPasswordSetup: errorObj?.requiresPasswordSetup,
      ...err,
    };
  }

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
export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  avatarUrl?: string;
  role?: string;
  createdAt: string;
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

  getSessions: () =>
    request<{ data: ApiSession[] }>('GET', '/auth/sessions'),

  deleteSession: (id: string) =>
    request('DELETE', `/auth/sessions/${id}`),

  deleteAllSessions: () =>
    request('DELETE', '/auth/sessions'),
};

export interface ApiSession {
  id: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  lastUsedAt?: string;
}

// ─── Users ────────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: () => request<{ data: ApiUser }>('GET', '/users/me'),

  updateMe: (data: { firstName?: string; lastName?: string; username?: string; avatarUrl?: string }) =>
    request<{ data: ApiUser }>('PATCH', '/users/me', { body: data }),

  updateSettings: (settings: Record<string, unknown>) =>
    request<{ data: ApiUser }>('PATCH', '/users/me/settings', { body: settings }),

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
  visibility?: string;
  createdAt: string;
}

export interface ApiMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: string;
  user: ApiUser;
  joinedAt: string;
}

export const workspacesApi = {
  list: () => request<{ data: ApiWorkspace[] }>('GET', '/workspaces'),

  getBySlug: (slug: string) => request<{ data: ApiWorkspace }>('GET', `/workspaces/${slug}`),

  create: (data: { name: string; slug: string; description?: string; visibility?: string }) =>
    request<{ data: ApiWorkspace }>('POST', '/workspaces', { body: data }),

  update: (wsId: string, data: { name?: string; description?: string }) =>
    request<{ data: ApiWorkspace }>('PATCH', `/workspaces/${wsId}`, { body: data }),

  delete: (wsId: string) => request('DELETE', `/workspaces/${wsId}`),

  members: (wsId: string) =>
    request<{ data: ApiMember[] }>('GET', `/workspaces/${wsId}/members`),

  updateMemberRole: (wsId: string, userId: string, role: string) =>
    request('PATCH', `/workspaces/${wsId}/members/${userId}`, { body: { role } }),

  removeMember: (wsId: string, userId: string) =>
    request('DELETE', `/workspaces/${wsId}/members/${userId}`),

  invite: (wsId: string, email: string, role?: string) =>
    request('POST', `/workspaces/${wsId}/invitations`, { body: { email, role } }),

  listInvitations: (wsId: string) =>
    request<{ data: ApiInvitation[] }>('GET', `/workspaces/${wsId}/invitations`),

  cancelInvitation: (wsId: string, id: string) =>
    request('DELETE', `/workspaces/${wsId}/invitations/${id}`),
};

export interface ApiInvitation {
  id: string;
  email: string;
  role: string;
  token: string;
  workspaceId: string;
  createdAt: string;
  expiresAt: string;
}

export const invitationsApi = {
  accept: (token: string) =>
    request('POST', `/invitations/${token}/accept`),

  decline: (token: string) =>
    request('POST', `/invitations/${token}/decline`),
};

// ─── Groups ───────────────────────────────────────────────────────────────

export interface ApiGroup {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  createdAt: string;
}

export const groupsApi = {
  listByWorkspace: (workspaceId: string) =>
    request<{ data: ApiGroup[] }>('GET', `/groups/workspace/${workspaceId}`),

  getById: (id: string) => request<{ data: ApiGroup }>('GET', `/groups/${id}`),

  create: (data: { workspaceId: string; name: string; description?: string }) =>
    request<{ data: ApiGroup }>('POST', '/groups', { body: data }),

  update: (id: string, data: { name?: string; description?: string }) =>
    request<{ data: ApiGroup }>('PATCH', `/groups/${id}`, { body: data }),

  delete: (id: string) => request('DELETE', `/groups/${id}`),

  addMember: (id: string, userId: string, role?: string) =>
    request('POST', `/groups/${id}/members`, { body: { userId, role } }),

  removeMember: (id: string, userId: string) =>
    request('DELETE', `/groups/${id}/members/${userId}`),
};

// ─── Projects ─────────────────────────────────────────────────────────────

export interface ApiProject {
  id: string;
  name: string;
  slug: string;
  description?: string;
  workspaceId: string;
  groupId?: string;
  status: string;
  priority?: string;
  ownerId: string;
  startDate?: string;
  deadline?: string;
  createdAt: string;
}

export interface ApiColumn {
  id: string;
  name: string;
  order: number;
  projectId: string;
  color?: string;
}

export const projectsApi = {
  listByWorkspace: (workspaceId: string) =>
    request<{ data: ApiProject[] }>('GET', `/projects/workspace/${workspaceId}`),

  getById: (id: string) => request<{ data: ApiProject }>('GET', `/projects/${id}`),

  create: (data: {
    workspaceId: string;
    name: string;
    slug: string;
    description?: string;
    groupId?: string;
    status?: string;
    priority?: string;
    startDate?: string;
    deadline?: string;
  }) => request<{ data: ApiProject }>('POST', '/projects', { body: data }),

  update: (id: string, data: Partial<Omit<ApiProject, 'id' | 'createdAt'>>) =>
    request<{ data: ApiProject }>('PATCH', `/projects/${id}`, { body: data }),

  delete: (id: string) => request('DELETE', `/projects/${id}`),

  createColumn: (projectId: string, data: { name: string; order?: number; color?: string }) =>
    request<{ data: ApiColumn }>('POST', `/projects/${projectId}/columns`, { body: data }),

  updateColumn: (projectId: string, columnId: string, data: { name?: string; order?: number; color?: string }) =>
    request<{ data: ApiColumn }>('PATCH', `/projects/${projectId}/columns/${columnId}`, { body: data }),

  deleteColumn: (projectId: string, columnId: string) =>
    request('DELETE', `/projects/${projectId}/columns/${columnId}`),
};

// ─── Tasks ────────────────────────────────────────────────────────────────

export interface ApiTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  type?: string;
  priority: string;
  assigneeId?: string;
  reviewerId?: string;
  columnId?: string;
  projectId: string;
  workspaceId: string;
  parentTaskId?: string;
  storyPoints?: number;
  estimatedHours?: number;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
}

export interface CreateTaskDto {
  projectId: string;
  workspaceId: string;
  title: string;
  description?: string;
  columnId?: string;
  assigneeId?: string;
  reviewerId?: string;
  priority?: string;
  status?: string;
  type?: string;
  storyPoints?: number;
  estimatedHours?: number;
  startDate?: string;
  dueDate?: string;
}

export const tasksApi = {
  listByProject: (projectId: string, params?: Record<string, string>) =>
    request<{ data: ApiTask[] }>('GET', `/projects/${projectId}/tasks`, { params }),

  getById: (taskId: string) =>
    request<{ data: ApiTask }>('GET', `/tasks/${taskId}`),

  create: (data: CreateTaskDto) =>
    request<{ data: ApiTask }>('POST', '/tasks', { body: data }),

  update: (taskId: string, data: Partial<CreateTaskDto>) =>
    request<{ data: ApiTask }>('PATCH', `/tasks/${taskId}`, { body: data }),

  move: (taskId: string, data: { columnId?: string; status?: string; order?: number }) =>
    request<{ data: ApiTask }>('PATCH', `/tasks/${taskId}/move`, { body: data }),

  delete: (taskId: string) =>
    request('DELETE', `/tasks/${taskId}`),

  getActivities: (taskId: string) =>
    request<{ data: ApiActivity[] }>('GET', `/tasks/${taskId}/activities`),

  watch: (taskId: string) =>
    request('POST', `/tasks/${taskId}/watch`),

  unwatch: (taskId: string) =>
    request('DELETE', `/tasks/${taskId}/watch`),

  getWatchers: (taskId: string) =>
    request<{ data: ApiUser[] }>('GET', `/tasks/${taskId}/watchers`),

  addTag: (taskId: string, name: string) =>
    request('POST', `/tasks/${taskId}/tags`, { body: { name } }),

  removeTag: (taskId: string, tagId: string) =>
    request('DELETE', `/tasks/${taskId}/tags/${tagId}`),
};

export interface ApiActivity {
  id: string;
  taskId: string;
  userId: string;
  type: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

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

  getRoom: (roomId: string) =>
    request<{ data: ApiChatRoom }>('GET', `/chat/rooms/${roomId}`),

  getMessages: (roomId: string, page = 1, limit = 50) =>
    request<{ data: ApiChatMessage[]; total: number }>('GET', `/chat/rooms/${roomId}/messages`, {
      params: { page, limit },
    }),

  sendMessage: (roomId: string, text: string, replyToId?: string) =>
    request<{ data: ApiChatMessage }>('POST', `/chat/rooms/${roomId}/messages`, {
      body: { text, replyToId },
    }),

  editMessage: (messageId: string, text: string) =>
    request<{ data: ApiChatMessage }>('PATCH', `/chat/messages/${messageId}`, { body: { text } }),

  deleteMessage: (messageId: string) =>
    request('DELETE', `/chat/messages/${messageId}`),

  addReaction: (messageId: string, emoji: string) =>
    request('POST', `/chat/messages/${messageId}/reactions`, { body: { emoji } }),

  removeReaction: (messageId: string, emoji: string) =>
    request('DELETE', `/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`),
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

// ─── Analytics ────────────────────────────────────────────────────────────

export const analyticsApi = {
  getWorkspaceOverview: (workspaceId: string) =>
    request<{ data: ApiWorkspaceAnalytics }>('GET', `/workspaces/${workspaceId}/analytics/overview`),

  getProjectAnalytics: (projectId: string) =>
    request('GET', `/projects/${projectId}/analytics`),

  getProjectDevelopers: (projectId: string) =>
    request('GET', `/projects/${projectId}/analytics/developers`),

  getMyAnalytics: () =>
    request('GET', '/users/me/analytics'),
};

export interface ApiWorkspaceAnalytics {
  totalMembers?: number;
  totalProjects?: number;
  totalTasks?: number;
  completedTasks?: number;
  openTasks?: number;
}

// ─── Pushes ───────────────────────────────────────────────────────────────

export interface ApiPush {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: string;
  repoUrl?: string;
  branch?: string;
  commitHash?: string;
  createdAt: string;
}

export interface ApiPushComment {
  id: string;
  pushId: string;
  userId: string;
  text: string;
  resolved?: boolean;
  createdAt: string;
}

export const pushesApi = {
  listMine: (params?: { page?: number; limit?: number; status?: string }) =>
    request<{ data: ApiPush[]; total: number }>('GET', '/pushes', { params: params as Record<string, string | number | boolean> }),

  getById: (pushId: string) =>
    request<{ data: ApiPush }>('GET', `/pushes/${pushId}`),

  submit: (data: { title: string; description?: string; repoUrl?: string; branch?: string; commitHash?: string }) =>
    request<{ data: ApiPush }>('POST', '/pushes', { body: data }),

  approve: (pushId: string) =>
    request('PATCH', `/pushes/${pushId}/approve`),

  reject: (pushId: string) =>
    request('PATCH', `/pushes/${pushId}/reject`),

  getComments: (pushId: string) =>
    request<{ data: ApiPushComment[] }>('GET', `/pushes/${pushId}/comments`),

  addComment: (pushId: string, text: string) =>
    request<{ data: ApiPushComment }>('POST', `/pushes/${pushId}/comments`, { body: { text } }),

  updateComment: (pushId: string, commentId: string, text: string) =>
    request<{ data: ApiPushComment }>('PATCH', `/pushes/${pushId}/comments/${commentId}`, { body: { text } }),

  deleteComment: (pushId: string, commentId: string) =>
    request('DELETE', `/pushes/${pushId}/comments/${commentId}`),

  resolveComment: (pushId: string, commentId: string) =>
    request('PATCH', `/pushes/${pushId}/comments/${commentId}/resolve`),
};

export default {
  auth: authApi,
  users: usersApi,
  workspaces: workspacesApi,
  invitations: invitationsApi,
  groups: groupsApi,
  projects: projectsApi,
  tasks: tasksApi,
  chat: chatApi,
  notifications: notificationsApi,
  analytics: analyticsApi,
  pushes: pushesApi,
};
