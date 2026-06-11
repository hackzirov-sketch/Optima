'use client';

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  Code2,
  Columns3,
  Database,
  Figma,
  Filter,
  Github,
  GraduationCap,
  Gauge,
  HardDrive,
  LayoutDashboard,
  LockKeyhole,
  Megaphone,
  NotepadText,
  Palette,
  PlayCircle,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Slack,
  Sparkles,
  Target,
  Timer,
  Users,
  Video,
  Workflow,
} from "lucide-react";
import { ActionButton, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, cn } from "@/components/app/DesignSystem";
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

type WorkspaceItemType = "Board" | "Doc" | "Automation" | "Dashboard";

type CreatedWorkspaceItem = {
  id: string;
  type: WorkspaceItemType;
  title: string;
  profession: Profession;
  board: string;
  createdAt: string;
};

type WorkspaceSnapshot = {
  id: string;
  name: string;
  profession: Profession;
  view: TaskView;
  board: string;
  createdAt: string;
  filters: string[];
};

type WorkspaceField = {
  id: string;
  label: string;
  type: "Text" | "Status" | "Person" | "Date" | "Number";
  enabled: boolean;
};

type WorkspaceRule = {
  id: string;
  title: string;
  trigger: string;
  action: string;
  enabled: boolean;
};

type ProfessionPreset = {
  id: Profession;
  label: string;
  icon: LucideIcon;
  summary: string;
  template: string;
  filters: string[];
  boards: string[];
  integrations: string[];
  controlFocus: string;
};

const PROFESSION_PRESETS: Record<Profession, ProfessionPreset> = {
  developer: {
    id: "developer",
    label: "Developer",
    icon: Code2,
    summary: "Sprint, code review, QA, automation and release monitoring.",
    template: "Engineering Sprint OS",
    filters: ["Workspace", "Automation", "Navigation", "Tasks", "AI", "Architecture"],
    boards: ["Roadmap", "Sprint", "QA", "Release"],
    integrations: ["github", "figma", "calendar", "drive"],
    controlFocus: "Ship reliable features with review gates and integration signals.",
  },
  designer: {
    id: "designer",
    label: "Designer",
    icon: Palette,
    summary: "Design systems, review boards, handoff docs and Figma workflow.",
    template: "Design System Studio",
    filters: ["Design System", "Power UI", "Workspace", "Views", "Tasks"],
    boards: ["Design QA", "Handoff", "UX Review", "Components"],
    integrations: ["figma", "drive", "notion", "calendar"],
    controlFocus: "Keep visual quality, handoff and review context in one place.",
  },
  teacher: {
    id: "teacher",
    label: "Teacher",
    icon: BookOpen,
    summary: "Lesson plans, learning paths, docs and progress tracking.",
    template: "Learning Control Room",
    filters: ["Learning", "Docs", "Mentors", "Reviews", "Meetings"],
    boards: ["Paths", "Lessons", "Reviews", "Mentors"],
    integrations: ["calendar", "drive", "notion"],
    controlFocus: "Track learning progress and turn notes into next actions.",
  },
  student: {
    id: "student",
    label: "Student",
    icon: GraduationCap,
    summary: "Study dashboard, portfolio tasks, deadlines and mentor feedback.",
    template: "Student Progress Hub",
    filters: ["Learning", "Tasks", "Portfolio", "Reviews", "AI"],
    boards: ["Study", "Portfolio", "Mentors", "Deadlines"],
    integrations: ["calendar", "drive", "notion"],
    controlFocus: "Stay focused on weekly progress and portfolio proof.",
  },
  freelancer: {
    id: "freelancer",
    label: "Freelancer",
    icon: Briefcase,
    summary: "Client delivery, invoices, meetings and freelance operations.",
    template: "Client Delivery OS",
    filters: ["Client", "Delivery", "Invoices", "Meetings", "Freelance"],
    boards: ["Deals", "Delivery", "Invoices", "Archive"],
    integrations: ["calendar", "drive", "github", "notion"],
    controlFocus: "Control every client from proposal to payment without clutter.",
  },
  smm: {
    id: "smm",
    label: "SMM",
    icon: Megaphone,
    summary: "Campaigns, content calendar, community channels and analytics.",
    template: "Growth Campaign Hub",
    filters: ["Community", "News", "Premium", "Launch", "Growth"],
    boards: ["Content", "Campaigns", "Analytics", "Approvals"],
    integrations: ["slack", "calendar", "drive", "figma"],
    controlFocus: "Monitor campaigns, approvals and channel output from one view.",
  },
  creator: {
    id: "creator",
    label: "Creator",
    icon: Video,
    summary: "Content pipeline, publishing tasks, community and monetization.",
    template: "Creator Studio OS",
    filters: ["Community", "News", "Premium", "Launch", "Content"],
    boards: ["Ideas", "Production", "Publish", "Community"],
    integrations: ["drive", "figma", "calendar", "slack"],
    controlFocus: "Move ideas into publishable assets and community loops.",
  },
};

