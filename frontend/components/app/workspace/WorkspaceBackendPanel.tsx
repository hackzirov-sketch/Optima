'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, CheckCircle2, Loader2, Plus, Trash2, Users } from 'lucide-react';
import {
  ActionButton,
  Pill,
  SectionTitle,
  SurfaceCard,
} from '@/components/app/DesignSystem';
import type { ApiMember, ApiProject, ApiWorkspace, ApiWorkspaceAnalytics } from '@/lib/api';
import { CreateProjectModal } from '@/components/app/CreateProjectModal';
import { CreateTaskModal } from '@/components/app/CreateTaskModal';

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
  onInvite,
  onUpdateRole,
  onRemoveMember,
  onNotice,
}: WorkspaceBackendPanelProps) {
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<(typeof INVITE_ROLES)[number]>('junior');
  const [invSending, setInvSending] = useState(false);

  const totalProjects = analytics?.projectCount ?? analytics?.totalProjects ?? projects.length;
  const totalMembers = analytics?.memberCount ?? analytics?.totalMembers ?? members.length;
  const totalTasks = analytics?.totalTasks ?? 0;
  const openTasks = analytics?.openTasks ?? 0;

  const handleProjectCreated = async (project: ApiProject) => {
    setShowCreateProject(false);
    await onRefreshProjects();
    await onRefreshAnalytics();
    onNotice(`"${project.name}" loyihasi yaratildi`);
  };

  const handleTaskCreated = async () => {
    await Promise.all([onRefreshAnalytics(), onRefreshTasks()]);
    onNotice('Task yaratildi va tayinlandi');
  };

  const handleInvite = async () => {
    if (!invEmail.trim()) return;
    setInvSending(true);
    try {
      await onInvite(invEmail.trim(), invRole);
      setInvEmail('');
      await onRefreshMembers();
      onNotice('Taklif yuborildi');
    } catch {
      onNotice('Taklif yuborib bo\'lmadi');
    } finally {
      setInvSending(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await onUpdateRole(userId, role);
      onNotice('A\'zo roli yangilandi');
    } catch {
      onNotice('Rolni yangilab bo\'lmadi');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await onRemoveMember(userId);
      await onRefreshMembers();
      await onRefreshAnalytics();
      onNotice('A\'zo o\'chirildi');
    } catch {
      onNotice('A\'zoni o\'chirib bo\'lmadi');
    }
  };

  return (
    <>
      {showCreateProject && (
        <CreateProjectModal
          workspaceId={workspace.id}
          members={members}
          onCreated={handleProjectCreated}
          onClose={() => setShowCreateProject(false)}
        />
      )}
      {showCreateTask && (
        <CreateTaskModal
          workspaceId={workspace.id}
          projects={projects}
          members={members}
          onCreated={handleTaskCreated}
          onClose={() => setShowCreateTask(false)}
        />
      )}

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
                { label: 'Loyihalar', value: totalProjects },
                { label: 'A\'zolar', value: totalMembers },
                { label: 'Tasklar', value: totalTasks },
                { label: 'Ochiq tasklar', value: openTasks },
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
          <div className="flex items-center justify-between">
            <SectionTitle icon={Briefcase} title="Loyihalar" description="Workspace loyihalarini boshqarish." />
            <ActionButton onClick={() => setShowCreateProject(true)} className="h-9 px-4 text-xs">
              <Plus className="h-3.5 w-3.5" /> Yangi
            </ActionButton>
          </div>
          <div className="mt-4 space-y-2">
            {projectsLoading && (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Yuklanmoqda…
              </p>
            )}
            {!projectsLoading && projects.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-muted-foreground">Loyiha yo'q</p>
                <button
                  type="button"
                  onClick={() => setShowCreateProject(true)}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Birinchi loyihani yarating →
                </button>
              </div>
            )}
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/projects`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted px-4 py-3 transition-colors hover:bg-card"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{project.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs capitalize text-muted-foreground">{project.status}</p>
                    {project.deadline && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-md font-semibold">
                        {new Date(project.deadline).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <Pill tone="blue">Ochish</Pill>
              </Link>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="flex items-center justify-between">
            <SectionTitle icon={CheckCircle2} title="Tasklar" description="Task yaratish va tayinlash." />
            <ActionButton
              onClick={() => setShowCreateTask(true)}
              disabled={!projects.length}
              className="h-9 px-4 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Yangi
            </ActionButton>
          </div>
          {!projects.length && (
            <p className="mt-4 text-sm text-muted-foreground">Task qo'shish uchun avval loyiha yarating.</p>
          )}
        </SurfaceCard>

        <div id="workspace-team">
          <SurfaceCard>
            <SectionTitle icon={Users} title="Jamoa" description="A'zolar va takliflar." />
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
                {invSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Taklif'}
              </ActionButton>
            </div>

            <div className="mt-4 space-y-2">
              {membersLoading && (
                <p className="text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Yuklanmoqda…
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
    </>
  );
}
