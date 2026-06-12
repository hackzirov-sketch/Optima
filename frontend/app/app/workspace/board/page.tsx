'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  Plus,
  Save,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Pill, ProgressBar, SectionTitle, SurfaceCard, cn } from "@/components/app/DesignSystem";
import { DataTable, FilterBar, ViewSwitcher, WidgetCard, WorkspaceHierarchy } from "@/components/app/PowerWorkspaceSystem";
import { DASHBOARD_WIDGETS, POWER_VIEWS, SMART_TASKS, WORKSPACE_ZONE } from "@/data/ecosystemData";
import type { Profession, TaskView } from "@/types";
import type { ApiMember, ApiProject, ApiTask } from "@/lib/api";
import { storage } from "@/utils/storage";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { useMembers } from "@/hooks/useMembers";
import { useWorkspaceAnalytics } from "@/hooks/useWorkspaceAnalytics";
import {
  PROFESSION_PRESETS,
  type CreatedWorkspaceItem,
  type WorkspaceSnapshot,
  formatStamp,
  taskMatchesPreset,
} from "../_workspace";

const ITEM_TYPES = ["Board", "Doc", "Automation", "Dashboard"] as const;

export default function BoardPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { projects: realProjects } = useProjects(activeWorkspace?.id);
  const projectIds = useMemo(() => realProjects.map((p) => p.id), [realProjects]);
  const { tasks: realTasks } = useAllWorkspaceTasks(activeWorkspace?.id, projectIds);
  const { members: realMembers } = useMembers(activeWorkspace?.id);
  useWorkspaceAnalytics(activeWorkspace?.id);

  const [activeView, setActiveView] = useState<TaskView>(() => storage.getActiveView() ?? "board");
  const [activeBoard, setActiveBoard] = useState(() => storage.getActiveBoard() ?? "Roadmap");
  const [activeProfession, setActiveProfession] = useState<Profession>(
    () => storage.getWorkspaceProfession() ?? user?.profession ?? "student",
  );
  const [query, setQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState("All");
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showAllProfs, setShowAllProfs] = useState(false);
  const [createdItems, setCreatedItems] = useState<CreatedWorkspaceItem[]>(
    () => storage.getWorkspaceCreatedItems<CreatedWorkspaceItem>(),
  );
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>(
    () => storage.getWorkspaceSnapshots<WorkspaceSnapshot>(),
  );
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => storage.saveActiveView(activeView), [activeView]);
  useEffect(() => storage.saveActiveBoard(activeBoard), [activeBoard]);
  useEffect(() => storage.saveWorkspaceProfession(activeProfession), [activeProfession]);
  useEffect(() => storage.saveWorkspaceCreatedItems(createdItems), [createdItems]);
  useEffect(() => storage.saveWorkspaceSnapshots(snapshots), [snapshots]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!createOpen) return;
    const handler = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [createOpen]);

  const activePreset = PROFESSION_PRESETS[activeProfession] ?? PROFESSION_PRESETS.developer;
  const createdBoards = createdItems
    .filter((i) => i.type === "Board" && i.profession === activeProfession)
    .map((i) => i.title);
  const quickBoards = Array.from(new Set([...activePreset.boards, ...createdBoards]));

  const professionList = Object.values(PROFESSION_PRESETS);
  const VISIBLE_PROF_COUNT = 4;
  const visibleProfs = showAllProfs ? professionList : professionList.slice(0, VISIBLE_PROF_COUNT);
  const hiddenCount = professionList.length - VISIBLE_PROF_COUNT;

  const memberNameMap = useMemo(() => {
    const m = new Map<string, string>();
    realMembers.forEach((member: ApiMember) => {
      const name = member.user
        ? `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() || member.user.email
        : 'Unknown';
      if (member.userId) m.set(member.userId, name);
    });
    return m;
  }, [realMembers]);

  const projectNameMap = useMemo(() => {
    const m = new Map<string, string>();
    realProjects.forEach((p: ApiProject) => m.set(p.id, p.name));
    return m;
  }, [realProjects]);

  const professionTasks = useMemo(() => {
    const matching = SMART_TASKS.filter((task) => {
      const text = `${task.title} ${task.description} ${task.project} ${task.assignee} ${task.tags.join(" ")} ${task.fields.map((f) => f.value).join(" ")}`.toLowerCase();
      return taskMatchesPreset(text, activePreset.filters);
    });
    return matching.length > 0 ? matching : SMART_TASKS;
  }, [activePreset.filters]);

  const filteredTasks = useMemo(() => {
    const norm = query.trim().toLowerCase();
    const base =
      focusFilter === "All"
        ? professionTasks
        : professionTasks.filter((t) =>
            `${t.title} ${t.description} ${t.project} ${t.assignee} ${t.tags.join(" ")}`.toLowerCase().includes(focusFilter.toLowerCase()),
          );
    return norm
      ? base.filter((t) => `${t.title} ${t.project} ${t.assignee} ${t.tags.join(" ")}`.toLowerCase().includes(norm))
      : base;
  }, [focusFilter, professionTasks, query]);

  const effectiveDisplayTasks = useMemo(() => {
    if (!activeWorkspace) return filteredTasks;
    if (realTasks.length === 0) return [];
    const norm = query.trim().toLowerCase();
    const mapped = realTasks.map((t: ApiTask) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: (t.status ?? 'todo') as "backlog" | "todo" | "in_progress" | "review" | "blocked" | "done",
      priority: (t.priority ?? 'medium') as "low" | "medium" | "high",
      assignee: memberNameMap.get(t.assigneeId ?? '') || 'Unassigned',
      project: projectNameMap.get(t.projectId) ?? 'Project',
      tags: [] as string[],
      progress: t.status === 'done' ? 100 : t.status === 'in_progress' ? 50 : t.status === 'review' ? 75 : t.status === 'blocked' ? 25 : 0,
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : null as string | null,
      estimate: t.estimatedHours ? `${t.estimatedHours}h` : null as string | null,
      fields: [] as { label: string; value: string }[],
    }));
    return norm
      ? mapped.filter((t) => `${t.title} ${t.project} ${t.assignee}`.toLowerCase().includes(norm))
      : mapped;
  }, [activeWorkspace, realTasks, filteredTasks, query, memberNameMap, projectNameMap]);

  const taskDone = realTasks.filter((t) => t.status === 'done').length;
  const taskActive = realTasks.filter((t) => t.status !== 'done').length;

  const taskRows = effectiveDisplayTasks.map((task) => ({
    id: task.id,
    cells: [
      <span key="title" className="font-semibold text-foreground">{task.title}</span>,
      <Pill key="project" tone="blue">{task.project}</Pill>,
      <span key="assignee" className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          {task.assignee.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-sm">{task.assignee}</span>
      </span>,
      <Pill key="priority" tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>
        {task.priority}
      </Pill>,
      task.dueDate
        ? <span key="due" className="text-sm text-foreground">{task.dueDate}</span>
        : <span key="due" className="text-sm text-muted-foreground/40">—</span>,
    ],
  }));

  const createItem = (type: (typeof ITEM_TYPES)[number]) => {
    const title = `${activePreset.label} ${type} ${Date.now().toString().slice(-4)}`;
    const item: CreatedWorkspaceItem = {
      id: `ws-item-${Date.now()}`,
      type,
      title,
      profession: activeProfession,
      board: activeBoard,
      createdAt: formatStamp(),
    };
    setCreatedItems((cur) => [item, ...cur].slice(0, 12));
    if (type === "Board") setActiveBoard(title);
    setNotice(`${type} "${title}" created`);
    setCreateOpen(false);
  };

  const handleSaveSnapshot = () => {
    const snap: WorkspaceSnapshot = {
      id: `snap-${Date.now()}`,
      name: `${activePreset.label} – ${activeView} / ${activeBoard}`,
      profession: activeProfession,
      view: activeView,
      board: activeBoard,
      createdAt: formatStamp(),
      filters: activePreset.filters.slice(0, 4),
    };
    setSnapshots((cur) => [snap, ...cur].slice(0, 8));
    setNotice("View saved");
  };

  return (
    <>
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-6 py-4">

        {/* ── Compact gradient hero ────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-600 px-6 py-5 text-white shadow-md shadow-indigo-500/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-200">
                {activeWorkspace?.name ?? "Power Workspace"}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight md:text-2xl">
                {activePreset.template}
              </h2>
              <p className="mt-1 text-sm text-indigo-100">
                {realProjects.length} projects · {realTasks.length} tasks · {realMembers.length} members
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
                  {WORKSPACE_ZONE.health}% health
                </span>
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleSaveSnapshot}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-[0.98]"
              >
                <Save className="h-3.5 w-3.5" /> Save view
              </button>
              <div ref={createMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCreateOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:bg-indigo-50 active:scale-[0.98]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", createOpen && "rotate-180")} />
                </button>
                {createOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-xl glass">
                    <div className="p-1">
                      {ITEM_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => createItem(type)}
                          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Compact stat cards ───────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Projects",   value: realProjects.length, sub: "active" },
            { label: "Tasks done", value: taskDone,            sub: `/ ${realTasks.length}` },
            { label: "Active",     value: taskActive,          sub: "in progress" },
            { label: "Members",    value: realMembers.length,  sub: "team size" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {value}{" "}
                <span className="text-xs font-normal text-muted-foreground">{sub}</span>
              </p>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">

          {/* Sidebar — sticky, independently scrollable */}
          <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100svh-210px)] lg:overflow-y-auto lg:pb-4 lg:pr-1">

            {/* Profession selector */}
            <SurfaceCard>
              <SectionTitle icon={Users} title="Profession" description="Filter by role." />
              <div className="flex flex-wrap gap-1.5">
                {visibleProfs.map((preset) => {
                  const Icon = preset.icon;
                  const isActive = preset.id === activeProfession;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setActiveProfession(preset.id);
                        setActiveBoard(preset.boards[0]);
                        setFocusFilter("All");
                        setNotice(`${preset.label} applied`);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all",
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-card hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {preset.label}
                    </button>
                  );
                })}
                {!showAllProfs && hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllProfs(true)}
                    className="rounded-xl bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground"
                  >
                    +{hiddenCount}
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {["All", ...activePreset.filters.slice(0, 5)].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFocusFilter(f)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition-colors",
                      focusFilter === f
                        ? "bg-indigo-600 text-white ring-indigo-600"
                        : "bg-card text-muted-foreground ring-border hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </SurfaceCard>

            {/* Quick boards */}
            <SurfaceCard>
              <SectionTitle icon={Workflow} title="Boards" description="Active boards." />
              <div className="flex flex-wrap gap-1.5">
                {quickBoards.map((board) => (
                  <button
                    key={board}
                    type="button"
                    onClick={() => setActiveBoard(board)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors",
                      activeBoard === board
                        ? "bg-indigo-600 text-white ring-indigo-600"
                        : "bg-muted text-muted-foreground ring-border hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300",
                    )}
                  >
                    {board}
                  </button>
                ))}
              </div>
            </SurfaceCard>

            <WorkspaceHierarchy zone={WORKSPACE_ZONE} activeBoard={activeBoard} onSelectBoard={setActiveBoard} />
          </div>

          {/* Main content */}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ViewSwitcher views={POWER_VIEWS} value={activeView} onChange={setActiveView} />
              <div className="flex flex-wrap gap-2">
                <Pill tone="green">{WORKSPACE_ZONE.health}% health</Pill>
                <Pill tone="indigo">{activePreset.label}: {activeBoard}</Pill>
              </div>
            </div>

            <FilterBar
              query={query}
              onQueryChange={setQuery}
              chips={[...activePreset.filters.slice(0, 4), "Saved view"]}
            />

            {effectiveDisplayTasks.length === 0 && (
              <SurfaceCard className="border-dashed text-center">
                <p className="font-black text-foreground">
                  {activeWorkspace ? 'No tasks yet' : 'No matching items'}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {activeWorkspace
                    ? 'Create a project and add tasks to get started.'
                    : 'Try another profession or clear search.'}
                </p>
              </SurfaceCard>
            )}

            {activeView === "board" && effectiveDisplayTasks.length > 0 && (
              <SurfaceCard>
                <SectionTitle
                  icon={LayoutDashboard}
                  title={`${activePreset.label} board`}
                  description="Tasks grouped by status."
                />
                <div className="grid gap-3 xl:grid-cols-4">
                  {(["todo", "in_progress", "review", "done"] as const).map((status) => {
                    const statusTasks = effectiveDisplayTasks.filter((t) => t.status === status);
                    return (
                      <div key={status} className="rounded-2xl bg-muted p-3 ring-1 ring-border">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-black capitalize text-foreground">
                            {status.replace("_", " ")}
                          </h3>
                          <Pill tone="slate">{statusTasks.length}</Pill>
                        </div>
                        <div className="space-y-2">
                          {statusTasks.map((task) => (
                            <div
                              key={task.id}
                              className="rounded-2xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                            >
                              <p className="text-sm font-black text-foreground">{task.title}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {task.tags.slice(0, 2).map((tag) => <Pill key={tag} tone="blue">{tag}</Pill>)}
                              </div>
                              <ProgressBar value={task.progress} label={task.assignee} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SurfaceCard>
            )}

            {(activeView === "list" || activeView === "table") && (
              <DataTable
                columns={["Task", "Project", "Owner", "Priority", "Due"]}
                rows={taskRows}
              />
            )}

            {activeView === "calendar" && (
              <SurfaceCard>
                <SectionTitle icon={LayoutDashboard} title="Calendar" description="Tasks by deadline." />
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {effectiveDisplayTasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-border bg-muted p-4">
                      {task.dueDate
                        ? <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-500">{task.dueDate}</p>
                        : <p className="text-xs text-muted-foreground/40">No date</p>
                      }
                      <p className="mt-2 text-sm font-black text-foreground">{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{task.assignee}</p>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {activeView === "timeline" && (
              <SurfaceCard>
                <SectionTitle icon={Sparkles} title="Timeline" description="Task progress and due dates." />
                <div className="space-y-3">
                  {effectiveDisplayTasks.map((task) => (
                    <div
                      key={task.id}
                      className="grid gap-3 rounded-2xl border border-border bg-muted p-4 md:grid-cols-[1fr_2fr_0.5fr] md:items-center"
                    >
                      <div>
                        <p className="font-black text-foreground">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.estimate ?? <span className="opacity-40">—</span>} estimate
                        </p>
                      </div>
                      <ProgressBar value={task.progress} />
                      <Pill tone="indigo">{task.dueDate ?? '—'}</Pill>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {activeView === "dashboard" && (
              <SurfaceCard>
                <SectionTitle icon={LayoutDashboard} title="Insight board" description="Saved dashboard widgets." />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {DASHBOARD_WIDGETS.slice(0, 4).map((widget) => (
                    <WidgetCard key={widget.id} widget={widget} />
                  ))}
                </div>
              </SurfaceCard>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl glass px-5 py-3 text-sm font-semibold text-foreground">
          {notice}
        </div>
      )}
    </>
  );
}