const INTEGRATIONS = [
  { id: "github", name: "GitHub", icon: Github, desc: "Repo, PR, issue and commit activity." },
  { id: "drive", name: "Drive", icon: HardDrive, desc: "Docs, files, assets and handoff folders." },
  { id: "calendar", name: "Calendar", icon: Calendar, desc: "Deadlines, meetings and reminder sync." },
  { id: "slack", name: "Slack", icon: Slack, desc: "Team notifications and channel mirroring." },
  { id: "figma", name: "Figma", icon: Figma, desc: "Design files, exports and review comments." },
  { id: "notion", name: "Notion", icon: NotepadText, desc: "Knowledge import and wiki bridge." },
];

const CONTROL_SWITCHES = [
  { id: "autoSave", label: "Auto save", detail: "Save active board, view and profession preset locally." },
  { id: "reviewGate", label: "Review gate", detail: "Highlight work that needs QA or approval." },
  { id: "integrationGuard", label: "Integration guard", detail: "Show missing tool connections for this profession." },
] as const;

const DEFAULT_WORKSPACE_FIELDS: WorkspaceField[] = [
  { id: "field-owner", label: "Owner", type: "Person", enabled: true },
  { id: "field-risk", label: "Risk", type: "Status", enabled: true },
  { id: "field-deadline", label: "Deadline", type: "Date", enabled: true },
  { id: "field-client", label: "Client", type: "Text", enabled: false },
  { id: "field-budget", label: "Budget", type: "Number", enabled: false },
];

const DEFAULT_WORKSPACE_RULES: WorkspaceRule[] = [
  { id: "rule-review", title: "Review protection", trigger: "Task enters Review", action: "Create QA checklist and notify owner", enabled: true },
  { id: "rule-deadline", title: "Deadline radar", trigger: "Due date is within 24h", action: "Show alert in control center", enabled: true },
  { id: "rule-client", title: "Client handoff", trigger: "Board changes to Delivery", action: "Prepare doc and invoice placeholders", enabled: false },
  { id: "rule-ai", title: "AI weekly summary", trigger: "Friday 17:00", action: "Generate workspace summary draft", enabled: false },
];

const ROLE_MATRIX = [
  { role: "Owner", canCreate: true, canSave: true, canConnect: true, note: "Full workspace control" },
  { role: "Admin", canCreate: true, canSave: true, canConnect: true, note: "Team and integration setup" },
  { role: "Member", canCreate: true, canSave: false, canConnect: false, note: "Create work, follow saved views" },
  { role: "Viewer", canCreate: false, canSave: false, canConnect: false, note: "Read-only progress tracking" },
];

const BASE_INTEGRATIONS = INTEGRATIONS.reduce<Record<string, boolean>>((acc, i) => {
  acc[i.id] = i.id === "github";
  return acc;
}, {});

