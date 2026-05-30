import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Code2,
  Columns3,
  Database,
  Figma,
  Filter,
  FileText,
  Github,
  GraduationCap,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Map as MapIcon,
  Megaphone,
  NotepadText,
  Palette,
  PlayCircle,
  Plus,
  Rocket,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Slack,
  Sparkles,
  Target,
  Timer,
  UploadCloud,
  UserPlus,
  Users,
  Video,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { DataTable, FilterBar, ViewSwitcher, WidgetCard, WorkspaceHierarchy } from "@/components/app/PowerWorkspaceSystem";
import { CLIP_ITEMS, DASHBOARD_WIDGETS, DOC_PAGES, FORM_FIELDS, POWER_VIEWS, SMART_TASKS, WHITEBOARD_NODES, WORKSPACE_ZONE } from "@/data/ecosystemData";
import type { Profession, TaskView, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

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

type WorkspaceMilestone = {
  id: string;
  title: string;
  owner: string;
  target: string;
  progress: number;
  due: string;
  status: "on_track" | "risk" | "planned";
};

type WorkspaceViewPreset = {
  id: string;
  title: string;
  profession: Profession | "all";
  view: TaskView;
  board: string;
  filters: string[];
  description: string;
  createdAt: string;
};

type TemplateKit = {
  id: string;
  title: string;
  profession: Profession | "all";
  description: string;
  items: WorkspaceItemType[];
  boards: string[];
  integrations: string[];
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
  { id: "github", name: "GitHub", icon: Github, desc: "Repo, PR, issue and commit activity placeholder." },
  { id: "drive", name: "Drive", icon: HardDrive, desc: "Docs, files, assets and handoff folders." },
  { id: "calendar", name: "Calendar", icon: Calendar, desc: "Deadlines, meetings, agenda and reminder sync." },
  { id: "slack", name: "Slack", icon: Slack, desc: "Team notifications and channel mirroring." },
  { id: "figma", name: "Figma", icon: Figma, desc: "Design files, exports, review comments and tokens." },
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

const DEFAULT_MILESTONES: WorkspaceMilestone[] = [
  { id: "ms-launch", title: "Launch-ready workspace", owner: "Jasur", target: "Publish core operating flow", progress: 76, due: "May 18", status: "on_track" },
  { id: "ms-automation", title: "Automation coverage", owner: "AI Ops", target: "Enable review, deadline and summary rules", progress: 52, due: "May 24", status: "planned" },
  { id: "ms-integration", title: "Tool connection map", owner: "Team", target: "Connect recommended profession tools", progress: 68, due: "May 29", status: "risk" },
];

const DEFAULT_VIEW_PRESETS: WorkspaceViewPreset[] = [
  {
    id: "preset-executive",
    title: "Executive pulse",
    profession: "all",
    view: "dashboard",
    board: "Roadmap",
    filters: ["Saved view", "Review"],
    description: "High-level widgets, risk count and progress for a quick morning scan.",
    createdAt: "Default",
  },
  {
    id: "preset-delivery",
    title: "Delivery control",
    profession: "freelancer",
    view: "timeline",
    board: "Delivery",
    filters: ["Client", "Delivery"],
    description: "Client work, due dates and handoff flow in one saved preset.",
    createdAt: "Default",
  },
  {
    id: "preset-design",
    title: "Design QA room",
    profession: "designer",
    view: "board",
    board: "Design QA",
    filters: ["Design System", "Power UI"],
    description: "Review components, UX fixes and handoff tasks with design filters.",
    createdAt: "Default",
  },
  {
    id: "preset-dev",
    title: "Sprint cockpit",
    profession: "developer",
    view: "table",
    board: "Sprint",
    filters: ["Automation", "Tasks"],
    description: "Compact engineering table for sprint owners, priority and due dates.",
    createdAt: "Default",
  },
];

const TEMPLATE_KITS: TemplateKit[] = [
  {
    id: "kit-launch",
    title: "Startup launch kit",
    profession: "all",
    description: "Roadmap, launch dashboard, QA automation and docs for a product release.",
    items: ["Board", "Dashboard", "Automation", "Doc"],
    boards: ["Launch", "QA", "Metrics"],
    integrations: ["calendar", "drive", "slack"],
  },
  {
    id: "kit-dev",
    title: "Engineering sprint kit",
    profession: "developer",
    description: "Sprint, PR review, release readiness and GitHub-first workflow.",
    items: ["Board", "Automation", "Dashboard"],
    boards: ["Sprint", "Review", "Release"],
    integrations: ["github", "calendar", "figma"],
  },
  {
    id: "kit-design",
    title: "Design handoff kit",
    profession: "designer",
    description: "Design QA, component review, token handoff and Figma-ready lanes.",
    items: ["Board", "Doc", "Dashboard"],
    boards: ["Design QA", "Components", "Handoff"],
    integrations: ["figma", "drive", "notion"],
  },
  {
    id: "kit-client",
    title: "Client delivery kit",
    profession: "freelancer",
    description: "Deals, delivery, invoice, feedback and client archive operating flow.",
    items: ["Board", "Doc", "Automation", "Dashboard"],
    boards: ["Deals", "Delivery", "Invoices"],
    integrations: ["calendar", "drive", "notion"],
  },
  {
    id: "kit-growth",
    title: "Growth content kit",
    profession: "smm",
    description: "Campaign calendar, approvals, analytics and channel publishing workflow.",
    items: ["Board", "Dashboard", "Automation"],
    boards: ["Campaigns", "Approvals", "Analytics"],
    integrations: ["slack", "calendar", "figma"],
  },
  {
    id: "kit-learning",
    title: "Learning progress kit",
    profession: "student",
    description: "Study boards, mentor review, deadlines and portfolio proof tracker.",
    items: ["Board", "Doc", "Dashboard"],
    boards: ["Study", "Portfolio", "Reviews"],
    integrations: ["calendar", "drive", "notion"],
  },
];

const ROLE_MATRIX = [
  { role: "Owner", canCreate: true, canSave: true, canConnect: true, note: "Full workspace control" },
  { role: "Admin", canCreate: true, canSave: true, canConnect: true, note: "Team and integration setup" },
  { role: "Member", canCreate: true, canSave: false, canConnect: false, note: "Create work, follow saved views" },
  { role: "Viewer", canCreate: false, canSave: false, canConnect: false, note: "Read-only progress tracking" },
];

const INTAKE_ROUTES = [
  { id: "intake-task", title: "Task request", source: "Workspace form", route: "Backlog board", owner: "Project lead", fields: ["Title", "Owner", "Deadline"], icon: ClipboardList },
  { id: "intake-client", title: "Client brief", source: "Public link", route: "Delivery board", owner: "Freelancer", fields: ["Scope", "Budget", "Files"], icon: Link2 },
  { id: "intake-idea", title: "Idea capture", source: "AI assistant", route: "Ideas board", owner: "Creator", fields: ["Idea", "Channel", "Priority"], icon: Sparkles },
];

const EXPORT_PACKS = [
  { id: "export-board", title: "Board backup", detail: "Tasks, fields, statuses and saved filters.", icon: Archive, tone: "blue" as const },
  { id: "export-assets", title: "Asset handoff", detail: "Docs, canvas notes, forms and screen notes.", icon: UploadCloud, tone: "indigo" as const },
  { id: "export-audit", title: "Audit log", detail: "Workspace changes, rules and integration toggles.", icon: ShieldCheck, tone: "green" as const },
];

const GOVERNANCE_CHECKS = [
  { title: "Naming structure", detail: "Boards use clear profession-specific labels.", status: "Healthy", tone: "green" as const },
  { title: "Access hygiene", detail: "Role matrix is ready for backend permissions.", status: "Ready", tone: "blue" as const },
  { title: "Data portability", detail: "Export packs are prepared as frontend placeholders.", status: "Mock", tone: "slate" as const },
  { title: "Review accountability", detail: "Risk and review items are surfaced in signal feed.", status: "Active", tone: "indigo" as const },
];

const BASE_INTEGRATIONS = INTEGRATIONS.reduce<Record<string, boolean>>((acc, integration) => {
  acc[integration.id] = integration.id === "github";
  return acc;
}, {});

function formatStamp() {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function taskMatchesPreset(taskText: string, filters: string[]) {
  return filters.some((filter) => taskText.includes(filter.toLowerCase()));
}

export default function WorkspacePage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<TaskView>(() => storage.getActiveView() ?? "board");
  const [activeBoard, setActiveBoard] = useState(() => storage.getActiveBoard() ?? "Roadmap");
  const [activeProfession, setActiveProfession] = useState<Profession>(() => storage.getWorkspaceProfession() ?? user.profession);
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
  const [milestones, setMilestones] = useState<WorkspaceMilestone[]>(() => {
    const saved = storage.getWorkspaceMilestones<WorkspaceMilestone>();
    return saved.length > 0 ? saved : DEFAULT_MILESTONES;
  });
  const [viewPresets, setViewPresets] = useState<WorkspaceViewPreset[]>(() => {
    const saved = storage.getWorkspaceViewPresets<WorkspaceViewPreset>();
    return saved.length > 0 ? saved : DEFAULT_VIEW_PRESETS;
  });
  const [fieldDraft, setFieldDraft] = useState("");
  const [controls, setControls] = useState<Record<(typeof CONTROL_SWITCHES)[number]["id"], boolean>>({ autoSave: true, reviewGate: true, integrationGuard: true });

  const activePreset = PROFESSION_PRESETS[activeProfession] ?? PROFESSION_PRESETS.developer;
  const createdBoards = createdItems.filter((item) => item.type === "Board" && item.profession === activeProfession).map((item) => item.title);
  const quickBoards = Array.from(new Set([...activePreset.boards, ...createdBoards]));
  const connectedCount = INTEGRATIONS.filter((integration) => integrationState[integration.id]).length;
  const missingRecommended = activePreset.integrations.filter((id) => !integrationState[id]);
  const integrationCoverage = Math.round(((activePreset.integrations.length - missingRecommended.length) / Math.max(activePreset.integrations.length, 1)) * 100);
  const enabledRules = workspaceRules.filter((rule) => rule.enabled).length;
  const enabledFields = workspaceFields.filter((field) => field.enabled).length;
  const automationScore = Math.round((enabledRules / Math.max(workspaceRules.length, 1)) * 100);
  const fieldScore = Math.min(100, enabledFields * 18);
  const availableTemplateKits = TEMPLATE_KITS.filter((kit) => kit.profession === "all" || kit.profession === activeProfession);
  const milestoneScore = Math.round(milestones.reduce((sum, milestone) => sum + milestone.progress, 0) / Math.max(milestones.length, 1));
  const visibleViewPresets = viewPresets.filter((preset) => preset.profession === "all" || preset.profession === activeProfession);

  const professionTasks = useMemo(() => {
    const matching = SMART_TASKS.filter((task) => {
      const taskText = `${task.title} ${task.description} ${task.project} ${task.assignee} ${task.tags.join(" ")} ${task.fields.map((field) => field.value).join(" ")}`.toLowerCase();
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

  const workloadLanes = useMemo(() => {
    const workload = new Map<string, { owner: string; tasks: number; progress: number; risk: number; focus: string }>();

    filteredTasks.forEach((task) => {
      const existing = workload.get(task.assignee) ?? { owner: task.assignee, tasks: 0, progress: 0, risk: 0, focus: task.project };
      existing.tasks += 1;
      existing.progress += task.progress;
      existing.risk += task.priority === "high" || task.status === "blocked" ? 1 : 0;
      existing.focus = task.project;
      workload.set(task.assignee, existing);
    });

    return Array.from(workload.values()).slice(0, 4).map((lane) => ({
      ...lane,
      capacity: Math.min(100, Math.round((lane.tasks / Math.max(filteredTasks.length, 1)) * 100) + lane.risk * 12),
      progress: Math.round(lane.progress / Math.max(lane.tasks, 1)),
    }));
  }, [filteredTasks]);

  const avgProgress = Math.round(filteredTasks.reduce((sum, task) => sum + task.progress, 0) / Math.max(filteredTasks.length, 1));
  const highPriorityCount = filteredTasks.filter((task) => task.priority === "high").length;
  const reviewCount = filteredTasks.filter((task) => task.status === "review" || task.status === "blocked").length;
  const savedScore = Math.min(100, snapshots.length * 24 + createdItems.length * 12);
  const readinessScore = Math.round((WORKSPACE_ZONE.health + avgProgress + integrationCoverage + savedScore + automationScore + fieldScore + milestoneScore) / 7);
  const workspaceSignals = [
    { label: "Task progress", value: avgProgress, tone: "indigo" as const },
    { label: "Integration match", value: integrationCoverage, tone: missingRecommended.length ? "amber" as const : "green" as const },
    { label: "Saved control", value: savedScore, tone: snapshots.length ? "blue" as const : "slate" as const },
    { label: "Automation rules", value: automationScore, tone: enabledRules ? "indigo" as const : "slate" as const },
    { label: "Custom fields", value: fieldScore, tone: enabledFields > 2 ? "green" as const : "amber" as const },
    { label: "Milestones", value: milestoneScore, tone: milestoneScore > 65 ? "green" as const : "amber" as const },
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
  useEffect(() => storage.saveWorkspaceMilestones(milestones), [milestones]);
  useEffect(() => storage.saveWorkspaceViewPresets(viewPresets), [viewPresets]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const taskRows = filteredTasks.map((task) => ({
    id: task.id,
    cells: [
      <span className="font-black">{task.title}</span>,
      <Pill tone="blue">{task.project}</Pill>,
      <span>{task.assignee}</span>,
      <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span className="text-[#6B7280]">{task.dueDate}</span>,
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
    setCreatedItems((current) => [item, ...current].slice(0, 12));
    if (newItemType === "Board") setActiveBoard(title);
    setNewItemTitle("");
    setNotice(`${newItemType} created and saved locally`);
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
    setSnapshots((current) => [snapshot, ...current].slice(0, 8));
    setNotice("Workspace control state saved locally");
  };

  const applyProfessionTemplate = () => {
    const stamp = formatStamp();
    const templateBoards: CreatedWorkspaceItem[] = activePreset.boards.map((board, index) => ({
      id: `workspace-template-${Date.now()}-${index}`,
      type: "Board",
      title: board,
      profession: activeProfession,
      board,
      createdAt: stamp,
    }));

    setCreatedItems((current) => {
      const existingTitles = new Set(templateBoards.map((item) => `${item.profession}-${item.title}`));
      const withoutDuplicates = current.filter((item) => !existingTitles.has(`${item.profession}-${item.title}`));
      return [...templateBoards, ...withoutDuplicates].slice(0, 12);
    });
    setActiveBoard(activePreset.boards[0]);
    setFocusFilter("All");
    setNotice(`${activePreset.template} applied locally`);
  };

  const connectRecommendedIntegrations = () => {
    setIntegrationState((current) => {
      const next = { ...current };
      activePreset.integrations.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    setNotice(`${activePreset.label} recommended integrations connected`);
  };

  const applyTemplateKit = (kit: TemplateKit) => {
    const stamp = formatStamp();
    const kitItems: CreatedWorkspaceItem[] = kit.items.flatMap((type, typeIndex) =>
      kit.boards.slice(0, type === "Board" ? kit.boards.length : 1).map((board, boardIndex) => ({
        id: `workspace-kit-${kit.id}-${Date.now()}-${typeIndex}-${boardIndex}`,
        type,
        title: type === "Board" ? board : `${kit.title} ${type}`,
        profession: activeProfession,
        board,
        createdAt: stamp,
      })),
    );

    setCreatedItems((current) => [...kitItems, ...current].slice(0, 16));
    setIntegrationState((current) => {
      const next = { ...current };
      kit.integrations.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    setActiveBoard(kit.boards[0] ?? activeBoard);
    setNotice(`${kit.title} applied locally`);
  };

  const addCustomField = () => {
    const label = fieldDraft.trim();
    if (!label) return;
    setWorkspaceFields((current) => [
      { id: `field-${Date.now()}`, label, type: "Text" as const, enabled: true },
      ...current,
    ].slice(0, 10));
    setFieldDraft("");
    setNotice(`${label} field added`);
  };

  const addMilestone = () => {
    const milestone: WorkspaceMilestone = {
      id: `ms-${Date.now()}`,
      title: `${activePreset.label} operating milestone`,
      owner: user.name.split(" ")[0] ?? "Owner",
      target: `Improve ${activePreset.template}`,
      progress: 18,
      due: "Next 14 days",
      status: "planned",
    };
    setMilestones((current) => [milestone, ...current].slice(0, 8));
    setNotice("Milestone added to command map");
  };

  const advanceMilestone = (milestoneId: string) => {
    setMilestones((current) => current.map((milestone) => {
      if (milestone.id !== milestoneId) return milestone;
      const progress = Math.min(100, milestone.progress + 12);
      return { ...milestone, progress, status: progress > 70 ? "on_track" : milestone.status };
    }));
    setNotice("Milestone progress updated locally");
  };

  const saveViewPreset = () => {
    const preset: WorkspaceViewPreset = {
      id: `preset-${Date.now()}`,
      title: `${activePreset.label} ${activeView} preset`,
      profession: activeProfession,
      view: activeView,
      board: activeBoard,
      filters: focusFilter === "All" ? activePreset.filters.slice(0, 2) : [focusFilter],
      description: `Saved ${activeView} view for ${activeBoard} with ${activePreset.label} filters.`,
      createdAt: formatStamp(),
    };
    setViewPresets((current) => [preset, ...current].slice(0, 10));
    setNotice("View preset saved locally");
  };

  const restoreViewPreset = (preset: WorkspaceViewPreset) => {
    if (preset.profession !== "all") setActiveProfession(preset.profession);
    setActiveView(preset.view);
    setActiveBoard(preset.board);
    setFocusFilter(preset.filters[0] ?? "All");
    setNotice(`${preset.title} restored`);
  };

  const createIntakeRoute = (routeTitle: string) => {
    const item: CreatedWorkspaceItem = {
      id: `workspace-intake-${Date.now()}`,
      type: "Automation",
      title: `${routeTitle} intake route`,
      profession: activeProfession,
      board: activeBoard,
      createdAt: formatStamp(),
    };
    setCreatedItems((current) => [item, ...current].slice(0, 16));
    setNotice(`${routeTitle} route created locally`);
  };

  const restoreSnapshot = (snapshot: WorkspaceSnapshot) => {
    setActiveProfession(snapshot.profession);
    setActiveView(snapshot.view);
    setActiveBoard(snapshot.board);
    setNotice("Saved workspace restored");
  };

  return (
    <AppLayout user={user} title={t("app.nav.workspace")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow="Power Workspace"
          title={`${activePreset.template} for ${user.name}`}
          description="Control, create and save your workspace by profession. Optima keeps boards, views, integrations and saved workspace states local for this MVP."
        >
          <ActionButton onClick={handleCreateItem}><Plus className="h-4 w-4" /> Create</ActionButton>
          <ActionButton variant="secondary" onClick={handleSaveSnapshot}><Save className="h-4 w-4" /> Save view</ActionButton>
        </PageHeader>

        <SurfaceCard className="overflow-hidden p-0">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden p-5 sm:p-6">
              <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-indigo-100/70 blur-3xl" />
              <div className="relative flex flex-col gap-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500">Workspace control center</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-[#111827]">Monitor the zone without making it crowded</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">{activePreset.controlFocus}</p>
                  </div>
                  <Pill tone="green">{WORKSPACE_ZONE.health}% zone health</Pill>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Filtered tasks", value: String(filteredTasks.length), icon: Target, tone: "indigo" as const },
                    { label: "Avg progress", value: `${avgProgress}%`, icon: CheckCircle2, tone: "green" as const },
                    { label: "Review / risk", value: String(reviewCount + highPriorityCount), icon: ShieldCheck, tone: reviewCount ? "amber" as const : "blue" as const },
                    { label: "Tools online", value: `${connectedCount}/${INTEGRATIONS.length}`, icon: Database, tone: missingRecommended.length ? "amber" as const : "green" as const },
                  ].map(({ label, value, icon: Icon, tone }) => (
                    <div key={label} className="rounded-2xl border border-[#E5E7EB] bg-white/86 p-4 shadow-sm backdrop-blur">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
                        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#F7FAFC] text-indigo-600"><Icon className="h-4 w-4" /></span>
                      </div>
                      <p className="mt-3 text-2xl font-black text-[#111827]">{value}</p>
                      <Pill tone={tone} className="mt-3">Live demo</Pill>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={applyProfessionTemplate}
                    className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><Workflow className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-sm font-black text-[#111827]">Apply template</span>
                      <span className="text-xs text-[#6B7280]">{activePreset.boards.length} boards for {activePreset.label}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={connectRecommendedIntegrations}
                    className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-sm"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7FAFC] text-indigo-600"><Database className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-sm font-black text-[#111827]">Connect recommended</span>
                      <span className="text-xs text-[#6B7280]">{missingRecommended.length} missing tool signals</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-sm"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7FAFC] text-indigo-600"><Save className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-sm font-black text-[#111827]">Save control state</span>
                      <span className="text-xs text-[#6B7280]">{snapshots.length} saved snapshots</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-[#E5E7EB] bg-[#F7FAFC] p-5 lg:border-l lg:border-t-0">
              <SectionTitle icon={Settings} title="Create and save" description="Make a board, doc, automation or dashboard and keep it in localStorage." />
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <select
                    value={newItemType}
                    onChange={(event) => setNewItemType(event.target.value as WorkspaceItemType)}
                    className="h-11 rounded-2xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#111827] outline-none focus:border-indigo-300"
                    aria-label="Workspace item type"
                  >
                    {(["Board", "Doc", "Automation", "Dashboard"] as WorkspaceItemType[]).map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <input
                    value={newItemTitle}
                    onChange={(event) => setNewItemTitle(event.target.value)}
                    placeholder={`${activePreset.label} ${newItemType} name`}
                    className="h-11 rounded-2xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none placeholder:text-[#6B7280] focus:border-indigo-300"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={handleCreateItem}><Plus className="h-4 w-4" /> Create locally</ActionButton>
                  <ActionButton variant="secondary" onClick={handleSaveSnapshot}><Save className="h-4 w-4" /> Save current setup</ActionButton>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CONTROL_SWITCHES.map((control) => (
                    <button
                      key={control.id}
                      type="button"
                      onClick={() => setControls((current) => ({ ...current, [control.id]: !current[control.id] }))}
                      className={cn("rounded-2xl border p-3 text-left transition-all", controls[control.id] ? "border-indigo-100 bg-white shadow-sm" : "border-[#E5E7EB] bg-white/60")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-[#111827]">{control.label}</span>
                        <span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", controls[control.id] ? "bg-indigo-600" : "bg-slate-200")}>
                          <span className={cn("block h-4 w-4 rounded-full bg-white transition-transform", controls[control.id] && "translate-x-4")} />
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-4 text-[#6B7280]">{control.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle icon={Users} title="Profession workspace filters" description="Pick a profession and Optima will filter boards, tasks, controls and recommended integrations." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.values(PROFESSION_PRESETS).map((preset) => {
              const Icon = preset.icon;
              const active = preset.id === activeProfession;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setActiveProfession(preset.id);
                    setActiveBoard(preset.boards[0]);
                    setFocusFilter("All");
                    setNotice(`${preset.label} workspace filter applied`);
                  }}
                  className={cn(
                    "rounded-[22px] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
                    active ? "border-indigo-200 bg-indigo-50/70 shadow-sm" : "border-[#E5E7EB] bg-[#F7FAFC] hover:bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", active ? "bg-white text-indigo-600" : "bg-white text-[#6B7280]")}><Icon className="h-5 w-5" /></span>
                    {active && <Pill tone="indigo">Active</Pill>}
                  </div>
                  <h3 className="mt-4 font-black text-[#111827]">{preset.label}</h3>
                  <p className="mt-2 text-sm leading-5 text-[#6B7280]">{preset.summary}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-[#111827]">Active focus lane</p>
                <p className="text-[11px] text-[#6B7280]">Filter the workspace without changing search text.</p>
              </div>
              <Pill tone="blue">{focusFilter}</Pill>
            </div>
            <div className="flex flex-wrap gap-2">
              {["All", ...activePreset.filters].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setFocusFilter(filter)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors",
                    focusFilter === filter ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-[#6B7280] ring-[#E5E7EB] hover:bg-indigo-50 hover:text-indigo-700",
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SurfaceCard>
            <SectionTitle icon={ShieldCheck} title="Workspace readiness" description="A compact health score for tasks, tools, saved states and workspace structure." />
            <div className="grid gap-4 md:grid-cols-[160px_1fr] md:items-center">
              <div className="mx-auto grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-indigo-50 via-white to-blue-50 ring-1 ring-indigo-100">
                <div className="text-center">
                  <p className="text-4xl font-black text-[#111827]">{readinessScore}</p>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">ready</p>
                </div>
              </div>
              <div className="space-y-3">
                {workspaceSignals.map((signal) => (
                  <div key={signal.label} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[#111827]">{signal.label}</span>
                      <Pill tone={signal.tone}>{signal.value}%</Pill>
                    </div>
                    <ProgressBar value={signal.value} />
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Workflow} title={`${activePreset.label} blueprint`} description="Suggested operating structure generated from the selected profession preset." />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-[#F7FAFC] p-4 ring-1 ring-[#E5E7EB]">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">Boards</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activePreset.boards.map((board) => <Pill key={board} tone="blue">{board}</Pill>)}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F7FAFC] p-4 ring-1 ring-[#E5E7EB]">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">Controls</p>
                <div className="mt-3 space-y-2">
                  {CONTROL_SWITCHES.map((control) => (
                    <div key={control.id} className="flex items-center justify-between gap-2 text-xs font-bold text-[#111827]">
                      <span>{control.label}</span>
                      <span className={cn("h-2 w-2 rounded-full", controls[control.id] ? "bg-emerald-500" : "bg-slate-300")} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F7FAFC] p-4 ring-1 ring-[#E5E7EB]">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">Tool coverage</p>
                <p className="mt-3 text-2xl font-black text-[#111827]">{integrationCoverage}%</p>
                <p className="mt-1 text-xs text-[#6B7280]">{missingRecommended.length ? `${missingRecommended.length} recommended tools missing` : "Recommended tools connected"}</p>
              </div>
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <SectionTitle icon={Rocket} title="Template kit library" description="Apply clean profession-ready packs without cluttering the main workspace." />
            <Pill tone="indigo">{availableTemplateKits.length} kits for {activePreset.label}</Pill>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableTemplateKits.map((kit) => (
              <button
                key={kit.id}
                type="button"
                onClick={() => applyTemplateKit(kit)}
                className="group rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
                    <Rocket className="h-5 w-5 transition-transform group-hover:-rotate-12 group-hover:scale-110" />
                  </span>
                  <Pill tone={kit.profession === "all" ? "blue" : "green"}>{kit.profession === "all" ? "Universal" : activePreset.label}</Pill>
                </div>
                <h3 className="mt-4 font-black text-[#111827]">{kit.title}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#6B7280]">{kit.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {kit.items.map((item) => <Pill key={item} tone={item === "Automation" ? "amber" : item === "Dashboard" ? "indigo" : "blue"}>{item}</Pill>)}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {kit.integrations.map((id) => {
                    const integration = INTEGRATIONS.find((item) => item.id === id);
                    return <Pill key={id} tone={integrationState[id] ? "green" : "slate"}>{integration?.name ?? id}</Pill>;
                  })}
                </div>
              </button>
            ))}
          </div>
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <SurfaceCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle icon={SlidersHorizontal} title="Automation rules" description="Tiny local demo rules for review gates, deadlines and AI summaries." />
              <Pill tone={enabledRules ? "green" : "slate"}>{enabledRules}/{workspaceRules.length} active</Pill>
            </div>
            <div className="mt-4 space-y-3">
              {workspaceRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setWorkspaceRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[22px] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
                    rule.enabled ? "border-indigo-100 bg-indigo-50/60" : "border-[#E5E7EB] bg-[#F7FAFC] hover:bg-white",
                  )}
                >
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", rule.enabled ? "bg-white text-indigo-600 shadow-sm" : "bg-white text-[#6B7280] ring-1 ring-[#E5E7EB]")}>
                    <PlayCircle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-[#111827]">{rule.title}</span>
                      <Pill tone={rule.enabled ? "green" : "slate"}>{rule.enabled ? "On" : "Off"}</Pill>
                    </span>
                    <span className="mt-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#6B7280]">When</span>
                    <span className="mt-1 block text-sm text-[#111827]">{rule.trigger}</span>
                    <span className="mt-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#6B7280]">Then</span>
                    <span className="mt-1 block text-sm text-[#6B7280]">{rule.action}</span>
                  </span>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle icon={Columns3} title="Custom field builder" description="Control what every board tracks before backend fields exist." />
              <Pill tone={enabledFields > 2 ? "green" : "amber"}>{enabledFields} enabled</Pill>
            </div>
            <div className="mt-4 rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={fieldDraft}
                  onChange={(event) => setFieldDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addCustomField();
                  }}
                  placeholder="Add field: Client, Budget, Skill level..."
                  className="h-11 flex-1 rounded-2xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] outline-none placeholder:text-[#6B7280] focus:border-indigo-300"
                />
                <button
                  type="button"
                  onClick={addCustomField}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:bg-indigo-600"
                >
                  <Plus className="h-4 w-4" />
                  Add field
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {workspaceFields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setWorkspaceFields((current) => current.map((item) => item.id === field.id ? { ...item, enabled: !item.enabled } : item))}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors",
                    field.enabled ? "border-emerald-100 bg-emerald-50/70" : "border-[#E5E7EB] bg-[#F7FAFC] hover:bg-white",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#111827]">{field.label}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7280]">
                      <Filter className="h-3.5 w-3.5" />
                      {field.type}
                    </span>
                  </span>
                  <Pill tone={field.enabled ? "green" : "slate"}>{field.enabled ? "Visible" : "Hidden"}</Pill>
                </button>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SurfaceCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle icon={LockKeyhole} title="Team access matrix" description="A backend-ready permission preview for workspace roles." />
              <button
                type="button"
                onClick={() => setNotice("Invite flow placeholder opened locally")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-2 text-xs font-black text-[#111827] transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                Invite member
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#E5E7EB]">
              {ROLE_MATRIX.map((row) => (
                <div key={row.role} className="grid gap-3 border-b border-[#E5E7EB] bg-white p-3 last:border-b-0 md:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_1.4fr] md:items-center">
                  <div>
                    <p className="font-black text-[#111827]">{row.role}</p>
                    <p className="text-xs text-[#6B7280]">{row.note}</p>
                  </div>
                  {[
                    ["Create", row.canCreate],
                    ["Save", row.canSave],
                    ["Connect", row.canConnect],
                  ].map(([label, allowed]) => (
                    <div key={String(label)} className="flex items-center justify-between rounded-2xl bg-[#F7FAFC] px-3 py-2 text-xs font-black text-[#111827] md:justify-start md:gap-2">
                      <span>{label}</span>
                      <span className={cn("h-2.5 w-2.5 rounded-full", allowed ? "bg-emerald-500" : "bg-slate-300")} />
                    </div>
                  ))}
                  <Pill tone={row.role === "Owner" ? "indigo" : row.role === "Viewer" ? "slate" : "blue"}>{row.role === "Owner" ? "Full control" : "Scoped"}</Pill>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Bell} title="Workspace signal feed" description="Small alerts that keep the workspace controlled without heavy panels." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                { title: "Focus lane active", body: `${focusFilter} filter is shaping ${filteredTasks.length} visible items.`, icon: Filter, tone: "blue" as const },
                { title: "Review pressure", body: `${reviewCount + highPriorityCount} items need attention or priority review.`, icon: ShieldCheck, tone: reviewCount ? "amber" as const : "green" as const },
                { title: "Integration coverage", body: missingRecommended.length ? `${missingRecommended.length} recommended tools still ready to connect.` : "All recommended tools are connected in demo mode.", icon: Database, tone: missingRecommended.length ? "amber" as const : "green" as const },
                { title: "Saved workspace", body: `${snapshots.length} saved snapshots and ${createdItems.length} local objects are stored.`, icon: Save, tone: snapshots.length ? "indigo" as const : "slate" as const },
              ].map(({ title, body, icon: Icon, tone }) => (
                <div key={title} className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-[#111827]">{title}</p>
                        <Pill tone={tone}>Signal</Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#6B7280]">{body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <SurfaceCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle icon={MapIcon} title="Milestone command map" description="Track big workspace outcomes without opening a separate project module." />
              <button
                type="button"
                onClick={addMilestone}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-black text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Add milestone
              </button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr]">
              <div className="rounded-[24px] bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 text-center ring-1 ring-indigo-100">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                  <Gauge className="h-5 w-5" />
                </span>
                <p className="mt-4 text-4xl font-black text-[#111827]">{milestoneScore}%</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-indigo-500">goal pulse</p>
                <p className="mt-3 text-xs leading-5 text-[#6B7280]">Average progress across workspace operating goals.</p>
              </div>
              <div className="space-y-3">
                {milestones.map((milestone) => (
                  <button
                    key={milestone.id}
                    type="button"
                    onClick={() => advanceMilestone(milestone.id)}
                    className="w-full rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-black text-[#111827]">{milestone.title}</p>
                        <p className="mt-1 text-sm text-[#6B7280]">{milestone.target}</p>
                      </div>
                      <Pill tone={milestone.status === "risk" ? "amber" : milestone.status === "on_track" ? "green" : "slate"}>{milestone.status.replace("_", " ")}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill tone="blue">{milestone.owner}</Pill>
                      <Pill tone="slate">{milestone.due}</Pill>
                    </div>
                    <ProgressBar value={milestone.progress} label={`${milestone.progress}% complete`} />
                  </button>
                ))}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Timer} title="Workload and capacity" description="Quick capacity view based on filtered tasks and current profession focus." />
            <div className="mt-4 space-y-3">
              {workloadLanes.map((lane) => (
                <div key={lane.owner} className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-[#111827]">{lane.owner}</p>
                      <p className="text-xs text-[#6B7280]">{lane.tasks} tasks - focus: {lane.focus}</p>
                    </div>
                    <Pill tone={lane.capacity > 72 ? "amber" : "green"}>{lane.capacity}% capacity</Pill>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6B7280]">Progress</p>
                      <ProgressBar value={lane.progress} />
                    </div>
                    <div className="rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6B7280]">Risk load</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-2xl font-black text-[#111827]">{lane.risk}</span>
                        <Pill tone={lane.risk ? "amber" : "green"}>{lane.risk ? "Watch" : "Clear"}</Pill>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {workloadLanes.length === 0 && (
                <p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-[#6B7280] ring-1 ring-[#E5E7EB]">No workload lanes in the current filter.</p>
              )}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SurfaceCard>
            <SectionTitle icon={ClipboardList} title="Intake pipeline builder" description="Turn outside requests into clean workspace routes." />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {INTAKE_ROUTES.map(({ id, title, source, route, owner, fields, icon: Icon }) => (
                <div key={id} className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <Pill tone="blue">{source}</Pill>
                  </div>
                  <h3 className="mt-4 font-black text-[#111827]">{title}</h3>
                  <p className="mt-1 text-sm text-[#6B7280]">{route} - {owner}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {fields.map((field) => <Pill key={field} tone="slate">{field}</Pill>)}
                  </div>
                  <button
                    type="button"
                    onClick={() => createIntakeRoute(title)}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#111827] ring-1 ring-[#E5E7EB] transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <Workflow className="h-4 w-4" />
                    Create route
                  </button>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle icon={LayoutDashboard} title="Saved view presets" description="Reusable workspace views for different working modes." />
              <button
                type="button"
                onClick={saveViewPreset}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-2 text-xs font-black text-[#111827] transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Save className="h-4 w-4" />
                Save preset
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleViewPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => restoreViewPreset(preset)}
                  className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-[#111827]">{preset.title}</p>
                      <p className="mt-1 text-xs text-[#6B7280]">{preset.createdAt}</p>
                    </div>
                    <Pill tone={preset.profession === "all" ? "blue" : "indigo"}>{preset.view}</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#6B7280]">{preset.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Pill tone="green">{preset.board}</Pill>
                    {preset.filters.map((filter) => <Pill key={filter} tone="slate">{filter}</Pill>)}
                  </div>
                </button>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div>
              <SectionTitle icon={UploadCloud} title="Export and governance layer" description="Prepared placeholders for future backend export, audit and admin controls." />
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {EXPORT_PACKS.map(({ id, title, detail, icon: Icon, tone }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setNotice(`${title} export placeholder prepared`)}
                    className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block font-black text-[#111827]">{title}</span>
                        <span className="mt-1 block text-sm leading-5 text-[#6B7280]">{detail}</span>
                      </span>
                    </div>
                    <Pill tone={tone} className="mt-3">Prepared</Pill>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500">Governance checklist</p>
                  <h3 className="mt-2 text-xl font-black text-[#111827]">Workspace is backend-ready by shape</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6B7280]">These checks keep the demo scalable while real APIs are not connected yet.</p>
                </div>
                <Pill tone="green">{GOVERNANCE_CHECKS.length} checks</Pill>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {GOVERNANCE_CHECKS.map((check) => (
                  <div key={check.title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E5E7EB]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-black text-[#111827]">{check.title}</p>
                      <Pill tone={check.tone}>{check.status}</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6B7280]">{check.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <div className="space-y-5">
            <WorkspaceHierarchy zone={WORKSPACE_ZONE} activeBoard={activeBoard} onSelectBoard={setActiveBoard} />
            <SurfaceCard>
              <SectionTitle icon={Workflow} title="Quick boards" description="Profession-aware boards plus locally created boards." />
              <div className="flex flex-wrap gap-2">
                {quickBoards.map((board) => (
                  <button
                    key={board}
                    type="button"
                    onClick={() => setActiveBoard(board)}
                    className={cn("rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors", activeBoard === board ? "bg-indigo-600 text-white ring-indigo-600" : "bg-[#F7FAFC] text-[#6B7280] ring-[#E5E7EB] hover:bg-indigo-50 hover:text-indigo-700")}
                  >
                    {board}
                  </button>
                ))}
              </div>
            </SurfaceCard>
          </div>

          <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <ViewSwitcher views={POWER_VIEWS} value={activeView} onChange={setActiveView} />
              <div className="flex flex-wrap gap-2">
                <Pill tone="green">{WORKSPACE_ZONE.health}% health</Pill>
                <Pill tone="indigo">{activePreset.label}: {activeBoard}</Pill>
              </div>
            </div>

            <FilterBar query={query} onQueryChange={setQuery} chips={[...activePreset.filters.slice(0, 4), "Saved view"]} />

            {filteredTasks.length === 0 && (
              <SurfaceCard className="border-dashed text-center">
                <p className="font-black text-[#111827]">No matching workspace items</p>
                <p className="mt-2 text-sm text-[#6B7280]">Try another profession preset or clear search.</p>
              </SurfaceCard>
            )}

            {activeView === "board" && filteredTasks.length > 0 && (
              <SurfaceCard>
                <SectionTitle icon={LayoutDashboard} title={`${activePreset.label} board view`} description="Profession-filtered Smart Tasks grouped by workflow status." />
                <div className="grid gap-3 xl:grid-cols-4">
                  {(["todo", "in_progress", "review", "done"] as const).map((status) => (
                    <div key={status} className="rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-black capitalize text-[#111827]">{status.replace("_", " ")}</h3>
                        <Pill tone="slate">{filteredTasks.filter((task) => task.status === status).length}</Pill>
                      </div>
                      <div className="space-y-2">
                        {filteredTasks.filter((task) => task.status === status).map((task) => (
                          <div key={task.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                            <p className="text-sm font-black text-[#111827]">{task.title}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
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

            {(activeView === "list" || activeView === "table") && <DataTable columns={["Task", "Project", "Owner", "Priority", "Due"]} rows={taskRows} />}

            {activeView === "calendar" && (
              <SurfaceCard>
                <SectionTitle icon={Calendar} title="Calendar control" description="Deadline preview for filtered Smart Tasks, meetings and reminders." />
                <div className="grid gap-3 md:grid-cols-4">
                  {filteredTasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-500">{task.dueDate}</p>
                      <p className="mt-2 text-sm font-black text-[#111827]">{task.title}</p>
                      <p className="mt-1 text-xs text-[#6B7280]">{task.assignee}</p>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {activeView === "timeline" && (
              <SurfaceCard>
                <SectionTitle icon={Sparkles} title="Timeline control" description="Launch lane with progress, estimate and tracked focus time." />
                <div className="space-y-3">
                  {filteredTasks.map((task) => (
                    <div key={task.id} className="grid gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 md:grid-cols-[1fr_2fr_0.5fr] md:items-center">
                      <div>
                        <p className="font-black text-[#111827]">{task.title}</p>
                        <p className="text-xs text-[#6B7280]">{task.estimate} estimate - {task.timeTracked} tracked</p>
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
                <SectionTitle icon={LayoutDashboard} title="Insight Board" description="Saved dashboard widgets for power-user workspace monitoring." />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {DASHBOARD_WIDGETS.slice(0, 4).map((widget) => <WidgetCard key={widget.id} widget={widget} />)}
                </div>
              </SurfaceCard>
            )}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SurfaceCard>
            <SectionTitle icon={Save} title="Saved workspace states" description="Restore profession, view and board presets you saved locally." />
            <div className="space-y-2">
              {snapshots.length === 0 && <p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-[#6B7280] ring-1 ring-[#E5E7EB]">No saved workspace states yet. Use Save view to create one.</p>}
              {snapshots.map((snapshot) => (
                <button key={snapshot.id} type="button" onClick={() => restoreSnapshot(snapshot)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3 text-left transition-colors hover:bg-white hover:shadow-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#111827]">{snapshot.name}</span>
                    <span className="mt-1 block text-xs text-[#6B7280]">{snapshot.createdAt} - {snapshot.filters.join(", ")}</span>
                  </span>
                  <Pill tone="blue">Restore</Pill>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Plus} title="Created locally" description="Demo objects created from this workspace. Backend-ready shape, localStorage only." />
            <div className="grid gap-2 md:grid-cols-2">
              {createdItems.length === 0 && <p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-[#6B7280] ring-1 ring-[#E5E7EB] md:col-span-2">Create a board, doc, automation or dashboard to see it here.</p>}
              {createdItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={item.type === "Automation" ? "amber" : item.type === "Dashboard" ? "indigo" : "blue"}>{item.type}</Pill>
                    <span className="text-[11px] font-semibold text-[#6B7280]">{item.createdAt}</span>
                  </div>
                  <p className="mt-3 font-black text-[#111827]">{item.title}</p>
                  <p className="mt-1 text-xs text-[#6B7280]">{PROFESSION_PRESETS[item.profession].label} - {item.board}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <SurfaceCard>
            <SectionTitle icon={FileText} title="Knowledge Hub" description="Docs and wiki pages linked to tasks, spaces and boards." />
            <div className="grid gap-3 md:grid-cols-3">
              {DOC_PAGES.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <p className="font-black text-[#111827]">{doc.title}</p>
                  <p className="mt-2 line-clamp-3 text-sm text-[#6B7280]">{doc.excerpt}</p>
                  <div className="mt-3 flex items-center justify-between text-xs font-bold text-[#6B7280]"><span>{doc.space}</span><span>{doc.linkedTasks} tasks</span></div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Sparkles} title="Optima Canvas + Intake" description="Whiteboard nodes, intake fields and screen notes placeholders." />
            <div className="relative h-56 overflow-hidden rounded-[24px] bg-[#F7FAFC] ring-1 ring-[#E5E7EB]">
              {WHITEBOARD_NODES.map((node) => (
                <div key={node.id} className="absolute rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#111827] shadow-sm ring-1 ring-[#E5E7EB]" style={{ left: `${node.x}%`, top: `${node.y}%` }}>{node.title}</div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {FORM_FIELDS.map((field) => <Pill key={field.id} tone={field.required ? "indigo" : "slate"}>{field.label}</Pill>)}
              {CLIP_ITEMS.map((clip) => <Pill key={clip.id} tone="blue">{clip.title} - {clip.duration}</Pill>)}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle icon={Workflow} title="Integration ecosystem" description="Recommended tools change by profession. Toggle them to simulate connected workspace control." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {INTEGRATIONS.map(({ id, name, icon: Icon, desc }) => {
              const connected = integrationState[id];
              const recommended = activePreset.integrations.includes(id);
              return (
                <div key={id} className={cn("rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm", recommended ? "border-indigo-100 bg-indigo-50/45" : "border-[#E5E7EB] bg-[#F7FAFC]")}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm"><Icon className="h-5 w-5" /></span>
                    <div className="flex gap-1">
                      {recommended && <Pill tone="indigo">Recommended</Pill>}
                      <Pill tone={connected ? "green" : "slate"}>{connected ? "Connected" : "Ready UI"}</Pill>
                    </div>
                  </div>
                  <h3 className="mt-4 font-black text-[#111827]">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">{desc}</p>
                  <button
                    type="button"
                    onClick={() => setIntegrationState((current) => ({ ...current, [id]: !current[id] }))}
                    className={cn("mt-4 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-black transition-colors", connected ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-white text-[#6B7280] ring-1 ring-[#E5E7EB] hover:text-indigo-700")}
                  >
                    {connected ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {connected ? "Connected" : "Connect demo"}
                  </button>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </PageShell>
      <Toast message={notice} />
    </AppLayout>
  );
}
