'use client';

import { useState, useMemo, useCallback } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  FolderKanban,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ActionButton,
  Modal,
  PageHeader,
  PageShell,
  Pill,
  SectionTitle,
  SurfaceCard,
  Toast,
  cn,
} from "@/components/app/DesignSystem";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { useMembers } from "@/hooks/useMembers";
import { useGroups } from "@/hooks/useGroups";
import { useProjects } from "@/hooks/useProjects";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { useNotifications } from "@/hooks/useNotifications";

const MEMBER_COLORS = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
];

function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

function roleTone(role: string): 'indigo' | 'green' | 'amber' | 'slate' {
  if (role === 'owner') return 'indigo';
  if (role === 'admin') return 'green';
  if (role === 'member') return 'amber';
  return 'slate';
}

function taskStatusTone(status: string): 'green' | 'blue' | 'amber' | 'slate' {
  if (status === 'done') return 'green';
  if (status === 'in_progress') return 'blue';
  if (status === 'review') return 'amber';
  return 'slate';
}

function taskStatusLabel(status: string) {
  const map: Record<string, string> = {
    done: 'Done',
    in_progress: 'In Progress',
    review: 'Review',
    todo: 'To Do',
    backlog: 'Backlog',
  };
  return map[status] ?? status;
}

export default function Page() {
  const { t } = useTranslation();
  const { activeWorkspace } = useWorkspace();
  const { backendUser } = useAuth();
  const { members, loading: membersLoading, invite, removeMember, updateRole } = useMembers(activeWorkspace?.id);
  const { groups, loading: groupsLoading, createGroup, deleteGroup } = useGroups(activeWorkspace?.id);
  const { projects, loading: projectsLoading } = useProjects(activeWorkspace?.id);
  const { tasks, loading: tasksLoading } = useAllWorkspaceTasks(activeWorkspace?.id);
  const { notifications, unreadCount, markRead } = useNotifications();

  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);

  // Group form
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }, []);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) =>
      `${m.user.firstName} ${m.user.lastName} ${m.user.email}`.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const detailMember = useMemo(
    () => members.find((m) => m.userId === detailMemberId),
    [members, detailMemberId],
  );

  const memberTasks = useMemo(() => {
    if (!detailMemberId) return [];
    return tasks.filter((t) => t.assigneeId === detailMemberId);
  }, [tasks, detailMemberId]);

  // Stats
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const reviewTasks = tasks.filter((t) => t.status === 'review').length;

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !activeWorkspace) return;
    setInviting(true);
    try {
      await invite(inviteEmail.trim(), inviteRole);
      setInviteEmail(""); setInviteRole("member");
      setInviteOpen(false);
      showToast("Invitation sent");
    } catch {
      showToast("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setSavingGroup(true);
    try {
      await createGroup(groupName.trim(), groupDesc.trim() || undefined);
      setGroupName(""); setGroupDesc("");
      setGroupOpen(false);
      showToast("Group created");
    } catch {
      showToast("Failed to create group");
    } finally {
      setSavingGroup(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the workspace?`)) return;
    try {
      await removeMember(userId);
      showToast(`${name} removed`);
      if (detailMemberId === userId) setDetailMemberId(null);
    } catch {
      showToast("Failed to remove member");
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateRole(userId, newRole as 'member' | 'admin');
      showToast("Role updated");
    } catch {
      showToast("Failed to update role");
    }
  };

  const isSelf = (userId: string) => userId === backendUser?.id;
  const isOwner = members.find((m) => m.userId === backendUser?.id)?.role === 'owner';
  const isAdmin = ['owner', 'admin'].includes(members.find((m) => m.userId === backendUser?.id)?.role ?? '');

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={t("app.teams.eyebrow", "Workspace")}
          title={t("app.teams.title", "Teams")}
          description={t("app.teams.description", "Manage your workspace members, groups, and track team progress.")}
        >
          {isAdmin && (
            <ActionButton onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite
            </ActionButton>
          )}
          <ActionButton variant="secondary" onClick={() => setGroupOpen(true)}>
            <Plus className="h-4 w-4" /> New group
          </ActionButton>
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </PageHeader>

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Members", value: members.length, icon: Users, tone: "indigo", loading: membersLoading },
            { label: "Projects", value: projects.length, icon: FolderKanban, tone: "blue", loading: projectsLoading },
            { label: "Tasks done", value: doneTasks, icon: CheckCircle2, tone: "green", loading: tasksLoading },
            { label: "In progress", value: inProgressTasks, icon: UserCheck, tone: "amber", loading: tasksLoading },
          ].map(({ label, value, icon: Icon, tone, loading }) => (
            <SurfaceCard key={label} className="flex items-center gap-4">
              <div className={cn(
                "grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl",
                tone === 'indigo' && 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
                tone === 'blue' && 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
                tone === 'green' && 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400',
                tone === 'amber' && 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                {loading ? (
                  <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <p className="mt-0.5 text-2xl font-black text-foreground">{value}</p>
                )}
              </div>
            </SurfaceCard>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          {/* Members list */}
          <SurfaceCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionTitle icon={Users} title="Members" description={`${members.length} workspace members`} />
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 focus-within:border-indigo-300 focus-within:bg-card">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search members…"
                  className="w-32 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {membersLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {searchQuery ? 'No members match your search.' : 'No members yet. Invite your team.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((member, i) => {
                  const name = `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() || member.user.email;
                  const memberTaskCount = tasks.filter((t) => t.assigneeId === member.userId).length;
                  const self = isSelf(member.userId);

                  return (
                    <div
                      key={member.id}
                      className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-indigo-200 dark:hover:border-indigo-800"
                    >
                      {/* Avatar */}
                      <div
                        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl text-sm font-black text-white"
                        style={{ background: `linear-gradient(135deg, ${MEMBER_COLORS[i % MEMBER_COLORS.length]}, ${MEMBER_COLORS[(i + 3) % MEMBER_COLORS.length]})` }}
                      >
                        {initials(member.user.firstName, member.user.lastName)}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-foreground">{name}</span>
                          {self && <Pill tone="indigo">You</Pill>}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                      </div>

                      {/* Role badge */}
                      <Pill tone={roleTone(member.role)}>{member.role}</Pill>

                      {/* Task count */}
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {memberTaskCount} tasks
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setDetailMemberId(member.userId)}
                          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="View details"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {isAdmin && !self && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.userId, name)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                            title="Remove member"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetailMemberId(member.userId)}
                          className="h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground hidden sm:grid"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SurfaceCard>

          {/* Right column: groups + projects */}
          <div className="flex flex-col gap-5">
            {/* Groups */}
            <SurfaceCard>
              <div className="mb-3 flex items-center justify-between">
                <SectionTitle icon={Users} title="Groups" description="Team sub-groups" />
                <button
                  type="button"
                  onClick={() => setGroupOpen(true)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-indigo-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {groupsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : groups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground">
                  No groups yet.
                  <button type="button" onClick={() => setGroupOpen(true)} className="ml-1 text-indigo-500 hover:underline">Create one</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div key={group.id} className="group flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5">
                      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{group.name}</p>
                        {group.description && (
                          <p className="truncate text-xs text-muted-foreground">{group.description}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteGroup(group.id).then(() => showToast('Group deleted')).catch(() => showToast('Failed'))}
                          className="h-6 w-6 place-items-center rounded text-muted-foreground hover:text-rose-600 hidden group-hover:grid"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>

            {/* Projects summary */}
            <SurfaceCard className="flex-1">
              <SectionTitle icon={FolderKanban} title="Projects" description="Workspace projects" />
              {projectsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground">
                  No projects yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 8).map((project) => {
                    const projTasks = tasks.filter((t) => t.projectId === project.id);
                    const projDone = projTasks.filter((t) => t.status === 'done').length;
                    const pct = projTasks.length > 0 ? Math.round((projDone / projTasks.length) * 100) : 0;
                    return (
                      <div key={project.id} className="rounded-xl border border-border bg-muted px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-bold text-foreground">{project.name}</p>
                          <span className="flex-shrink-0 text-xs font-medium text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{projDone}/{projTasks.length} tasks done</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>

        {/* Task overview */}
        <SurfaceCard>
          <div className="mb-4 flex items-start justify-between gap-4">
            <SectionTitle
              icon={CheckCircle2}
              title="Task overview"
              description="All workspace tasks by status."
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill tone="green">Done: {doneTasks}</Pill>
              <Pill tone="blue">In progress: {inProgressTasks}</Pill>
              <Pill tone="amber">Review: {reviewTasks}</Pill>
              <Pill tone="slate">Other: {tasks.length - doneTasks - inProgressTasks - reviewTasks}</Pill>
            </div>
          </div>
          {tasksLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No tasks yet. Create tasks in your projects.
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 12).map((task) => {
                const assignee = members.find((m) => m.userId === task.assigneeId);
                const assigneeName = assignee
                  ? `${assignee.user.firstName ?? ''} ${assignee.user.lastName ?? ''}`.trim()
                  : null;

                return (
                  <div key={task.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-indigo-200 dark:hover:border-indigo-800">
                    <div className={cn(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      task.status === 'done' ? 'bg-green-500' :
                      task.status === 'in_progress' ? 'bg-blue-500' :
                      task.status === 'review' ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                    )} />
                    <span className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium",
                      task.status === 'done' && 'text-muted-foreground line-through',
                    )}>
                      {task.title}
                    </span>
                    {assigneeName && (
                      <span className="hidden text-xs text-muted-foreground sm:block">{assigneeName}</span>
                    )}
                    <Pill tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</Pill>
                    {task.dueDate && (
                      <span className={cn(
                        "hidden text-xs sm:block",
                        new Date(task.dueDate) < new Date() && task.status !== 'done'
                          ? 'text-rose-600' : 'text-muted-foreground',
                      )}>
                        {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                );
              })}
              {tasks.length > 12 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  +{tasks.length - 12} more tasks in Projects
                </p>
              )}
            </div>
          )}
        </SurfaceCard>

        {/* Invite modal */}
        <Modal
          open={inviteOpen}
          title="Invite member"
          description="Send an invitation to join your workspace."
          onClose={() => setInviteOpen(false)}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
                placeholder="name@company.com"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              >
                <option value="member">Member</option>
                {isOwner && <option value="admin">Admin</option>}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</ActionButton>
              <ActionButton onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Send invite
              </ActionButton>
            </div>
          </div>
        </Modal>

        {/* Create group modal */}
        <Modal
          open={groupOpen}
          title="Create group"
          description="Create a sub-group for your team."
          onClose={() => setGroupOpen(false)}
        >
          <div className="space-y-3">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              placeholder="Group name *"
              autoFocus
            />
            <textarea
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              className="min-h-16 w-full resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              placeholder="Description (optional)"
            />
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setGroupOpen(false)}>Cancel</ActionButton>
              <ActionButton onClick={handleCreateGroup} disabled={!groupName.trim() || savingGroup}>
                {savingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create
              </ActionButton>
            </div>
          </div>
        </Modal>

        {/* Member detail modal */}
        <Modal
          open={!!detailMember}
          title={detailMember ? `${detailMember.user.firstName ?? ''} ${detailMember.user.lastName ?? ''}`.trim() || detailMember.user.email : "Member"}
          description={detailMember?.user.email ?? ''}
          onClose={() => setDetailMemberId(null)}
        >
          {detailMember && (
            <div className="space-y-4">
              {/* Role change */}
              {isAdmin && !isSelf(detailMember.userId) && detailMember.role !== 'owner' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
                  <select
                    defaultValue={detailMember.role}
                    onChange={(e) => handleRoleChange(detailMember.userId, e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
                  >
                    <option value="member">Member</option>
                    {isOwner && <option value="admin">Admin</option>}
                  </select>
                </div>
              )}

              {/* Member tasks */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Tasks ({memberTasks.length})
                </p>
                {memberTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks assigned.</p>
                ) : (
                  <div className="max-h-60 space-y-1.5 overflow-y-auto">
                    {memberTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                        <div className={cn(
                          "h-2 w-2 flex-shrink-0 rounded-full",
                          task.status === 'done' ? 'bg-green-500' :
                          task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300',
                        )} />
                        <span className={cn("flex-1 truncate text-sm", task.status === 'done' && 'line-through text-muted-foreground')}>
                          {task.title}
                        </span>
                        <Pill tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</Pill>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Remove button */}
              {isAdmin && !isSelf(detailMember.userId) && (
                <ActionButton
                  variant="secondary"
                  className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                  onClick={() => {
                    const name = `${detailMember.user.firstName ?? ''} ${detailMember.user.lastName ?? ''}`.trim();
                    handleRemoveMember(detailMember.userId, name);
                  }}
                >
                  <UserMinus className="h-4 w-4" /> Remove from workspace
                </ActionButton>
              )}
            </div>
          )}
        </Modal>

        {/* Notifications modal */}
        <Modal
          open={notifOpen}
          title="Notifications"
          description="Your recent workspace notifications."
          onClose={() => setNotifOpen(false)}
        >
          <div className="space-y-2">
            {notifications.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No notifications</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={cn(
                    "w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted",
                    !n.isRead && "bg-indigo-50 dark:bg-indigo-950/30",
                  )}
                >
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </Modal>
      </PageShell>
      <Toast message={toast} />
    </>
  );
}
