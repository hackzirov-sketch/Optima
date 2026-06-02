'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Loader2, Plus, Trash2, Users } from 'lucide-react';
import {
  ActionButton,
  Pill,
  SectionTitle,
  SurfaceCard,
} from '@/components/app/DesignSystem';
import type { ApiMember, ApiProject, ApiWorkspace, ApiWorkspaceAnalytics } from '@/lib/api';
import { tasksApi } from '@/lib/api';

const MEMBER_ROLES = ['guest', 'junior', 'middle', 'senior', 'lead', 'admin'] as const;
const INVITE_ROLES = ['guest', 'junior', 'middle', 'senior', 'lead', 'admin'] as const;

interface WorkspaceBackendPanelProps {
  workspace: ApiWorkspace;
  analytics: ApiWorkspaceAnalytics | null;
  analyticsLoading: boolean;
  members: ApiMember[];
  membersLoading: boolean;
  projects: ApiProject[];
  projectsLoading: boolean;
  onRefreshMembers: () => Promise<void>;
  onRefreshProjects: () => Promise<void>;
  onRefreshAnalytics: () => Promise<void>;
  onRefreshTasks: () => Promise<void>;
  onCreateProject: (name: string, description?: string) => Promise<ApiProject>;
  onInvite: (email: string, role: string) => Promise<void>;
  onUpdateRole: (userId: string, role: string) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onNotice: (message: string) => void;
}

function memberDisplayName(member: ApiMember) {
  if (!member.user) return 'Unknown';
  const full = `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim();
  return full || member.user.email;
}

export function WorkspaceBackendPanel({
  workspace,
  analytics,
  analyticsLoading,
  members,
  membersLoading,
  projects,
  projectsLoading,
  onRefreshMembers,
  onRefreshProjects,
  onRefreshAnalytics,
  onRefreshTasks,
  onCreateProject,
  onInvite,
  onUpdateRole,
  onRemoveMember,
  onNotice,
}: WorkspaceBackendPanelProps) {
  const [projectName, setProjectName] = useState('');
  const [projectCreating, setProjectCreating] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskProjectId, setTaskProjectId] = useState('');
  const [taskCreating, setTaskCreating] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<(typeof INVITE_ROLES)[number]>('junior');
  const [invSending, setInvSending] = useState(false);

  const totalProjects = analytics?.projectCount ?? analytics?.totalProjects ?? projects.length;
  const totalMembers = analytics?.memberCount ?? analytics?.totalMembers ?? members.length;
  const totalTasks = analytics?.totalTasks ?? 0;
  const openTasks = analytics?.openTasks ?? 0;

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    setProjectCreating(true);
    try {
      await onCreateProject(projectName.trim());
      setProjectName('');
      await onRefreshProjects();
      await onRefreshAnalytics();
      onNotice('Project created');
    } catch {
      onNotice('Could not create project');
    } finally {
      setProjectCreating(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !taskProjectId) return;
    setTaskCreating(true);
    try {
      await tasksApi.create({
        projectId: taskProjectId,
        workspaceId: workspace.id,
        title: taskTitle.trim(),
        status: 'todo',
        priority: 'medium',
      });
      setTaskTitle('');
      await Promise.all([onRefreshAnalytics(), onRefreshTasks()]);
      onNotice('Task created');
    } catch {
      onNotice('Could not create task');
    } finally {
      setTaskCreating(false);
    }
  };

  const handleInvite = async () => {
    if (!invEmail.trim()) return;
    setInvSending(true);
    try {
      await onInvite(invEmail.trim(), invRole);
      setInvEmail('');
      await onRefreshMembers();
      onNotice('Invitation sent');
    } catch {
      onNotice('Could not send invitation');
    } finally {
      setInvSending(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await onUpdateRole(userId, role);
      onNotice('Member role updated');
    } catch {
      onNotice('Could not update role');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await onRemoveMember(userId);
      await onRefreshMembers();
      await onRefreshAnalytics();
      onNotice('Member removed');
    } catch {
      onNotice('Could not remove member');
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <SurfaceCard className="xl:col-span-3">
        <SectionTitle
          icon={Briefcase}
          title="Workspace overview"
          description="Live stats from the backend for this workspace."
        />
        {analyticsLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading analytics…
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Projects', value: totalProjects },
              { label: 'Members', value: totalMembers },
              { label: 'Tasks', value: totalTasks },
              { label: 'Open tasks', value: openTasks },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-border bg-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <SectionTitle icon={Briefcase} title="Projects" description="Create and open workspace projects." />
        <div className="mt-4 flex gap-2">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            placeholder="New project name"
            className="min-w-0 flex-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-[var(--upz-nav-brand)] focus:bg-card"
          />
          <ActionButton onClick={handleCreateProject} disabled={projectCreating || !projectName.trim()} className="py-2">
            {projectCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </ActionButton>
        </div>
        <div className="mt-4 space-y-2">
          {projectsLoading && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading projects…
            </p>
          )}
          {!projectsLoading && projects.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects yet. Create one above.</p>
          )}
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/app/projects`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted px-4 py-3 transition-colors hover:bg-card"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{project.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{project.status}</p>
              </div>
              <Pill tone="blue">Open</Pill>
            </Link>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionTitle icon={Plus} title="Quick task" description="Add a task to an existing project." />
        <div className="mt-4 space-y-2">
          <select
            value={taskProjectId}
            onChange={(e) => setTaskProjectId(e.target.value)}
            className="w-full rounded-2xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-[var(--upz-nav-brand)]"
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
              placeholder="Task title"
              disabled={!projects.length}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-[var(--upz-nav-brand)] focus:bg-card disabled:opacity-50"
            />
            <ActionButton
              onClick={handleCreateTask}
              disabled={taskCreating || !taskTitle.trim() || !taskProjectId}
              className="py-2"
            >
              {taskCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </ActionButton>
          </div>
        </div>
      </SurfaceCard>

      <div id="workspace-team">
      <SurfaceCard>
        <SectionTitle icon={Users} title="Team" description="Members and invitations backed by the API." />
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={invEmail}
            onChange={(e) => setInvEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            placeholder="colleague@email.com"
            className="min-w-[12rem] flex-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-[var(--upz-nav-brand)]"
          />
          <select
            value={invRole}
            onChange={(e) => setInvRole(e.target.value as (typeof INVITE_ROLES)[number])}
            className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs font-semibold outline-none"
          >
            {INVITE_ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <ActionButton onClick={handleInvite} disabled={invSending || !invEmail.trim()} className="py-2">
            {invSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invite'}
          </ActionButton>
        </div>

        <div className="mt-4 space-y-2">
          {membersLoading && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading members…
            </p>
          )}
          {!membersLoading && members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{memberDisplayName(member)}</p>
                <p className="truncate text-xs text-muted-foreground">{member.user?.email}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                  disabled={member.role === 'owner'}
                  className="rounded-xl border border-border bg-card px-2 py-1.5 text-xs font-semibold capitalize outline-none disabled:opacity-60"
                >
                  {MEMBER_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                  {member.role === 'owner' && <option value="owner">owner</option>}
                </select>
                {member.role !== 'owner' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.userId)}
                    className="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-600"
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
      </div>
    </div>
  );
}
