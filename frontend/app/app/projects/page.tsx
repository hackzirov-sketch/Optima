'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, CalendarDays, CheckCircle2, Circle, ClipboardList, Clock, FolderOpen, Loader2, Play, Plus, Target, Timer, UserCircle, Zap } from "lucide-react";
import { ActionButton, Modal, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { DataTable, FilterBar, TaskDrawer, type TaskDrawerSavePayload, ViewSwitcher } from "@/components/app/PowerWorkspaceSystem";
import { POWER_VIEWS } from "@/data/ecosystemData";
import type { SmartTask, TaskView } from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useMembers } from "@/hooks/useMembers";
import { useTasks } from "@/hooks/useTasks";
import { useWebSocket } from "@/hooks/useWebSocket";
import { analyticsApi, projectsApi, tasksApi, type ApiMember, type ApiTask, type ApiProject, type CreateTaskDto } from "@/lib/api";
import { CreateProjectModal } from "@/components/app/CreateProjectModal";
import { CreateTaskModal } from "@/components/app/CreateTaskModal";

// ── Helpers ──────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86_400_000);
}

function daysTil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  backlog:     { label: 'Navbat',       color: 'text-slate-500',  bg: 'bg-slate-100 dark:bg-slate-800',   icon: <Circle className="h-3 w-3" /> },
  todo:        { label: 'Bajarilsin',   color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-950/30',   icon: <Circle className="h-3 w-3" /> },
  in_progress: { label: 'Jarayonda',    color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/30', icon: <Play className="h-3 w-3" /> },
  review:      { label: 'Ko\'rib chiqish', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', icon: <Clock className="h-3 w-3" /> },
  done:        { label: 'Bajarildi',    color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-950/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  blocked:     { label: 'To\'siq',      color: 'text-rose-600',   bg: 'bg-rose-50 dark:bg-rose-950/30',   icon: <AlarmClock className="h-3 w-3" /> },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: 'Past',    color: 'text-green-600' },
  medium:   { label: "O'rta",   color: 'text-amber-500' },
  high:     { label: 'Yuqori',  color: 'text-orange-500' },
  critical: { label: 'Kritik',  color: 'text-rose-600 font-bold' },
};

function TaskCard({
  task,
  memberMap,
  onStatusChange,
  onClick,
}: {
  task: ApiTask;
  memberMap: Map<string, string>;
  onStatusChange: (taskId: string, status: string) => void;
  onClick: () => void;
}) {
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.backlog;
  const priorityCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const assigneeName = task.assigneeId ? memberMap.get(task.assigneeId) ?? 'Tayinlangan' : null;
  const daysRunning = task.status === 'in_progress' ? daysSince(task.startedAt) : null;
  const daysLeft = daysTil(task.dueDate);
  const isOverdue = daysLeft !== null && daysLeft < 0 && task.status !== 'done';

  const nextStatus: Record<string, string> = {
    backlog: 'todo', todo: 'in_progress', in_progress: 'review', review: 'done', done: 'backlog',
  };

  return (
    <div
      className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 cursor-pointer"
      onClick={onClick}
    >
      {/* Priority dot */}
      <div className={cn(
        "absolute right-4 top-4 h-2 w-2 rounded-full",
        task.priority === 'low' ? 'bg-green-500' :
        task.priority === 'medium' ? 'bg-amber-400' :
        task.priority === 'high' ? 'bg-orange-500' :
        'bg-rose-600 animate-pulse',
      )} title={priorityCfg.label} />

      {/* Status badge */}
      <div className={cn("inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold", statusCfg.bg, statusCfg.color)}>
        {statusCfg.icon}
        {statusCfg.label}
      </div>

      {/* Title */}
      <p className="pr-4 text-sm font-semibold leading-5 text-foreground line-clamp-2">{task.title}</p>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
      )}

      {/* Meta row */}
      <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
        {/* Assignee */}
        {assigneeName ? (
          <div className="flex items-center gap-1.5">
            <div className="grid h-5 w-5 place-items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
              {assigneeName[0]?.toUpperCase()}
            </div>
            <span className="text-[11px] text-muted-foreground truncate max-w-[90px]">{assigneeName}</span>
          </div>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
            <UserCircle className="h-3.5 w-3.5" /> Tayinlanmagan
          </span>
        )}

        <div className="flex items-center gap-2">
          {/* Day counter (in_progress) */}
          {daysRunning !== null && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md">
              <Timer className="h-3 w-3" />
              {daysRunning === 0 ? 'Bugun boshlandi' : `${daysRunning} kun`}
            </span>
          )}

          {/* Deadline */}
          {task.dueDate && (
            <span className={cn(
              "flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md",
              isOverdue
                ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20"
                : daysLeft !== null && daysLeft <= 2
                  ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                  : "text-muted-foreground bg-muted",
            )}>
              <CalendarDays className="h-3 w-3" />
              {isOverdue ? `${Math.abs(daysLeft!)} kun kechikdi` : daysLeft === 0 ? 'Bugun!' : `${daysLeft} kun qoldi`}
            </span>
          )}
        </div>
      </div>

      {/* Quick status change */}
      {task.status !== 'done' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, nextStatus[task.status] ?? 'todo'); }}
          className="mt-1 w-full rounded-xl border border-border py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted opacity-0 group-hover:opacity-100"
        >
          → {STATUS_CONFIG[nextStatus[task.status] ?? 'todo']?.label ?? 'Keyingisi'}
        </button>
      )}
    </div>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
  memberMap,
  onStatusChange,
  onTaskClick,
}: {
  status: string;
  tasks: ApiTask[];
  memberMap: Map<string, string>;
  onStatusChange: (taskId: string, status: string) => void;
  onTaskClick: (task: ApiTask) => void;
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.backlog;
  return (
    <div className="flex flex-col gap-3 min-w-[260px] max-w-[300px] flex-shrink-0">
      <div className={cn("flex items-center justify-between rounded-xl px-3 py-2", cfg.bg)}>
        <div className={cn("flex items-center gap-2 text-xs font-black uppercase tracking-wide", cfg.color)}>
          {cfg.icon} {cfg.label}
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", cfg.bg, cfg.color)}>
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} memberMap={memberMap} onStatusChange={onStatusChange} onClick={() => onTaskClick(t)} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground/40">
            Task yo&apos;q
          </div>
        )}
      </div>
    </div>
  );
}

