import type {
  ApiWorkspace,
  ApiMember,
  ApiProject,
  ApiTask,
  ApiWorkspaceAnalytics,
  ApiInvitation,
} from '@/lib/api';
import type { UserProfile } from '@/types';

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export const DEMO_USER_PROFILE: UserProfile = {
  name: 'Demo User',
  email: 'demo@upz.app',
  profession: 'developer',
  goal: 'manage_team',
  experience: 'intermediate',
  joinedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  authProvider: 'demo',
  role: 'admin',
};

export const DEMO_WORKSPACE: ApiWorkspace = {
  id: 'demo-workspace-001',
  name: 'Demo Workspace',
  slug: 'demo-workspace',
  description: 'Bu demo rejimida ishlayapti — backend ulanish kerak emas.',
  ownerId: 'demo-user-001',
  visibility: 'private',
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
};

export const DEMO_MEMBERS: ApiMember[] = [
  {
    id: 'dm-1',
    userId: 'demo-user-001',
    workspaceId: DEMO_WORKSPACE.id,
    role: 'owner',
    joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    user: { id: 'demo-user-001', email: 'owner@demo.com', firstName: 'Jasur', lastName: 'Karimov', createdAt: new Date(0).toISOString() },
  },
  {
    id: 'dm-2',
    userId: 'demo-user-002',
    workspaceId: DEMO_WORKSPACE.id,
    role: 'senior',
    joinedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    user: { id: 'demo-user-002', email: 'alice@demo.com', firstName: 'Alice', lastName: 'Smith', createdAt: new Date(0).toISOString() },
  },
  {
    id: 'dm-3',
    userId: 'demo-user-003',
    workspaceId: DEMO_WORKSPACE.id,
    role: 'middle',
    joinedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    user: { id: 'demo-user-003', email: 'bob@demo.com', firstName: 'Bob', lastName: 'Jones', createdAt: new Date(0).toISOString() },
  },
];

export const DEMO_PROJECTS: ApiProject[] = [
  {
    id: 'demo-project-001',
    name: 'UPZ Frontend',
    slug: 'upz-frontend',
    description: 'Main product frontend development',
    workspaceId: DEMO_WORKSPACE.id,
    status: 'active',
    priority: 'high',
    ownerId: 'demo-user-001',
    createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-project-002',
    name: 'API Backend',
    slug: 'api-backend',
    description: 'NestJS REST API',
    workspaceId: DEMO_WORKSPACE.id,
    status: 'active',
    priority: 'high',
    ownerId: 'demo-user-001',
    createdAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-project-003',
    name: 'Design System',
    slug: 'design-system',
    description: 'UI components and tokens',
    workspaceId: DEMO_WORKSPACE.id,
    status: 'planning',
    priority: 'medium',
    ownerId: 'demo-user-002',
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_TASKS: ApiTask[] = [
  { id: 'dt-1', title: 'Workspace tab navigation', status: 'done', priority: 'high', projectId: 'demo-project-001', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-001', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'dt-2', title: 'Invitation status badges', status: 'done', priority: 'high', projectId: 'demo-project-001', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-001', createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
  { id: 'dt-3', title: 'Auth refresh token 30 days', status: 'in_progress', priority: 'high', projectId: 'demo-project-002', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-001', createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'dt-4', title: 'Fix workspace tasks 400 error', status: 'in_progress', priority: 'high', projectId: 'demo-project-002', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-003', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'dt-5', title: 'Demo mode implementation', status: 'in_progress', priority: 'medium', projectId: 'demo-project-001', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-001', createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
  { id: 'dt-6', title: 'Design button components', status: 'review', priority: 'medium', projectId: 'demo-project-003', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-002', createdAt: new Date(Date.now() - 6 * 86400000).toISOString() },
  { id: 'dt-7', title: 'Color token system', status: 'todo', priority: 'medium', projectId: 'demo-project-003', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-002', createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
  { id: 'dt-8', title: 'WebSocket notifications', status: 'todo', priority: 'low', projectId: 'demo-project-002', workspaceId: DEMO_WORKSPACE.id, assigneeId: 'demo-user-003', createdAt: new Date(Date.now() - 8 * 86400000).toISOString() },
  { id: 'dt-9', title: 'Landing page A/B test', status: 'backlog', priority: 'low', projectId: 'demo-project-001', workspaceId: DEMO_WORKSPACE.id, createdAt: new Date(Date.now() - 9 * 86400000).toISOString() },
  { id: 'dt-10', title: 'Email notification templates', status: 'backlog', priority: 'low', projectId: 'demo-project-002', workspaceId: DEMO_WORKSPACE.id, createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
];

export const DEMO_ANALYTICS: ApiWorkspaceAnalytics = {
  workspaceId: DEMO_WORKSPACE.id,
  projectCount: DEMO_PROJECTS.length,
  memberCount: DEMO_MEMBERS.length,
  totalMembers: DEMO_MEMBERS.length,
  totalProjects: DEMO_PROJECTS.length,
  totalTasks: DEMO_TASKS.length,
  completedTasks: DEMO_TASKS.filter((t) => t.status === 'done').length,
  openTasks: DEMO_TASKS.filter((t) => t.status !== 'done').length,
  taskByStatus: [
    { status: 'done', count: DEMO_TASKS.filter((t) => t.status === 'done').length },
    { status: 'in_progress', count: DEMO_TASKS.filter((t) => t.status === 'in_progress').length },
    { status: 'todo', count: DEMO_TASKS.filter((t) => t.status === 'todo').length },
    { status: 'review', count: DEMO_TASKS.filter((t) => t.status === 'review').length },
    { status: 'backlog', count: DEMO_TASKS.filter((t) => t.status === 'backlog').length },
  ],
};

export const DEMO_INVITATIONS: ApiInvitation[] = [
  {
    id: 'dinv-1',
    email: 'newdev@demo.com',
    role: 'junior',
    token: 'demo-token-1',
    workspaceId: DEMO_WORKSPACE.id,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 4 * 86400000).toISOString(),
    acceptedAt: null,
    declinedAt: null,
  },
  {
    id: 'dinv-2',
    email: 'designer@demo.com',
    role: 'middle',
    token: 'demo-token-2',
    workspaceId: DEMO_WORKSPACE.id,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    acceptedAt: null,
    declinedAt: null,
  },
  {
    id: 'dinv-3',
    email: 'alice@demo.com',
    role: 'senior',
    token: 'demo-token-3',
    workspaceId: DEMO_WORKSPACE.id,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    acceptedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    declinedAt: null,
  },
];