function formatStamp() {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function taskMatchesPreset(taskText: string, filters: string[]) {
  return filters.some((f) => taskText.includes(f.toLowerCase()));
}

export default function Page() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { projects: realProjects } = useProjects(activeWorkspace?.id);
  const projectIds = useMemo(() => realProjects.map((p) => p.id), [realProjects]);
  const { tasks: realTasks } = useAllWorkspaceTasks(activeWorkspace?.id, projectIds);
  const { members: realMembers } = useMembers(activeWorkspace?.id);
  const { analytics } = useWorkspaceAnalytics(activeWorkspace?.id);

  const [activeView, setActiveView] = useState<TaskView>(() => storage.getActiveView() ?? "board");
  const [activeBoard, setActiveBoard] = useState(() => storage.getActiveBoard() ?? "Roadmap");
  const [activeProfession, setActiveProfession] = useState<Profession>(() => storage.getWorkspaceProfession() ?? user?.profession ?? "student");
  const [query, setQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState("All");
  const [notice, setNotice] = useState<string | null>(null);
  const [newItemType, setNewItemType] = useState<WorkspaceItemType>("Board");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [createdItems, setCreatedItems] = useState<CreatedWorkspaceItem[]>(() => storage.getWorkspaceCreatedItems<CreatedWorkspaceItem>());
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>(() => storage.getWorkspaceSnapshots<WorkspaceSnapshot>());
  const [integrationState, setIntegrationState] = useState<Record<string, boolean>>(() => ({ ...BASE_INTEGRATIONS, ...(storage.getIntegrations() ?? {}) }));
  const [workspaceFields, setWorkspaceFields] = useState<WorkspaceField[]>(() => {
    const saved = storage.getWorkspaceFields<WorkspaceField>();
    return saved.length > 0 ? saved : DEFAULT_WORKSPACE_FIELDS;
  });
  const [workspaceRules, setWorkspaceRules] = useState<WorkspaceRule[]>(() => {
    const saved = storage.getWorkspaceRules<WorkspaceRule>();
    return saved.length > 0 ? saved : DEFAULT_WORKSPACE_RULES;
  });
  const [fieldDraft, setFieldDraft] = useState("");
  const [controls, setControls] = useState<Record<(typeof CONTROL_SWITCHES)[number]["id"], boolean>>({ autoSave: true, reviewGate: true, integrationGuard: true });
  const [activeTab, setActiveTab] = useState<'board' | 'overview' | 'settings' | 'team'>('board');

  const memberNameMap = useMemo(() => {
    const m = new Map<string, string>();
    realMembers.forEach((member: ApiMember) => {
      const name = member.user
        ? (`${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() || member.user.email)
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

  const activePreset = PROFESSION_PRESETS[activeProfession] ?? PROFESSION_PRESETS.developer;
  const createdBoards = createdItems.filter((item) => item.type === "Board" && item.profession === activeProfession).map((item) => item.title);
  const quickBoards = Array.from(new Set([...activePreset.boards, ...createdBoards]));
  const missingRecommended = activePreset.integrations.filter((id) => !integrationState[id]);
  const integrationCoverage = Math.round(((activePreset.integrations.length - missingRecommended.length) / Math.max(activePreset.integrations.length, 1)) * 100);
  const enabledRules = workspaceRules.filter((r) => r.enabled).length;
  const enabledFields = workspaceFields.filter((f) => f.enabled).length;
  const automationScore = Math.round((enabledRules / Math.max(workspaceRules.length, 1)) * 100);
  const fieldScore = Math.min(100, enabledFields * 18);
  const savedScore = Math.min(100, snapshots.length * 24 + createdItems.length * 12);

  const professionTasks = useMemo(() => {
    const matching = SMART_TASKS.filter((task) => {
      const taskText = `${task.title} ${task.description} ${task.project} ${task.assignee} ${task.tags.join(" ")} ${task.fields.map((f) => f.value).join(" ")}`.toLowerCase();
      return taskMatchesPreset(taskText, activePreset.filters);
    });
    return matching.length > 0 ? matching : SMART_TASKS;
  }, [activePreset.filters]);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const activeFocus = focusFilter.toLowerCase();
    const focused = focusFilter === "All"
      ? professionTasks
      : professionTasks.filter((task) => `${task.title} ${task.description} ${task.project} ${task.assignee} ${task.tags.join(" ")}`.toLowerCase().includes(activeFocus));
    if (!normalized) return focused;
    return focused.filter((task) => `${task.title} ${task.project} ${task.assignee} ${task.tags.join(" ")}`.toLowerCase().includes(normalized));
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
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—',
      estimate: t.estimatedHours ? `${t.estimatedHours}h` : '—',
      timeTracked: '—',
      fields: [] as { label: string; value: string }[],
    }));
    if (!norm) return mapped;
    return mapped.filter((t) => `${t.title} ${t.project} ${t.assignee}`.toLowerCase().includes(norm));
  }, [activeWorkspace, realTasks, filteredTasks, query, memberNameMap, projectNameMap]);

  const workloadLanes = useMemo(() => {
    const workload = new Map<string, { owner: string; tasks: number; progress: number; risk: number; focus: string }>();
    effectiveDisplayTasks.forEach((task) => {
      const existing = workload.get(task.assignee) ?? { owner: task.assignee, tasks: 0, progress: 0, risk: 0, focus: task.project };
      existing.tasks += 1;
      existing.progress += task.progress;
      existing.risk += task.priority === "high" || task.status === "blocked" ? 1 : 0;
      existing.focus = task.project;
      workload.set(task.assignee, existing);
    });
    return Array.from(workload.values()).slice(0, 4).map((lane) => ({
      ...lane,
      capacity: Math.min(100, Math.round((lane.tasks / Math.max(effectiveDisplayTasks.length, 1)) * 100) + lane.risk * 12),
      progress: Math.round(lane.progress / Math.max(lane.tasks, 1)),
    }));
  }, [effectiveDisplayTasks]);

  const avgProgress = Math.round(effectiveDisplayTasks.reduce((sum, t) => sum + t.progress, 0) / Math.max(effectiveDisplayTasks.length, 1));
  const highPriorityCount = effectiveDisplayTasks.filter((t) => t.priority === "high").length;
  const reviewCount = effectiveDisplayTasks.filter((t) => t.status === "review" || t.status === "blocked").length;
  const readinessScore = Math.round((WORKSPACE_ZONE.health + avgProgress + integrationCoverage + savedScore + automationScore + fieldScore) / 6);

  const workspaceSignals = [
    { label: "Task progress", value: avgProgress, tone: "indigo" as const },
    { label: "Integration match", value: integrationCoverage, tone: missingRecommended.length ? "amber" as const : "green" as const },
    { label: "Saved control", value: savedScore, tone: snapshots.length ? "blue" as const : "slate" as const },
    { label: "Automation rules", value: automationScore, tone: enabledRules ? "indigo" as const : "slate" as const },
    { label: "Custom fields", value: fieldScore, tone: enabledFields > 2 ? "green" as const : "amber" as const },
    { label: "Zone health", value: WORKSPACE_ZONE.health, tone: "green" as const },
  ];

  useEffect(() => storage.saveActiveView(activeView), [activeView]);
  useEffect(() => storage.saveActiveBoard(activeBoard), [activeBoard]);
  useEffect(() => storage.saveWorkspaceProfession(activeProfession), [activeProfession]);
  useEffect(() => storage.saveWorkspaceCreatedItems(createdItems), [createdItems]);
  useEffect(() => storage.saveWorkspaceSnapshots(snapshots), [snapshots]);
  useEffect(() => storage.saveIntegrations(integrationState), [integrationState]);
  useEffect(() => storage.saveWorkspaceFields(workspaceFields), [workspaceFields]);
  useEffect(() => storage.saveWorkspaceRules(workspaceRules), [workspaceRules]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const taskRows = effectiveDisplayTasks.map((task) => ({
    id: task.id,
    cells: [
      <span key="title" className="font-black">{task.title}</span>,
      <Pill key="project" tone="blue">{task.project}</Pill>,
      <span key="assignee">{task.assignee}</span>,
      <Pill key="priority" tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span key="dueDate" className="text-muted-foreground">{task.dueDate}</span>,
    ],
  }));

  const handleCreateItem = () => {
    const title = newItemTitle.trim() || `${activePreset.label} ${newItemType}`;
    const item: CreatedWorkspaceItem = {
      id: `workspace-item-${Date.now()}`,
      type: newItemType,
      title,
      profession: activeProfession,
      board: activeBoard,
      createdAt: formatStamp(),
    };
    setCreatedItems((cur) => [item, ...cur].slice(0, 12));
    if (newItemType === "Board") setActiveBoard(title);
    setNewItemTitle("");
    setNotice(`${newItemType} created locally`);
  };

  const handleSaveSnapshot = () => {
    const snapshot: WorkspaceSnapshot = {
      id: `workspace-snapshot-${Date.now()}`,
      name: `${activePreset.label} - ${activeView} / ${activeBoard}`,
      profession: activeProfession,
      view: activeView,
      board: activeBoard,
      createdAt: formatStamp(),
      filters: activePreset.filters.slice(0, 4),
    };
    setSnapshots((cur) => [snapshot, ...cur].slice(0, 8));
    setNotice("Workspace state saved locally");
  };

  const addCustomField = () => {
    const label = fieldDraft.trim();
    if (!label) return;
    setWorkspaceFields((cur) => [
      { id: `field-${Date.now()}`, label, type: "Text" as const, enabled: true },
      ...cur,
    ].slice(0, 10));
    setFieldDraft("");
    setNotice(`${label} field added`);
  };

  const restoreSnapshot = (snapshot: WorkspaceSnapshot) => {
    setActiveProfession(snapshot.profession);
    setActiveView(snapshot.view);
    setActiveBoard(snapshot.board);
    setNotice("Saved workspace restored");
  };

  const WORKSPACE_TABS = [
    { id: 'board' as const, label: 'Board', icon: LayoutDashboard },
    { id: 'overview' as const, label: 'Overview', icon: Gauge },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
    { id: 'team' as const, label: 'Team', icon: Users },
  ];

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "Power Workspace"}
          title={activePreset.template}
          description={
            activeWorkspace
              ? `${analytics?.projectCount ?? realProjects.length} projects · ${analytics?.totalTasks ?? realTasks.length} tasks · ${analytics?.memberCount ?? realMembers.length} members`
              : "Control, create and save your workspace by profession."
          }
        >
          <ActionButton onClick={handleCreateItem}><Plus className="h-4 w-4" /> Create</ActionButton>
          <ActionButton variant="secondary" onClick={handleSaveSnapshot}><Save className="h-4 w-4" /> Save view</ActionButton>
        </PageHeader>

        {/* Compact metrics */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            { label: "Projects", value: String(realProjects.length), icon: Target },
            { label: "Tasks done", value: String(realTasks.filter((t) => t.status === 'done').length), icon: CheckCircle2 },
            { label: "Active", value: String(realTasks.filter((t) => t.status !== 'done').length), icon: ShieldCheck },
            { label: "Members", value: String(realMembers.length), icon: Users },
          ] as const).map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-muted text-indigo-600">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-2xl font-black text-foreground">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-2xl border border-border bg-muted p-1">
          {WORKSPACE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                  isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── BOARD TAB ─────────────────────────────────── */}
        {activeTab === 'board' && (
          <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
            {/* Left sidebar */}
            <div className="space-y-4">
              {/* Profession selector */}
              <SurfaceCard>
                <SectionTitle icon={Users} title="Profession" description="Filter boards and tasks by role." />
                <div className="flex flex-wrap gap-2">
                  {Object.values(PROFESSION_PRESETS).map((preset) => {
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
                          setNotice(`${preset.label} workspace applied`);
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
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["All", ...activePreset.filters].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setFocusFilter(filter)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition-colors",
                        focusFilter === filter
                          ? "bg-indigo-600 text-white ring-indigo-600"
                          : "bg-card text-muted-foreground ring-border hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300",
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </SurfaceCard>

              {/* Quick boards */}
              <SurfaceCard>
                <SectionTitle icon={Workflow} title="Boards" description="Active boards for this profession." />
                <div className="flex flex-wrap gap-2">
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

              {/* Create item */}
              <SurfaceCard>
                <SectionTitle icon={Plus} title="Create item" description="Add a board, doc or automation." />
                <div className="space-y-2">
                  <div className="grid gap-2 grid-cols-[110px_1fr]">
                    <select
                      value={newItemType}
                      onChange={(e) => setNewItemType(e.target.value as WorkspaceItemType)}
                      className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus:border-indigo-300"
                      aria-label="Item type"
                    >
                      {(["Board", "Doc", "Automation", "Dashboard"] as WorkspaceItemType[]).map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <input
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateItem(); }}
                      placeholder={`${activePreset.label} name`}
                      className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-indigo-300"
                    />
                  </div>
                  <ActionButton onClick={handleCreateItem} className="w-full justify-center">
                    <Plus className="h-4 w-4" /> Create locally
                  </ActionButton>
                </div>
              </SurfaceCard>

              <WorkspaceHierarchy zone={WORKSPACE_ZONE} activeBoard={activeBoard} onSelectBoard={setActiveBoard} />
            </div>

            {/* Main content */}
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <ViewSwitcher views={POWER_VIEWS} value={activeView} onChange={setActiveView} />
                <div className="flex flex-wrap gap-2">
                  <Pill tone="green">{WORKSPACE_ZONE.health}% health</Pill>
                  <Pill tone="indigo">{activePreset.label}: {activeBoard}</Pill>
                </div>
              </div>

              <FilterBar query={query} onQueryChange={setQuery} chips={[...activePreset.filters.slice(0, 4), "Saved view"]} />

              {effectiveDisplayTasks.length === 0 && (
                <SurfaceCard className="border-dashed text-center">
                  <p className="font-black text-foreground">
                    {activeWorkspace ? 'No tasks in this workspace yet' : 'No matching workspace items'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeWorkspace
                      ? 'Create a project and add tasks, or open Projects.'
                      : 'Try another profession preset or clear search.'}
                  </p>
                </SurfaceCard>
              )}

              {activeView === "board" && effectiveDisplayTasks.length > 0 && (
                <SurfaceCard>
                  <SectionTitle icon={LayoutDashboard} title={`${activePreset.label} board`} description="Tasks grouped by status." />
                  <div className="grid gap-3 xl:grid-cols-4">
                    {(["todo", "in_progress", "review", "done"] as const).map((status) => (
                      <div key={status} className="rounded-2xl bg-muted p-3 ring-1 ring-border">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-black capitalize text-foreground">{status.replace("_", " ")}</h3>
                          <Pill tone="slate">{effectiveDisplayTasks.filter((t) => t.status === status).length}</Pill>
                        </div>
                        <div className="space-y-2">
                          {effectiveDisplayTasks.filter((t) => t.status === status).map((task) => (
                            <div key={task.id} className="rounded-2xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                              <p className="text-sm font-black text-foreground">{task.title}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {task.tags.slice(0, 2).map((tag) => <Pill key={tag} tone="blue">{tag}</Pill>)}
                              </div>
                              <ProgressBar value={task.progress} label={task.assignee} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              {(activeView === "list" || activeView === "table") && (
                <DataTable columns={["Task", "Project", "Owner", "Priority", "Due"]} rows={taskRows} />
              )}

              {activeView === "calendar" && (
                <SurfaceCard>
                  <SectionTitle icon={LayoutDashboard} title="Calendar" description="Deadline preview for tasks." />
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {effectiveDisplayTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-border bg-muted p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-500">{task.dueDate}</p>
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
                      <div key={task.id} className="grid gap-3 rounded-2xl border border-border bg-muted p-4 md:grid-cols-[1fr_2fr_0.5fr] md:items-center">
                        <div>
                          <p className="font-black text-foreground">{task.title}</p>
                          <p className="text-xs text-muted-foreground">{task.estimate} estimate</p>
                        </div>
                        <ProgressBar value={task.progress} />
                        <Pill tone="indigo">{task.dueDate}</Pill>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              {activeView === "dashboard" && (
                <SurfaceCard>
                  <SectionTitle icon={LayoutDashboard} title="Insight board" description="Saved dashboard widgets." />
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {DASHBOARD_WIDGETS.slice(0, 4).map((widget) => <WidgetCard key={widget.id} widget={widget} />)}
                  </div>
                </SurfaceCard>
              )}
            </div>
          </div>
        )}

        {/* ── OVERVIEW TAB ──────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              {/* Readiness */}
              <SurfaceCard>
                <SectionTitle icon={ShieldCheck} title="Workspace readiness" description="Health score across tasks, tools and saved states." />
                <div className="grid gap-4 md:grid-cols-[140px_1fr] md:items-start">
                  <div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-indigo-50 via-white to-blue-50 ring-1 ring-indigo-100 dark:from-indigo-500/10 dark:via-card dark:to-blue-500/10 dark:ring-indigo-500/25">
                    <div className="text-center">
                      <p className="text-4xl font-black text-foreground">{readinessScore}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">ready</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {workspaceSignals.map((signal) => (
                      <div key={signal.label}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">{signal.label}</span>
                          <Pill tone={signal.tone}>{signal.value}%</Pill>
                        </div>
                        <ProgressBar value={signal.value} />
                      </div>
                    ))}
                  </div>
                </div>
              </SurfaceCard>

              {/* Signal feed */}
              <SurfaceCard>
                <SectionTitle icon={Bell} title="Signal feed" description="Active alerts for this workspace." />
                <div className="space-y-3">
                  {[
                    { title: "Focus lane", body: `${focusFilter} filter — ${effectiveDisplayTasks.length} visible items.`, icon: Filter, tone: "blue" as const },
                    { title: "Review pressure", body: `${reviewCount + highPriorityCount} items need attention or priority review.`, icon: ShieldCheck, tone: reviewCount ? "amber" as const : "green" as const },
                    { title: "Integration coverage", body: missingRecommended.length ? `${missingRecommended.length} recommended tools ready to connect.` : "All recommended tools connected.", icon: Database, tone: missingRecommended.length ? "amber" as const : "green" as const },
                    { title: "Saved workspace", body: `${snapshots.length} snapshots and ${createdItems.length} local objects stored.`, icon: Save, tone: snapshots.length ? "indigo" as const : "slate" as const },
                  ].map(({ title, body, icon: Icon, tone }) => (
                    <div key={title} className="flex items-start gap-3 rounded-2xl border border-border bg-muted p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-indigo-600 shadow-sm">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-foreground">{title}</p>
                          <Pill tone={tone}>Signal</Pill>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              {/* Workload */}
              <SurfaceCard>
                <SectionTitle icon={Timer} title="Workload" description="Capacity overview by assignee." />
                {workloadLanes.length === 0 ? (
                  <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground ring-1 ring-border">No workload data in current filter.</p>
                ) : (
                  <div className="space-y-3">
                    {workloadLanes.map((lane) => (
                      <div key={lane.owner} className="rounded-2xl border border-border bg-muted p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-black text-foreground">{lane.owner}</p>
                            <p className="text-xs text-muted-foreground">{lane.tasks} tasks · {lane.focus}</p>
                          </div>
                          <Pill tone={lane.capacity > 72 ? "amber" : "green"}>{lane.capacity}% capacity</Pill>
                        </div>
                        <ProgressBar value={lane.progress} label={`${lane.risk} risk items`} />
                      </div>
                    ))}
                  </div>
                )}
              </SurfaceCard>

              {/* Saved states */}
              <div className="space-y-4">
                <SurfaceCard>
                  <SectionTitle icon={Save} title="Saved states" description="Restore saved workspace views." />
                  {snapshots.length === 0 ? (
                    <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">No saved states yet. Use Save view above.</p>
                  ) : (
                    <div className="space-y-2">
                      {snapshots.map((snap) => (
                        <button
                          key={snap.id}
                          type="button"
                          onClick={() => restoreSnapshot(snap)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-muted p-3 text-left transition-colors hover:bg-card hover:shadow-sm"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-foreground">{snap.name}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{snap.createdAt}</span>
                          </span>
                          <Pill tone="blue">Restore</Pill>
                        </button>
                      ))}
                    </div>
                  )}
                </SurfaceCard>

                <SurfaceCard>
                  <SectionTitle icon={Plus} title="Created locally" description="Objects saved in localStorage." />
                  {createdItems.length === 0 ? (
                    <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">No items created yet. Use the Board tab to create.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {createdItems.slice(0, 6).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-border bg-muted p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Pill tone={item.type === "Automation" ? "amber" : item.type === "Dashboard" ? "indigo" : "blue"}>{item.type}</Pill>
                            <span className="text-[10px] text-muted-foreground">{item.createdAt}</span>
                          </div>
                          <p className="mt-2 text-sm font-black text-foreground">{item.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </SurfaceCard>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ──────────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              {/* Automation rules */}
              <SurfaceCard>
                <div className="flex items-start justify-between gap-3">
                  <SectionTitle icon={Workflow} title="Automation rules" description="Toggle review gates, deadline and AI summary rules." />
                  <Pill tone={enabledRules ? "green" : "slate"}>{enabledRules}/{workspaceRules.length} active</Pill>
                </div>
                <div className="space-y-3">
                  {workspaceRules.map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => setWorkspaceRules((cur) => cur.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-sm",
                        rule.enabled ? "border-indigo-100 bg-indigo-50/60 dark:border-indigo-500/25 dark:bg-indigo-500/10" : "border-border bg-muted hover:bg-card",
                      )}
                    >
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", rule.enabled ? "bg-card text-indigo-600 shadow-sm" : "bg-card text-muted-foreground ring-1 ring-border")}>
                        <PlayCircle className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-foreground">{rule.title}</span>
                          <Pill tone={rule.enabled ? "green" : "slate"}>{rule.enabled ? "On" : "Off"}</Pill>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">{rule.trigger} → {rule.action}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </SurfaceCard>

              {/* Custom fields */}
              <SurfaceCard>
                <div className="flex items-start justify-between gap-3">
                  <SectionTitle icon={Columns3} title="Custom fields" description="Control what every board tracks." />
                  <Pill tone={enabledFields > 2 ? "green" : "amber"}>{enabledFields} enabled</Pill>
                </div>
                <div className="flex gap-2">
                  <input
                    value={fieldDraft}
                    onChange={(e) => setFieldDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustomField(); }}
                    placeholder="Add field: Client, Budget..."
                    className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-indigo-300"
                  />
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white hover:bg-indigo-500"
                  >
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {workspaceFields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => setWorkspaceFields((cur) => cur.map((f) => f.id === field.id ? { ...f, enabled: !f.enabled } : f))}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors",
                        field.enabled ? "border-emerald-100 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10" : "border-border bg-muted hover:bg-card",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-foreground">{field.label}</span>
                        <span className="text-xs text-muted-foreground">{field.type}</span>
                      </span>
                      <Pill tone={field.enabled ? "green" : "slate"}>{field.enabled ? "Visible" : "Hidden"}</Pill>
                    </button>
                  ))}
                </div>
              </SurfaceCard>
            </div>

            {/* Control switches */}
            <SurfaceCard>
              <SectionTitle icon={Settings} title="Workspace controls" description="Toggle workspace behaviour settings." />
              <div className="grid gap-3 md:grid-cols-3">
                {CONTROL_SWITCHES.map((control) => (
                  <button
                    key={control.id}
                    type="button"
                    onClick={() => setControls((cur) => ({ ...cur, [control.id]: !cur[control.id] }))}
                    className={cn("rounded-2xl border p-4 text-left transition-all", controls[control.id] ? "border-indigo-100 bg-card shadow-sm dark:border-indigo-500/25" : "border-border bg-muted")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-foreground">{control.label}</span>
                      <span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", controls[control.id] ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700")}>
                        <span className={cn("block h-4 w-4 rounded-full bg-card transition-transform", controls[control.id] && "translate-x-4")} />
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{control.detail}</p>
                  </button>
                ))}
              </div>
            </SurfaceCard>

            {/* Integrations */}
            <SurfaceCard>
              <SectionTitle icon={Database} title="Integration ecosystem" description="Recommended tools change by profession." />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {INTEGRATIONS.map(({ id, name, icon: Icon, desc }) => {
                  const connected = integrationState[id];
                  const recommended = activePreset.integrations.includes(id);
                  return (
                    <div
                      key={id}
                      className={cn(
                        "rounded-2xl border p-4",
                        recommended ? "border-indigo-100 bg-indigo-50/45 dark:border-indigo-500/25 dark:bg-indigo-500/10" : "border-border bg-muted",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-indigo-600 shadow-sm">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="flex gap-1">
                          {recommended && <Pill tone="indigo">Recommended</Pill>}
                          <Pill tone={connected ? "green" : "slate"}>{connected ? "Connected" : "Ready"}</Pill>
                        </div>
                      </div>
                      <h3 className="mt-3 font-black text-foreground">{name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                      <button
                        type="button"
                        onClick={() => setIntegrationState((cur) => ({ ...cur, [id]: !cur[id] }))}
                        className={cn(
                          "mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black transition-colors",
                          connected
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25"
                            : "bg-card text-muted-foreground ring-1 ring-border hover:text-indigo-700 dark:hover:text-indigo-300",
                        )}
                      >
                        {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {connected ? "Connected" : "Connect"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>
          </div>
        )}

        {/* ── TEAM TAB ──────────────────────────────────── */}
        {activeTab === 'team' && (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              {/* Access matrix */}
              <SurfaceCard>
                <div className="flex items-start justify-between gap-3">
                  <SectionTitle icon={LockKeyhole} title="Team access matrix" description="Permission preview for workspace roles." />
                  <button
                    type="button"
                    onClick={() => document.getElementById('workspace-team')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                  >
                    Invite member
                  </button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border">
                  {ROLE_MATRIX.map((row) => (
                    <div key={row.role} className="grid gap-2 border-b border-border bg-card p-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
                      <div>
                        <p className="font-black text-foreground">{row.role}</p>
                        <p className="text-xs text-muted-foreground">{row.note}</p>
                      </div>
                      {([["Create", row.canCreate], ["Save", row.canSave], ["Connect", row.canConnect]] as [string, boolean][]).map(([label, allowed]) => (
                        <div key={label} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-xs font-bold text-foreground">
                          <span className={cn("h-2 w-2 rounded-full", allowed ? "bg-emerald-500" : "bg-slate-300")} />
                          {label}
                        </div>
                      ))}
                      <Pill tone={row.role === "Owner" ? "indigo" : row.role === "Viewer" ? "slate" : "blue"}>
                        {row.role === "Owner" ? "Full" : "Scoped"}
                      </Pill>
                    </div>
                  ))}
                </div>
              </SurfaceCard>

              {/* Workload */}
              <SurfaceCard>
                <SectionTitle icon={Timer} title="Team workload" description="Capacity by assignee from current task data." />
                {workloadLanes.length === 0 ? (
                  <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground ring-1 ring-border">No team workload data available.</p>
                ) : (
                  <div className="space-y-3">
                    {workloadLanes.map((lane) => (
                      <div key={lane.owner} className="rounded-2xl border border-border bg-muted p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-black text-foreground">{lane.owner}</p>
                            <p className="text-xs text-muted-foreground">{lane.tasks} tasks · {lane.focus}</p>
                          </div>
                          <Pill tone={lane.capacity > 72 ? "amber" : "green"}>{lane.capacity}% capacity</Pill>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-xl bg-card p-3 ring-1 ring-border">
                            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">Progress</p>
                            <ProgressBar value={lane.progress} />
                          </div>
                          <div className="rounded-xl bg-card p-3 ring-1 ring-border">
                            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Risk load</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xl font-black text-foreground">{lane.risk}</span>
                              <Pill tone={lane.risk ? "amber" : "green"}>{lane.risk ? "Watch" : "Clear"}</Pill>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SurfaceCard>
            </div>
          </div>
        )}
      </PageShell>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-lg">
          {notice}
        </div>
      )}
    </>
  );
}