function buildMemberMap(members: ApiMember[]): Map<string, string> {
  const m = new Map<string, string>();
  members.forEach((member) => {
    const name = `${member.user?.firstName ?? ''} ${member.user?.lastName ?? ''}`.trim() || member.user?.email || 'Unknown';
    m.set(member.userId, name);
  });
  return m;
}

function apiTaskToSmartTask(t: ApiTask, memberMap: Map<string, string>): SmartTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    status: (t.status as SmartTask['status']) ?? 'backlog',
    priority: (t.priority as SmartTask['priority']) ?? 'medium',
    assignee: memberMap.get(t.assigneeId ?? '') ?? 'Unassigned',
    dueDate: t.dueDate ?? '—',
    project: t.projectId,
    tags: [],
    progress: t.status === 'done' ? 100 : t.status === 'in_progress' ? 50 : 0,
    estimate: t.estimatedHours ? `${t.estimatedHours}h` : '—',
    timeTracked: '0h',
    fields: [],
    subtasks: [],
    comments: [],
    activity: [],
  };
}

export default function Page() {
  const { activeWorkspace } = useWorkspace();

  const [view, setView] = useState<TaskView>("board");
  const [query, setQuery] = useState("");
  const [selectedApiTask, setSelectedApiTask] = useState<ApiTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDesc, setEditProjectDesc] = useState("");

  // Real-time task list (managed locally, synced via WS)
  const [rtTasks, setRtTasks] = useState<ApiTask[]>([]);

  const { projects, loading: projectsLoading, deleteProject, refresh: refreshProjects } = useProjects(activeWorkspace?.id);
  const { members } = useMembers(activeWorkspace?.id);
  const { tasks, loading: tasksLoading, updateTask, moveTask, deleteTask } = useTasks(
    activeProjectId ?? projects[0]?.id,
  );

  const currentProjectId = activeProjectId ?? projects[0]?.id;
  const memberMap = useMemo(() => buildMemberMap(members), [members]);

  // Sync rtTasks from useTasks
  useEffect(() => { setRtTasks(tasks); }, [tasks]);

  // ── WebSocket real-time ──────────────────────────────
  const handleWsTaskCreated = useCallback((raw: Record<string, unknown>) => {
    const t = raw as unknown as ApiTask;
    if (t.projectId !== currentProjectId) return;
    setRtTasks((prev) => prev.some((x) => x.id === t.id) ? prev : [t, ...prev]);
    showNotice(`Yangi task: "${t.title}"`);
  }, [currentProjectId]);

  const handleWsTaskUpdated = useCallback((raw: Record<string, unknown>) => {
    const t = raw as unknown as ApiTask;
    if (t.projectId !== currentProjectId) return;
    setRtTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, ...t } : x));
  }, [currentProjectId]);

  const handleWsTaskDeleted = useCallback(({ taskId }: { taskId: string }) => {
    setRtTasks((prev) => prev.filter((x) => x.id !== taskId));
  }, []);

  useWebSocket({
    onTaskCreated: handleWsTaskCreated,
    onTaskUpdated: handleWsTaskUpdated,
    onTaskDeleted: handleWsTaskDeleted,
  });

  // Project analytics from backend
  const [projectAnalytics, setProjectAnalytics] = useState<{
    commits: string; pushes: string; approvedPushes: string; tasksCompleted: string;
  } | null>(null);

  type ProjectAnalyticsResponse = {
    data?: { aggregates?: { commits: string; pushes: string; approvedPushes: string; tasksCompleted: string } };
  };

  useEffect(() => {
    if (!currentProjectId) return;
    setProjectAnalytics(null);
    analyticsApi.getProjectAnalytics(currentProjectId)
      .then((res) => { const typed = res as ProjectAnalyticsResponse; setProjectAnalytics(typed?.data?.aggregates ?? null); })
      .catch(() => {});
  }, [currentProjectId]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  };

  // Task status change (real-time optimistic update)
  const handleStatusChange = useCallback(async (taskId: string, newStatus: string) => {
    setRtTasks((prev) => prev.map((t) => t.id === taskId ? {
      ...t, status: newStatus,
      startedAt: newStatus === 'in_progress' && !t.startedAt ? new Date().toISOString() : t.startedAt,
      completedAt: newStatus === 'done' ? new Date().toISOString() : newStatus !== 'done' ? null : t.completedAt,
    } : t));
    try {
      await tasksApi.update(taskId, { status: newStatus as never });
    } catch {
      // revert on error
      setRtTasks((prev) => [...prev]);
    }
  }, []);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rtTasks;
    return rtTasks.filter((t) =>
      `${t.title} ${t.description ?? ''} ${t.status} ${t.priority}`.toLowerCase().includes(normalized),
    );
  }, [query, rtTasks]);

  // Kanban columns
  const KANBAN_COLS = ['backlog', 'todo', 'in_progress', 'review', 'done', 'blocked'];
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, ApiTask[]> = {};
    KANBAN_COLS.forEach((s) => { groups[s] = []; });
    filteredTasks.forEach((t) => {
      const col = KANBAN_COLS.includes(t.status) ? t.status : 'backlog';
      groups[col].push(t);
    });
    return groups;
  }, [filteredTasks]);

  const smartTasks = useMemo(
    () => filteredTasks.map((t) => apiTaskToSmartTask(t, memberMap)),
    [filteredTasks, memberMap],
  );

  const tableRows = smartTasks.map((task) => ({
    id: task.id,
    cells: [
      <span key="title" className="font-black">{task.title}</span>,
      <Pill key="status" tone="indigo">{task.status.replace("_", " ")}</Pill>,
      <span key="assignee">{task.assignee}</span>,
      <Pill key="priority" tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span key="dueDate" className="text-muted-foreground">{task.dueDate}</span>,
    ],
  }));

  const handleProjectCreated = async (proj: ApiProject) => {
    setCreateProjectOpen(false);
    setActiveProjectId(proj.id);
    await refreshProjects();
    showNotice(`"${proj.name}" loyihasi yaratildi`);
  };

  const handleTaskCreated = async () => {
    setCreateTaskOpen(false);
    showNotice("Task yaratildi, xabar yuborildi");
  };

  const selectedSmartTask = useMemo(
    () => selectedApiTask ? apiTaskToSmartTask(selectedApiTask, memberMap) : null,
    [selectedApiTask, memberMap],
  );

  const saveSelectedTask = async (payload: TaskDrawerSavePayload) => {
    if (!selectedApiTask) return;
    await updateTask(selectedApiTask.id, {
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      status: payload.status,
    });
    showNotice("Task saqlandi");
    setSelectedApiTask(null);
  };

  const activeProject = projects.find((p) => p.id === currentProjectId);

  const openEditProject = () => {
    if (!activeProject) return;
    setEditProjectName(activeProject.name);
    setEditProjectDesc(activeProject.description ?? "");
    setEditProjectOpen(true);
  };

  const handleUpdateProject = async () => {
    if (!currentProjectId || !editProjectName.trim()) return;
    setSaving(true);
    try {
      await projectsApi.update(currentProjectId, {
        name: editProjectName.trim(),
        description: editProjectDesc.trim() || undefined,
      });
      await refreshProjects();
      setEditProjectOpen(false);
      showNotice("Project updated");
    } catch {
      showNotice("Failed to update project");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProjectId || !confirm("Delete this project and all its tasks?")) return;
    setSaving(true);
    try {
      await deleteProject(currentProjectId);
      setActiveProjectId(undefined);
      showNotice("Project deleted");
    } catch {
      showNotice("Failed to delete project");
    } finally {
      setSaving(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <PageShell>
        <SurfaceCard>
          <div className="py-12 text-center text-muted-foreground">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="font-semibold">No workspace selected</p>
            <p className="mt-1 text-sm">Create or select a workspace to view projects.</p>
          </div>
        </SurfaceCard>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={activeWorkspace.name}
          title="Project command center"
          description="Kanban, table, timeline, calendar, goals and task detail drawers in one workspace."
        >
          <ActionButton onClick={() => setCreateProjectOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setCreateTaskOpen(true)} disabled={!currentProjectId}>
            <Plus className="h-4 w-4" /> Add task
          </ActionButton>
        </PageHeader>

        {/* Project tabs */}
        {projectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <SurfaceCard>
            <div className="py-10 text-center">
              <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your first project to get started.</p>
              <ActionButton className="mt-4" onClick={() => setCreateProjectOpen(true)}>
                <Plus className="h-4 w-4" /> Create project
              </ActionButton>
            </div>
          </SurfaceCard>
        ) : (
          <>
            {activeProject && (
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton variant="secondary" onClick={openEditProject} className="py-2 text-xs">
                  Edit project
                </ActionButton>
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  disabled={saving}
                  className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
                >
                  Delete project
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => setActiveProjectId(proj.id)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-all ${
                    (currentProjectId === proj.id)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-border bg-card text-muted-foreground hover:border-indigo-200 hover:text-foreground dark:hover:border-indigo-500/40"
                  }`}
                >
                  {proj.name}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <ViewSwitcher views={POWER_VIEWS} value={view} onChange={setView} />
              <div className="flex flex-wrap gap-2">
                <Pill tone="indigo">{tasks.length} tasks</Pill>
                <Pill tone="green">{tasks.filter((t) => t.status === 'done').length} done</Pill>
                <Pill tone="amber">{tasks.filter((t) => t.status === 'in_progress').length} in progress</Pill>
              </div>
            </div>

            <FilterBar
              query={query}
              onQueryChange={setQuery}
              chips={["Priority", "Status", "Due date"]}
              action={<ActionButton className="py-1.5" onClick={() => setCreateTaskOpen(true)}>+ Task</ActionButton>}
            />

            {tasksLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
              </div>
            )}

            {!tasksLoading && view === "board" && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <SectionTitle icon={ClipboardList} title="Kanban board" description={`${rtTasks.length} ta task · real-time`} />
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] text-muted-foreground font-semibold">Real-time</span>
                  </div>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {KANBAN_COLS.map((status) => (
                    <KanbanColumn
                      key={status}
                      status={status}
                      tasks={kanbanGroups[status] ?? []}
                      memberMap={memberMap}
                      onStatusChange={handleStatusChange}
                      onTaskClick={(t) => setSelectedApiTask(t)}
                    />
                  ))}
                </div>
              </div>
            )}

            {!tasksLoading && (view === "list" || view === "table") && (
              <DataTable
                columns={["Task", "Status", "Assignee", "Priority", "Due"]}
                rows={tableRows}
                onRowClick={(id) => {
                  const st = smartTasks.find((task) => task.id === id);
                  const apiT = filteredTasks.find((t) => t.id === id); if (apiT) setSelectedApiTask(apiT);
                }}
              />
            )}

            {!tasksLoading && (view === "timeline" || view === "calendar") && (
              <SurfaceCard>
                <SectionTitle icon={CalendarDays} title={`${view} view`} description="Tasks ordered by due date." />
                <div className="space-y-3">
                  {filteredTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedApiTask(task)}
                      className="grid w-full gap-3 rounded-2xl border border-border bg-muted p-4 text-left md:grid-cols-[1fr_1.4fr_0.6fr] md:items-center"
                    >
                      <div>
                        <p className="font-black text-foreground">{task.title}</p>
                        <p className="text-xs text-muted-foreground">{task.status.replace("_", " ")}</p>
                      </div>
                      <ProgressBar value={task.status === 'done' ? 100 : task.status === 'in_progress' ? 50 : 0} />
                      <Pill tone="indigo">{task.dueDate ?? '—'}</Pill>
                    </button>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {!tasksLoading && view === "dashboard" && (
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <SurfaceCard>
                  <SectionTitle icon={Target} title="Task breakdown" description="Progress by status for this project." />
                  {tasks.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">No tasks yet in this project.</p>
                  ) : (
                    <div className="space-y-4">
                      {(['backlog', 'todo', 'in_progress', 'review', 'done'] as const).map((status) => {
                        const count = tasks.filter((t) => t.status === status).length;
                        const pct = Math.round((count / tasks.length) * 100);
                        const colors: Record<string, string> = {
                          backlog: '#94A3B8', todo: '#6366F1', in_progress: '#3B82F6',
                          review: '#F59E0B', done: '#10B981',
                        };
                        return (
                          <div key={status} className="rounded-2xl border border-border bg-muted p-4">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm font-black capitalize text-foreground">{status.replace('_', ' ')}</p>
                              <Pill tone={status === 'done' ? 'green' : status === 'in_progress' ? 'blue' : 'slate'}>
                                {count} tasks
                              </Pill>
                            </div>
                            <ProgressBar value={pct} accent={colors[status]} label={`${pct}%`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SurfaceCard>

                <SurfaceCard>
                  <SectionTitle icon={Zap} title="Project analytics" description="Aggregated activity for this project." />
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Tasks completed', value: projectAnalytics?.tasksCompleted ?? tasks.filter(t => t.status === 'done').length, accent: '#10B981' },
                      { label: 'Total tasks', value: tasks.length, accent: '#6366F1' },
                      { label: 'In progress', value: tasks.filter(t => t.status === 'in_progress').length, accent: '#3B82F6' },
                      { label: 'In review', value: tasks.filter(t => t.status === 'review').length, accent: '#F59E0B' },
                      { label: 'Commits', value: projectAnalytics?.commits ?? '—', accent: '#8B5CF6' },
                      { label: 'Code pushes', value: projectAnalytics?.pushes ?? '—', accent: '#EC4899' },
                    ].map(({ label, value, accent }) => (
                      <div key={label} className="rounded-2xl border border-border bg-muted p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="mt-2 text-2xl font-black" style={{ color: accent }}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              </div>
            )}
          </>
        )}

        {createProjectOpen && activeWorkspace && (
          <CreateProjectModal
            workspaceId={activeWorkspace.id}
            members={members}
            onCreated={handleProjectCreated}
            onClose={() => setCreateProjectOpen(false)}
          />
        )}

        {createTaskOpen && activeWorkspace && (
          <CreateTaskModal
            workspaceId={activeWorkspace.id}
            projects={projects}
            members={members}
            defaultProjectId={currentProjectId}
            onCreated={handleTaskCreated}
            onClose={() => setCreateTaskOpen(false)}
          />
        )}

        <Modal open={editProjectOpen} title="Edit project" description={activeProject?.name} onClose={() => setEditProjectOpen(false)}>
          <div className="space-y-3">
            <input
              value={editProjectName}
              onChange={(e) => setEditProjectName(e.target.value)}
              className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm outline-none focus:border-indigo-400"
              placeholder="Project name"
            />
            <textarea
              value={editProjectDesc}
              onChange={(e) => setEditProjectDesc(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-border bg-muted px-4 py-3 text-sm outline-none focus:border-indigo-400"
              placeholder="Description"
            />
            <div className="flex justify-end gap-2">
              <ActionButton variant="secondary" onClick={() => setEditProjectOpen(false)}>Cancel</ActionButton>
              <ActionButton onClick={handleUpdateProject} disabled={saving || !editProjectName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </ActionButton>
            </div>
          </div>
        </Modal>

        <TaskDrawer task={selectedSmartTask} onClose={() => setSelectedApiTask(null)} onSave={saveSelectedTask} />
      </PageShell>
      <Toast message={notice} />
    </>
  );
}
