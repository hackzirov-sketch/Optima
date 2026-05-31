import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Brain,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  DollarSign,
  Flag,
  Flame,
  Gauge,
  LayoutDashboard,
  Layers3,
  LineChart,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  UploadCloud,
  UserCog,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, Modal, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { PremiumAvatarRing, PremiumGradientBadge, PremiumStatusBadge, type PremiumStatusId } from "@/components/premium/PremiumAssets";
import { TEAM_MEMBERS, TEAM_SPACES } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";
import { storage } from "@/utils/storage";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

const TEAM_METRICS = [
  { labelKey: "members", label: "Active employees", value: "7", icon: Users, trend: "+2 this week", tone: "indigo" as const },
  { labelKey: "openTasks", label: "Active tasks", value: "38", icon: CheckCircle2, trend: "12 in review", tone: "blue" as const },
  { labelKey: "teamChats", label: "Productivity score", value: "91%", icon: Gauge, trend: "+8.4% weekly", tone: "green" as const },
  { labelKey: "thisWeek", label: "Weekly performance", value: "84%", icon: LineChart, trend: "stable sprint", tone: "amber" as const },
];

const TEAM_STATUS: Record<string, PremiumStatusId> = {
  Online: "available",
  Away: "busy",
  Offline: "offline",
};

const TEAM_FOCUS_ASSETS = {
  Frontend: "/emojis/laptop.svg",
  Design: "/emojis/gem.svg",
  Delivery: "/emojis/rocket.svg",
  Marketing: "/emojis/trophy.svg",
  Product: "/emojis/book.svg",
  Backend: "/status/coding.svg",
} as const;

const OPTIMA_EMPLOYEES = [
  { id: "tm1", name: "Alex Kim", department: "Engineering", role: "Frontend Lead", tasks: 8, hours: 37, streak: 12, focus: 91, productivity: 94, trend: [64, 72, 77, 82, 90, 94], burnout: "Low", insight: "Best for urgent UI bugs and review-heavy tasks." },
  { id: "tm2", name: "Sara Chen", department: "Design", role: "Product Designer", tasks: 6, hours: 34, streak: 9, focus: 88, productivity: 92, trend: [71, 74, 80, 86, 91, 92], burnout: "Low", insight: "Design QA speed is rising, keep her on handoff work." },
  { id: "tm3", name: "James Wright", department: "Delivery", role: "Project Manager", tasks: 7, hours: 41, streak: 6, focus: 76, productivity: 81, trend: [84, 82, 78, 80, 79, 81], burnout: "Medium", insight: "Client delivery load is high, shift admin tasks away." },
  { id: "tm4", name: "Luca Rossi", department: "Growth", role: "SMM Strategist", tasks: 5, hours: 29, streak: 5, focus: 73, productivity: 78, trend: [62, 67, 69, 72, 76, 78], burnout: "Low", insight: "Campaign analytics improved after clearer approvals." },
  { id: "tm5", name: "Mira Johnson", department: "Product", role: "Product Lead", tasks: 9, hours: 43, streak: 14, focus: 84, productivity: 89, trend: [79, 81, 86, 87, 86, 89], burnout: "Medium", insight: "Strong strategy output, but meeting load is climbing." },
  { id: "tm6", name: "Otabek Karimov", department: "Engineering", role: "Backend Engineer", tasks: 7, hours: 39, streak: 8, focus: 86, productivity: 87, trend: [68, 73, 79, 83, 84, 87], burnout: "Low", insight: "Backend automation work is consistent and predictable." },
];

type OptimaTaskStatus = "Backlog" | "To Do" | "In Progress" | "Review" | "Completed";
type OptimaTaskPriority = "Low" | "Medium" | "High";
type ReviewDecision = "Approved" | "Changes requested" | "Rejected";

type OptimaTask = {
  id: string;
  title: string;
  owner: string;
  status: OptimaTaskStatus;
  priority: OptimaTaskPriority;
  timer: string;
  completion: number;
  prediction: string;
  proof: boolean;
  deadline: string;
  label: string;
  reviewer: string;
  assignedAt: string;
  reviewNote?: string;
  reviewedAt?: string;
};

type TeamReviewLog = {
  id: string;
  taskId: string;
  title: string;
  reviewer: string;
  decision: ReviewDecision;
  note: string;
  at: string;
};

const OPTIMA_TASKS: OptimaTask[] = [
  { id: "task-1", title: "Landing UI polish", owner: "Sara Chen", status: "Completed", priority: "High", timer: "02:40", completion: 100, prediction: "Done early", proof: true, deadline: "Today 14:00", label: "Design", reviewer: "Mira Johnson", assignedAt: "Yesterday", reviewedAt: "Today", reviewNote: "Approved after responsive QA." },
  { id: "task-2", title: "Chat reaction compact menu", owner: "Alex Kim", status: "Review", priority: "High", timer: "01:18", completion: 82, prediction: "Safe", proof: true, deadline: "Today 18:00", label: "Frontend", reviewer: "Jasur Karimov", assignedAt: "Today", reviewNote: "Check mobile menu position." },
  { id: "task-3", title: "Workspace control dashboard", owner: "Mira Johnson", status: "In Progress", priority: "Medium", timer: "03:05", completion: 67, prediction: "At risk if scope grows", proof: false, deadline: "Tomorrow", label: "Product", reviewer: "Alex Kim", assignedAt: "Today" },
  { id: "task-4", title: "Telegram bot digest flow", owner: "Otabek Karimov", status: "To Do", priority: "Medium", timer: "00:00", completion: 18, prediction: "Needs start today", proof: false, deadline: "May 12", label: "Automation", reviewer: "James Wright", assignedAt: "Today" },
  { id: "task-5", title: "Weekly performance report", owner: "James Wright", status: "In Progress", priority: "High", timer: "00:56", completion: 48, prediction: "Overload warning", proof: false, deadline: "Today 17:00", label: "Reporting", reviewer: "Mira Johnson", assignedAt: "Today" },
  { id: "task-6", title: "Community campaign analytics", owner: "Luca Rossi", status: "Review", priority: "Low", timer: "01:22", completion: 74, prediction: "Safe", proof: true, deadline: "May 14", label: "Growth", reviewer: "Sara Chen", assignedAt: "Yesterday", reviewNote: "Needs final metrics scan." },
];

const DEPARTMENT_ANALYTICS = [
  { name: "Engineering", productivity: 91, completion: 84, response: 76, active: 88, color: "#6366F1" },
  { name: "Design", productivity: 92, completion: 86, response: 82, active: 78, color: "#3B82F6" },
  { name: "Delivery", productivity: 81, completion: 77, response: 72, active: 91, color: "#F59E0B" },
  { name: "Growth", productivity: 78, completion: 69, response: 80, active: 64, color: "#10B981" },
  { name: "Product", productivity: 89, completion: 82, response: 74, active: 86, color: "#8B5CF6" },
];

const WEEKLY_PERFORMANCE = [
  { day: "Mon", done: 18, review: 8, risk: 3 },
  { day: "Tue", done: 22, review: 7, risk: 2 },
  { day: "Wed", done: 19, review: 10, risk: 4 },
  { day: "Thu", done: 27, review: 9, risk: 2 },
  { day: "Fri", done: 24, review: 11, risk: 3 },
];

const LIVE_ACTIVITY = [
  { id: "a1", time: "Now", title: "Sara completed Landing UI", detail: "Proof uploaded and moved to Completed", tone: "green" as const },
  { id: "a2", time: "4m", title: "AI flagged workload risk", detail: "James has 3 high-priority tasks today", tone: "amber" as const },
  { id: "a3", time: "12m", title: "Alex paused timer", detail: "Chat reaction compact menu entered review", tone: "blue" as const },
  { id: "a4", time: "21m", title: "Telegram digest prepared", detail: "Daily report ready for team channel", tone: "indigo" as const },
];

const TELEGRAM_BOT_EVENTS = [
  { id: "bot-1", title: "Bekzod completed task", body: "Landing UI moved to Completed", action: "Approve", tone: "green" as const },
  { id: "bot-2", title: "3 deadline risks", body: "Review tasks need owner response today", action: "Redistribute", tone: "amber" as const },
  { id: "bot-3", title: "Daily report ready", body: "84% weekly performance, 6 blockers cleared", action: "Send digest", tone: "blue" as const },
];

const AI_TEAM_INSIGHTS = [
  "James is close to overload. Move one reporting task to Mira or Alex.",
  "Sara's design review trend improved 18%, keep her on final QA.",
  "Engineering response speed is slower than Design by 6%.",
  "Optimal workflow: complete proof uploads before bot digest at 17:00.",
];

const ROLE_ARCHITECTURE = [
  { role: "Owner", access: "Billing, security, all teams", canApprove: true, canRedistribute: true, canViewAnalytics: true },
  { role: "Admin", access: "Members, integrations, automations", canApprove: true, canRedistribute: true, canViewAnalytics: true },
  { role: "Manager", access: "Department tasks and reports", canApprove: true, canRedistribute: true, canViewAnalytics: true },
  { role: "Team Lead", access: "Sprint tasks and employee focus", canApprove: true, canRedistribute: false, canViewAnalytics: true },
  { role: "Employee", access: "Own tasks, timers, proofs", canApprove: false, canRedistribute: false, canViewAnalytics: false },
  { role: "Guest", access: "Shared project preview only", canApprove: false, canRedistribute: false, canViewAnalytics: false },
];

const HEATMAP_CELLS = Array.from({ length: 35 }, (_, index) => Math.min(96, [28, 45, 63, 82, 91, 54, 72][index % 7] + (index % 5) * 2));

type OptimaPanel = "Dashboard" | "Tasks" | "Team" | "Analytics" | "Finance" | "AI" | "Chat" | "Calendar";

const OPTIMA_NAV: { id: OptimaPanel; icon: typeof LayoutDashboard; meta: string }[] = [
  { id: "Dashboard", icon: LayoutDashboard, meta: "Overview" },
  { id: "Tasks", icon: ListChecks, meta: "Kanban" },
  { id: "Team", icon: Users, meta: "People" },
  { id: "Analytics", icon: BarChart3, meta: "Live" },
  { id: "Finance", icon: DollarSign, meta: "Payroll" },
  { id: "AI", icon: Brain, meta: "Copilot" },
  { id: "Chat", icon: MessageSquareText, meta: "Realtime" },
  { id: "Calendar", icon: CalendarDays, meta: "Schedule" },
];

const DEADLINE_REMINDERS = [
  { id: "dl-1", title: "Weekly performance report", owner: "James", due: "Today 17:00", risk: "High" },
  { id: "dl-2", title: "Telegram bot digest flow", owner: "Otabek", due: "Tomorrow", risk: "Medium" },
  { id: "dl-3", title: "Workspace control dashboard", owner: "Mira", due: "May 12", risk: "Low" },
];

const FINANCE_PULSE = [
  { label: "Team payroll", value: "$12.4K", trend: "mock budget" },
  { label: "Bonus pool", value: "$1.8K", trend: "performance based" },
  { label: "Client revenue", value: "$28.7K", trend: "+14% forecast" },
];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("");
}

function toneForScore(score: number) {
  if (score >= 88) return "green" as const;
  if (score >= 75) return "blue" as const;
  return "amber" as const;
}

function statusTone(status: string) {
  if (status === "Completed") return "green" as const;
  if (status === "Review") return "blue" as const;
  if (status === "In Progress") return "indigo" as const;
  return "slate" as const;
}

export default function TeamsPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(OPTIMA_EMPLOYEES[0].id);
  const [activeDepartment, setActiveDepartment] = useState("All");
  const [runningTaskId, setRunningTaskId] = useState<string | null>("task-3");
  const [teamTasks, setTeamTasks] = useState<OptimaTask[]>(() => {
    const saved = storage.getTeamOptimaTasks<OptimaTask>();
    return saved.length > 0 ? saved : OPTIMA_TASKS;
  });
  const [reviewLog, setReviewLog] = useState<TeamReviewLog[]>(() => storage.getTeamReviewLog<TeamReviewLog>());
  const [proofTaskIds, setProofTaskIds] = useState<string[]>(() => {
    const saved = storage.getTeamOptimaTasks<OptimaTask>();
    const source = saved.length > 0 ? saved : OPTIMA_TASKS;
    return source.filter((task) => task.proof).map((task) => task.id);
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [activeOptimaPanel, setActiveOptimaPanel] = useState<OptimaPanel>("Dashboard");
  const [commandQuery, setCommandQuery] = useState("");
  const [assignmentDraft, setAssignmentDraft] = useState({
    title: "",
    owner: OPTIMA_EMPLOYEES[0].name,
    priority: "Medium" as OptimaTaskPriority,
    deadline: "Today 18:00",
    label: "Sprint",
    reviewer: user.name,
  });

  const selectedEmployee = OPTIMA_EMPLOYEES.find((employee) => employee.id === selectedEmployeeId) ?? OPTIMA_EMPLOYEES[0];
  const departmentFilter = ["All", ...DEPARTMENT_ANALYTICS.map((department) => department.name)];
  const visibleEmployees = activeDepartment === "All" ? OPTIMA_EMPLOYEES : OPTIMA_EMPLOYEES.filter((employee) => employee.department === activeDepartment);
  const activeEmployees = OPTIMA_EMPLOYEES.filter((employee) => (TEAM_MEMBERS.find((member) => member.name === employee.name)?.status ?? "Offline") !== "Offline").length;
  const activeTasks = teamTasks.filter((task) => task.status !== "Completed").length;
  const reviewQueue = teamTasks.filter((task) => task.status === "Review");
  const assignedToday = teamTasks.filter((task) => task.assignedAt === "Just now" || task.assignedAt === "Today").length;
  const rightRailDeadlines = teamTasks.length > 0
    ? teamTasks.filter((task) => task.status !== "Completed").slice(0, 3).map((task) => ({
      id: task.id,
      title: task.title,
      owner: task.owner.split(" ")[0],
      due: task.deadline,
      risk: task.priority === "High" ? "High" : task.priority === "Medium" ? "Medium" : "Low",
    }))
    : DEADLINE_REMINDERS;
  const productivityScore = Math.round(OPTIMA_EMPLOYEES.reduce((sum, employee) => sum + employee.productivity, 0) / OPTIMA_EMPLOYEES.length);
  const weeklyScore = Math.round(WEEKLY_PERFORMANCE.reduce((sum, day) => sum + day.done, 0) / WEEKLY_PERFORMANCE.length);

  useEffect(() => storage.saveTeamOptimaTasks(teamTasks), [teamTasks]);
  useEffect(() => storage.saveTeamReviewLog(reviewLog), [reviewLog]);

  const handleBotAction = (action: string) => {
    setNotice(`Telegram bot: ${action} action prepared`);
  };

  const handleAssignTask = () => {
    const title = assignmentDraft.title.trim() || `${assignmentDraft.owner.split(" ")[0]} priority task`;
    const task: OptimaTask = {
      id: `task-${Date.now()}`,
      title,
      owner: assignmentDraft.owner,
      status: "To Do",
      priority: assignmentDraft.priority,
      timer: "00:00",
      completion: 0,
      prediction: assignmentDraft.priority === "High" ? "AI: start today to avoid deadline risk" : "AI: safe if started this sprint",
      proof: false,
      deadline: assignmentDraft.deadline,
      label: assignmentDraft.label,
      reviewer: assignmentDraft.reviewer,
      assignedAt: "Just now",
      reviewNote: "Waiting for first proof or update.",
    };

    setTeamTasks((current) => [task, ...current]);
    setAssignmentDraft((current) => ({ ...current, title: "" }));
    setActiveOptimaPanel("Tasks");
    setNotice(`Task assigned to ${assignmentDraft.owner}`);
  };

  const handleProofUpload = (taskId: string) => {
    setProofTaskIds((current) => Array.from(new Set([...current, taskId])));
    setTeamTasks((current) => current.map((task) => task.id === taskId ? { ...task, proof: true, status: task.status === "Completed" ? "Completed" : "Review", completion: Math.max(task.completion, 82), reviewNote: "Proof uploaded. Ready for review." } : task));
    setNotice("Proof upload attached locally");
  };

  const toggleTimer = (taskId: string) => {
    setRunningTaskId((current) => current === taskId ? null : taskId);
    setNotice(runningTaskId === taskId ? "Timer paused" : "Timer started");
  };

  const moveTaskToReview = (taskId: string) => {
    setTeamTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: "Review", completion: Math.max(task.completion, 75), reviewNote: "Submitted for manager review." } : task));
    setNotice("Task moved to review");
  };

  const handleReviewDecision = (taskId: string, decision: ReviewDecision) => {
    const targetTask = teamTasks.find((task) => task.id === taskId);
    if (!targetTask) return;

    const nextStatus: OptimaTaskStatus = decision === "Approved" ? "Completed" : decision === "Rejected" ? "To Do" : "In Progress";
    const nextCompletion = decision === "Approved" ? 100 : decision === "Rejected" ? 28 : 68;
    const note = decision === "Approved" ? "Approved. Task is completed." : decision === "Rejected" ? "Rejected. Rework from todo." : "Changes requested. Back to progress.";

    setTeamTasks((current) => current.map((task) => task.id === taskId ? {
      ...task,
      status: nextStatus,
      completion: nextCompletion,
      reviewedAt: "Just now",
      reviewNote: note,
    } : task));

    setReviewLog((current) => [{
      id: `review-${Date.now()}`,
      taskId,
      title: targetTask.title,
      reviewer: targetTask.reviewer,
      decision,
      note,
      at: "Just now",
    }, ...current].slice(0, 8));

    setNotice(`Review saved: ${decision}`);
  };

  return (
    <AppLayout user={user} title={t("app.nav.teams")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={t("app.teams.eyebrow")}
          title={t("app.teams.title")}
          description={t("app.teams.description")}
        >
          <ActionButton onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> {t("app.teams.createTeam")}</ActionButton>
          <ActionButton variant="secondary"><MessageCircle className="h-4 w-4" /> {t("app.teams.openTeamChat")}</ActionButton>
        </PageHeader>

        <section className="overflow-hidden rounded-[30px] border border-slate-800/90 bg-[#070A12] text-slate-100 shadow-[0_28px_80px_rgba(2,6,23,0.42)]">
          <div className="grid min-h-[720px] xl:grid-cols-[190px_minmax(0,1fr)] 2xl:grid-cols-[200px_minmax(0,1fr)_300px]">
            <aside className="border-b border-white/10 bg-[#080B12] p-3 xl:border-b-0 xl:border-r 2xl:p-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20">
                  <Layers3 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">OPTIMA HQ</p>
                  <p className="text-[11px] font-semibold text-slate-500">Linear UI / Jira logic</p>
                </div>
              </div>

              <div className="mt-5 space-y-1">
                {OPTIMA_NAV.map(({ id, icon: Icon, meta }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveOptimaPanel(id)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200",
                      activeOptimaPanel === id ? "bg-blue-500/12 text-white ring-1 ring-blue-400/20" : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-100",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", activeOptimaPanel === id ? "text-blue-300" : "text-slate-500")} />
                      <span className="truncate font-semibold">{id}</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{meta}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Departments</p>
                  <Radio className="h-3.5 w-3.5 text-blue-300" />
                </div>
                <div className="space-y-2">
                  {DEPARTMENT_ANALYTICS.map((department) => (
                    <button
                      key={department.name}
                      type="button"
                      onClick={() => setActiveDepartment(department.name)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors",
                        activeDepartment === department.name ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: department.color }} />
                        {department.name}
                      </span>
                      <span className="font-black">{department.productivity}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="min-w-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.13),transparent_34%),linear-gradient(180deg,#0B1020_0%,#070A12_100%)] p-3 sm:p-4 2xl:p-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <button
                  type="button"
                  onClick={() => setNotice("Workspace switcher placeholder opened")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-100 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.07]"
                >
                  Optima Launch Squad
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                <div className="flex flex-1 flex-col gap-2 lg:flex-row lg:justify-end">
                  <label className="relative min-w-0 lg:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={commandQuery}
                      onChange={(event) => setCommandQuery(event.target.value)}
                      placeholder="Search tasks, people, sprint..."
                      className="h-10 w-full rounded-2xl border border-white/10 bg-white/[0.035] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-400/40"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setNotice(commandQuery ? `AI command prepared: ${commandQuery}` : "AI command bar focused")}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 text-sm font-black text-white shadow-[0_12px_32px_rgba(59,130,246,0.24)] transition-all hover:-translate-y-0.5 hover:bg-blue-400"
                  >
                    <Sparkles className="h-4 w-4" />
                    AI command
                  </button>
                  <button type="button" className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.07]" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {[
                  { label: "Active employees", value: activeEmployees, icon: Users, meta: "live team" },
                  { label: "Open issues", value: activeTasks, icon: ListChecks, meta: "sprint scope" },
                  { label: "Velocity", value: `${weeklyScore}/day`, icon: LineChart, meta: "weekly avg" },
                  { label: "Focus score", value: `${productivityScore}%`, icon: Gauge, meta: "team health" },
                ].map(({ label, value, icon: Icon, meta }) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400/30 hover:bg-white/[0.055] 2xl:p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
                      <Icon className="h-4 w-4 text-blue-300" />
                    </div>
                    <p className="mt-2 text-xl font-black text-white 2xl:text-2xl">{value}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{meta}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 2xl:grid-cols-[0.92fr_1.08fr]">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Assign task</p>
                      <p className="mt-1 text-xs text-slate-500">{assignedToday} assigned today</p>
                    </div>
                    <ClipboardCheck className="h-4 w-4 text-blue-300" />
                  </div>
                  <div className="mt-3 grid gap-2">
                    <input
                      value={assignmentDraft.title}
                      onChange={(event) => setAssignmentDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Task title: Design payment modal..."
                      className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-400/40"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={assignmentDraft.owner}
                        onChange={(event) => setAssignmentDraft((current) => ({ ...current, owner: event.target.value }))}
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1020] px-3 text-sm text-slate-100 outline-none focus:border-blue-400/40"
                        aria-label="Assign task owner"
                      >
                        {OPTIMA_EMPLOYEES.map((employee) => <option key={employee.id}>{employee.name}</option>)}
                      </select>
                      <select
                        value={assignmentDraft.priority}
                        onChange={(event) => setAssignmentDraft((current) => ({ ...current, priority: event.target.value as OptimaTaskPriority }))}
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1020] px-3 text-sm text-slate-100 outline-none focus:border-blue-400/40"
                        aria-label="Task priority"
                      >
                        {(["Low", "Medium", "High"] as OptimaTaskPriority[]).map((priority) => <option key={priority}>{priority}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={assignmentDraft.deadline}
                        onChange={(event) => setAssignmentDraft((current) => ({ ...current, deadline: event.target.value }))}
                        className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-400/40"
                        placeholder="Deadline"
                      />
                      <input
                        value={assignmentDraft.label}
                        onChange={(event) => setAssignmentDraft((current) => ({ ...current, label: event.target.value }))}
                        className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-400/40"
                        placeholder="Label"
                      />
                      <button
                        type="button"
                        onClick={handleAssignTask}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-500 px-3 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:bg-blue-400"
                      >
                        <Plus className="h-4 w-4" />
                        Assign
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Review queue</p>
                      <p className="mt-1 text-xs text-slate-500">{reviewQueue.length} tasks waiting for decision</p>
                    </div>
                    <Flag className="h-4 w-4 text-amber-300" />
                  </div>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {reviewQueue.slice(0, 4).map((task) => (
                      <div key={task.id} className="rounded-2xl border border-white/10 bg-black/15 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-black text-slate-100">{task.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{task.owner} {"->"} {task.reviewer}</p>
                          </div>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", task.priority === "High" ? "bg-rose-500/15 text-rose-200" : task.priority === "Medium" ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200")}>{task.priority}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{task.reviewNote ?? "Ready for review."}</p>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleReviewDecision(task.id, "Approved")}
                            className="grid h-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-200 transition-colors hover:bg-emerald-500/25"
                            aria-label="Approve task"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewDecision(task.id, "Changes requested")}
                            className="grid h-8 place-items-center rounded-lg bg-amber-500/15 text-amber-200 transition-colors hover:bg-amber-500/25"
                            aria-label="Request changes"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewDecision(task.id, "Rejected")}
                            className="grid h-8 place-items-center rounded-lg bg-rose-500/15 text-rose-200 transition-colors hover:bg-rose-500/25"
                            aria-label="Reject task"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {reviewQueue.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-slate-500 lg:col-span-2">Review queue is clear. Move a task to review or upload proof.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 rounded-[24px] border border-white/10 bg-[#0B1020]/86 p-3 2xl:p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Sprint OPT-12</p>
                      <h3 className="mt-1 text-base font-black text-white 2xl:text-lg">Advanced task workflow</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                      <span className="rounded-full border border-white/10 px-2 py-1 text-slate-400">Backlog</span>
                      <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-blue-200">Kanban</span>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-slate-400">Priority</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(59,130,246,0.4)_transparent]">
                    <div className="grid min-w-[980px] grid-cols-5 gap-3">
                      {["Backlog", "To Do", "In Progress", "Review", "Completed"].map((status) => {
                        const tasks = teamTasks.filter((task) => task.status === status || (status === "Backlog" && task.status === "To Do"));
                        return (
                          <div key={status} className="rounded-2xl border border-white/10 bg-black/10 p-2.5">
                            <div className="mb-3 flex items-center justify-between px-1">
                              <p className="text-xs font-black text-slate-300">{status}</p>
                              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-black text-slate-500">{tasks.length}</span>
                            </div>
                            <div className="space-y-2">
                              {tasks.map((task) => {
                                const running = runningTaskId === task.id;
                                return (
                                  <div key={`${status}-${task.id}`} className="group min-h-[116px] rounded-xl border border-white/10 bg-white/[0.035] p-3 transition-all hover:-translate-y-0.5 hover:border-blue-400/30 hover:bg-white/[0.06]">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="line-clamp-2 text-[13px] font-bold leading-5 text-slate-100">{task.title}</p>
                                      <button
                                        type="button"
                                        onClick={() => toggleTimer(task.id)}
                                        className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white transition-transform active:scale-95", running ? "bg-amber-500" : "bg-blue-500/80")}
                                        aria-label={running ? "Pause timer" : "Start timer"}
                                      >
                                        {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                      </button>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                      <span className="max-w-full truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-slate-400">{task.owner}</span>
                                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-200">{task.label}</span>
                                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", task.priority === "High" ? "bg-rose-500/15 text-rose-200" : task.priority === "Medium" ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200")}>{task.priority}</span>
                                    </div>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${task.completion}%` }} />
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                      <span className="truncate text-[10px] font-bold text-slate-500">{task.deadline}</span>
                                      {task.status !== "Review" && task.status !== "Completed" ? (
                                        <button
                                          type="button"
                                          onClick={() => moveTaskToReview(task.id)}
                                          className="rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] font-black text-slate-300 transition-colors hover:bg-blue-500/15 hover:text-blue-200"
                                        >
                                          Send review
                                        </button>
                                      ) : (
                                        <span className="rounded-lg bg-white/[0.04] px-2 py-1 text-[10px] font-black text-slate-500">{task.proof ? "Proof" : "No proof"}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-1">
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Velocity graph</p>
                      <LineChart className="h-4 w-4 text-blue-300" />
                    </div>
                    <div className="mt-3 flex h-24 items-end gap-2">
                      {WEEKLY_PERFORMANCE.map((day) => (
                        <div key={day.day} className="flex flex-1 flex-col items-center gap-2">
                          <span className="w-full rounded-t-lg bg-gradient-to-t from-blue-500 to-cyan-300" style={{ height: `${Math.max(26, day.done * 2.3)}px` }} />
                          <span className="text-[10px] font-bold text-slate-500">{day.day}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Focus heatmap</p>
                      <Activity className="h-4 w-4 text-emerald-300" />
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {HEATMAP_CELLS.map((value, index) => (
                        <span key={`${value}-${index}`} className="h-5 rounded-md ring-1 ring-white/5" style={{ background: `rgba(59,130,246,${0.12 + value / 128})` }} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Live timeline</p>
                    <div className="mt-3 space-y-2.5">
                      {LIVE_ACTIVITY.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex gap-3">
                          <span className="mt-1 h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_0_5px_rgba(59,130,246,0.12)]" />
                          <div>
                            <p className="text-sm font-bold text-slate-100">{item.title}</p>
                            <p className="text-xs text-slate-500">{item.time} - {item.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[0.78fr_1.22fr]">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3 2xl:p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Team focus score</p>
                    <Zap className="h-4 w-4 text-blue-300" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {OPTIMA_EMPLOYEES.slice(0, 5).map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        onClick={() => setSelectedEmployeeId(employee.id)}
                        className="grid w-full grid-cols-[88px_1fr_42px] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <span className="truncate text-xs font-bold text-slate-300">{employee.name}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full bg-blue-400" style={{ width: `${employee.focus}%` }} />
                        </span>
                        <span className="text-right text-xs font-black text-slate-400">{employee.focus}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3 2xl:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Employee workspace</p>
                      <h3 className="mt-1 text-lg font-black text-white">{selectedEmployee.name}</h3>
                      <p className="text-sm text-slate-500">{selectedEmployee.role} - {selectedEmployee.department}</p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", selectedEmployee.burnout === "Medium" ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200")}>{selectedEmployee.burnout} burnout risk</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    {[
                      { label: "Tasks", value: selectedEmployee.tasks, icon: Briefcase },
                      { label: "Hours", value: selectedEmployee.hours, icon: Clock3 },
                      { label: "Streak", value: selectedEmployee.streak, icon: Flame },
                      { label: "Focus", value: selectedEmployee.focus, icon: Zap },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <Icon className="h-4 w-4 text-blue-300" />
                        <p className="mt-2 text-xl font-black text-white">{value}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-sm leading-6 text-blue-100">
                    <Brain className="mr-2 inline h-4 w-4" />
                    {selectedEmployee.insight}
                  </div>
                </div>
              </div>
            </main>

            <aside className="border-t border-white/10 bg-[#080B12] p-3 xl:col-start-2 2xl:col-start-auto 2xl:border-l 2xl:border-t-0 2xl:p-4">
              <div className="rounded-[24px] border border-blue-400/20 bg-blue-500/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Productivity score</p>
                  <Gauge className="h-4 w-4 text-blue-200" />
                </div>
                <p className="mt-4 text-5xl font-black tracking-tight text-white">{productivityScore}</p>
                <p className="mt-1 text-sm text-blue-100/75">Healthy, with 2 overload warnings.</p>
              </div>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">AI insights</p>
                  <Bot className="h-4 w-4 text-blue-300" />
                </div>
                <div className="space-y-3">
                  {AI_TEAM_INSIGHTS.slice(0, 3).map((insight, index) => (
                    <div key={insight} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <div className="flex items-start gap-2.5">
                        <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", index === 0 ? "bg-amber-500/15 text-amber-200" : "bg-blue-500/15 text-blue-200")}>
                          {index === 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />}
                        </span>
                        <p className="text-sm leading-6 text-slate-300">{insight}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Deadlines</p>
                  <CalendarDays className="h-4 w-4 text-blue-300" />
                </div>
                <div className="space-y-2.5">
                  {rightRailDeadlines.map((deadline) => (
                    <div key={deadline.id} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-100">{deadline.title}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", deadline.risk === "High" ? "bg-rose-500/15 text-rose-200" : deadline.risk === "Medium" ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200")}>{deadline.risk}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{deadline.owner} - {deadline.due}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Review history</p>
                  <ClipboardCheck className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="space-y-2.5">
                  {reviewLog.slice(0, 3).map((log) => (
                    <div key={log.id} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-bold text-slate-100">{log.title}</p>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", log.decision === "Approved" ? "bg-emerald-500/15 text-emerald-200" : log.decision === "Changes requested" ? "bg-amber-500/15 text-amber-200" : "bg-rose-500/15 text-rose-200")}>{log.decision}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{log.reviewer} - {log.at}</p>
                    </div>
                  ))}
                  {reviewLog.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-3 text-xs leading-5 text-slate-500">No review decisions yet. Approve or request changes from the queue.</p>}
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Telegram bot</p>
                  <Send className="h-4 w-4 text-blue-300" />
                </div>
                <div className="space-y-2.5">
                  {TELEGRAM_BOT_EVENTS.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => handleBotAction(event.action)}
                      className="w-full rounded-2xl border border-white/10 bg-black/10 p-3 text-left transition-colors hover:border-blue-400/30 hover:bg-blue-500/10"
                    >
                      <p className="text-sm font-bold text-slate-100">{event.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{event.body}</p>
                      <span className="mt-2 inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-black text-blue-200">{event.action}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Finance pulse</p>
                  <DollarSign className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="grid gap-2">
                  {FINANCE_PULSE.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl bg-black/10 px-3 py-2">
                      <span>
                        <span className="block text-xs font-bold text-slate-300">{item.label}</span>
                        <span className="text-[11px] text-slate-600">{item.trend}</span>
                      </span>
                      <span className="text-sm font-black text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        {TEAM_MEMBERS.length < 0 && (<>
        <SurfaceCard className="overflow-hidden p-0">
          <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden p-5 sm:p-6">
              <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-indigo-100/80 blur-3xl" />
              <div className="relative">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">OPTIMA Team Command</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-[#111827]">Live productivity operating system</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">Employees, tasks, timers, AI risk signals, Telegram bot actions and role architecture in one calm Optima control layer.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone="green">{activeEmployees} active employees</Pill>
                    <Pill tone="indigo">{productivityScore}% productivity</Pill>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Active employees", value: String(activeEmployees), icon: Users, tone: "indigo" as const, meta: "Online + away" },
                    { label: "Active tasks", value: String(activeTasks), icon: CheckCircle2, tone: "blue" as const, meta: "excluding completed" },
                    { label: "Productivity score", value: `${productivityScore}%`, icon: Gauge, tone: "green" as const, meta: "team average" },
                    { label: "Weekly performance", value: `${weeklyScore}`, icon: LineChart, tone: "amber" as const, meta: "done/day average" },
                  ].map(({ label, value, icon: Icon, tone, meta }) => (
                    <div key={label} className="rounded-[22px] border border-[#E5E7EB] bg-white/90 p-4 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
                        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#F7FAFC] text-indigo-600">
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-3 text-2xl font-black text-[#111827]">{value}</p>
                      <Pill tone={tone} className="mt-3">{meta}</Pill>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-[#E5E7EB] bg-[#F7FAFC] p-5 xl:border-l xl:border-t-0">
              <SectionTitle icon={Radio} title="Live activity" description="Real-time activity stream mock for team operations." />
              <div className="space-y-3">
                {LIVE_ACTIVITY.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.12)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-[#111827]">{item.title}</p>
                          <Pill tone={item.tone}>{item.time}</Pill>
                        </div>
                        <p className="mt-1 text-sm text-[#6B7280]">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SurfaceCard>
            <SectionTitle icon={BarChart3} title="Live team analytics" description="Radar, heatmap, stacked bars and department comparison in one clean dashboard." />
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6B7280]">Radar</p>
                  <Pill tone="indigo">Departments</Pill>
                </div>
                <svg viewBox="0 0 120 120" className="mt-3 h-56 w-full">
                  <polygon points="60,12 105,45 88,102 32,102 15,45" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1" />
                  <polygon points="60,28 90,50 80,88 40,88 30,50" fill="white" stroke="#E5E7EB" strokeWidth="1" />
                  <polygon
                    points={DEPARTMENT_ANALYTICS.map((department, index) => {
                      const angle = (index * 2 * Math.PI) / DEPARTMENT_ANALYTICS.length - Math.PI / 2;
                      const radius = department.productivity * 0.45;
                      return `${60 + Math.cos(angle) * radius},${60 + Math.sin(angle) * radius}`;
                    }).join(" ")}
                    fill="rgba(99,102,241,0.22)"
                    stroke="#6366F1"
                    strokeWidth="2"
                  />
                  {DEPARTMENT_ANALYTICS.map((department, index) => {
                    const angle = (index * 2 * Math.PI) / DEPARTMENT_ANALYTICS.length - Math.PI / 2;
                    const radius = department.productivity * 0.45;
                    return <circle key={department.name} cx={60 + Math.cos(angle) * radius} cy={60 + Math.sin(angle) * radius} r="2.7" fill={department.color} />;
                  })}
                </svg>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6B7280]">Weekly stacked bars</p>
                    <Pill tone="green">Completion rate</Pill>
                  </div>
                  <div className="mt-4 space-y-3">
                    {WEEKLY_PERFORMANCE.map((day) => {
                      const total = day.done + day.review + day.risk;
                      return (
                        <div key={day.day} className="grid grid-cols-[42px_1fr] items-center gap-3">
                          <span className="text-xs font-black text-[#6B7280]">{day.day}</span>
                          <div className="flex h-8 overflow-hidden rounded-2xl bg-white ring-1 ring-[#E5E7EB]">
                            <div className="bg-emerald-500" style={{ width: `${(day.done / total) * 100}%` }} />
                            <div className="bg-blue-500" style={{ width: `${(day.review / total) * 100}%` }} />
                            <div className="bg-amber-400" style={{ width: `${(day.risk / total) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6B7280]">Active time heatmap</p>
                    <Pill tone="blue">5 weeks</Pill>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {HEATMAP_CELLS.map((value, index) => (
                      <span
                        key={`${value}-${index}`}
                        className="h-7 rounded-lg ring-1 ring-white"
                        style={{ background: `rgba(99,102,241,${0.12 + value / 130})` }}
                        aria-label={`Active time ${value}%`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionTitle icon={UserCog} title="Employee workspace" description="Per-employee productivity, focus, trend, AI insights and burnout warnings." />
              <div className="flex flex-wrap gap-2">
                {departmentFilter.map((department) => (
                  <button
                    key={department}
                    type="button"
                    onClick={() => setActiveDepartment(department)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-black ring-1 transition-colors",
                      activeDepartment === department ? "bg-indigo-600 text-white ring-indigo-600" : "bg-[#F7FAFC] text-[#6B7280] ring-[#E5E7EB] hover:bg-indigo-50 hover:text-indigo-700",
                    )}
                  >
                    {department}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-2">
                {visibleEmployees.map((employee) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(employee.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
                      selectedEmployeeId === employee.id ? "border-indigo-200 bg-indigo-50" : "border-[#E5E7EB] bg-[#F7FAFC] hover:bg-white",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-xs font-black text-white">
                        {initials(employee.name)}
                      </span>
                      <span>
                        <span className="block font-black text-[#111827]">{employee.name}</span>
                        <span className="text-xs text-[#6B7280]">{employee.role}</span>
                      </span>
                    </div>
                    <Pill tone={toneForScore(employee.productivity)}>{employee.productivity}%</Pill>
                  </button>
                ))}
              </div>

              <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">{selectedEmployee.department}</p>
                    <h3 className="mt-1 text-xl font-black text-[#111827]">{selectedEmployee.name}</h3>
                    <p className="text-sm text-[#6B7280]">{selectedEmployee.role}</p>
                  </div>
                  <Pill tone={selectedEmployee.burnout === "Medium" ? "amber" : "green"}>{selectedEmployee.burnout} burnout risk</Pill>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {[
                    { label: "Tasks", value: selectedEmployee.tasks, icon: Briefcase },
                    { label: "Hours", value: selectedEmployee.hours, icon: Clock3 },
                    { label: "Streak", value: selectedEmployee.streak, icon: Flame },
                    { label: "Focus", value: selectedEmployee.focus, icon: Zap },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]">
                      <Icon className="h-4 w-4 text-indigo-600" />
                      <p className="mt-2 text-xl font-black text-[#111827]">{value}</p>
                      <p className="text-xs text-[#6B7280]">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#E5E7EB]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-[#111827]">Work trend</p>
                    <Pill tone="blue">AI insight</Pill>
                  </div>
                  <div className="mt-4 flex h-20 items-end gap-2">
                    {selectedEmployee.trend.map((value, index) => (
                      <span key={`${value}-${index}`} className="flex-1 rounded-t-xl bg-gradient-to-t from-indigo-500 to-blue-400" style={{ height: `${value}%` }} />
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm leading-6 text-indigo-700">
                    <Brain className="mr-2 inline h-4 w-4" />
                    {selectedEmployee.insight}
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <SectionTitle icon={Timer} title="Smart task system" description="Task stages, timer control, proof upload, completion analytics and AI priority signals." />
            <div className="flex flex-wrap gap-2">
              {["To Do", "In Progress", "Review", "Completed"].map((status) => (
                <Pill key={status} tone={statusTone(status)}>{status}</Pill>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {teamTasks.map((task) => {
              const running = runningTaskId === task.id;
              const proofReady = proofTaskIds.includes(task.id);
              return (
                <div key={task.id} className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Pill tone={statusTone(task.status)}>{task.status}</Pill>
                      <h3 className="mt-3 font-black text-[#111827]">{task.title}</h3>
                      <p className="mt-1 text-sm text-[#6B7280]">{task.owner} - {task.priority} priority</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleTimer(task.id)}
                      className={cn("grid h-10 w-10 place-items-center rounded-2xl text-white shadow-sm transition-transform active:scale-95", running ? "bg-amber-500" : "bg-indigo-600")}
                      aria-label={running ? "Pause timer" : "Start timer"}
                    >
                      {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]">
                    <div className="mb-2 flex items-center justify-between text-xs font-black text-[#6B7280]">
                      <span>{running ? "Timer running" : "Timer"}</span>
                      <span>{task.timer}</span>
                    </div>
                    <ProgressBar value={task.completion} />
                  </div>
                  <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">AI prediction</p>
                    <p className="mt-1 text-sm font-semibold text-[#111827]">{task.prediction}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleProofUpload(task.id)}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#111827] ring-1 ring-[#E5E7EB] transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {proofReady ? "Proof attached" : "Upload proof"}
                  </button>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SurfaceCard>
            <SectionTitle icon={Bot} title="Telegram team bot" description="Signature bot layer for reminders, alerts, approvals, reports and inline actions." />
            <div className="space-y-3">
              {TELEGRAM_BOT_EVENTS.map((event) => (
                <div key={event.id} className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <Send className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-[#111827]">{event.title}</p>
                        <Pill tone={event.tone}>Bot alert</Pill>
                      </div>
                      <p className="mt-1 text-sm text-[#6B7280]">{event.body}</p>
                      <button
                        type="button"
                        onClick={() => handleBotAction(event.action)}
                        className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#111827] ring-1 ring-[#E5E7EB] transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {event.action}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Sparkles} title="AI team assistant" description="Overload detection, redistribution, workflow suggestions and performance decline warnings." />
            <div className="grid gap-3 md:grid-cols-2">
              {AI_TEAM_INSIGHTS.map((insight, index) => (
                <div key={insight} className="rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-start gap-3">
                    <span className={cn("grid h-10 w-10 place-items-center rounded-2xl text-white", index === 0 ? "bg-amber-500" : "bg-indigo-600")}>
                      {index === 0 ? <AlertTriangle className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="font-black text-[#111827]">AI recommendation #{index + 1}</p>
                      <p className="mt-2 text-sm leading-6 text-[#6B7280]">{insight}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <SurfaceCard>
            <SectionTitle icon={ShieldCheck} title="Role architecture" description="Hisobotchi-style hierarchy adapted for Optima team operations." />
            <div className="overflow-hidden rounded-[22px] border border-[#E5E7EB]">
              {ROLE_ARCHITECTURE.map((role) => (
                <div key={role.role} className="grid gap-3 border-b border-[#E5E7EB] bg-white p-3 last:border-b-0 md:grid-cols-[1fr_1.3fr_0.8fr_0.8fr_0.8fr] md:items-center">
                  <div>
                    <p className="font-black text-[#111827]">{role.role}</p>
                    <p className="text-xs text-[#6B7280]">{role.access}</p>
                  </div>
                  {[
                    ["Approve", role.canApprove],
                    ["Redistribute", role.canRedistribute],
                    ["Analytics", role.canViewAnalytics],
                  ].map(([label, allowed]) => (
                    <div key={String(label)} className="flex items-center justify-between rounded-2xl bg-[#F7FAFC] px-3 py-2 text-xs font-black text-[#111827] md:justify-start md:gap-2">
                      <span>{label}</span>
                      <span className={cn("h-2.5 w-2.5 rounded-full", allowed ? "bg-emerald-500" : "bg-slate-300")} />
                    </div>
                  ))}
                  <Pill tone={role.role === "Owner" ? "indigo" : role.role === "Guest" ? "slate" : "blue"}>{role.role === "Owner" ? "Full" : "Scoped"}</Pill>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={MessageSquareText} title="Team chat and collaboration" description="Realtime chat, reactions, voice notes, task mentions and AI summaries as premium placeholders." />
            <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-black text-white">UP</span>
                <div>
                  <p className="font-black text-[#111827]">Optima Launch Squad</p>
                  <p className="text-sm text-[#6B7280]">6 members - AI summary ready</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["Sara", "Landing UI proof uploaded. Ready for final approve.", "Design"],
                  ["Alex", "@Otabek reaction menu timer paused, review requested.", "Task mention"],
                  ["AI", "Summary: 2 blockers cleared, 1 overload risk remains.", "AI summary"],
                ].map(([name, body, badge]) => (
                  <div key={body} className="rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black text-[#111827]">{name}</p>
                      <Pill tone={badge === "AI summary" ? "indigo" : "blue"}>{badge}</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6B7280]">{body}</p>
                    <div className="mt-2 flex gap-1.5">
                      {["/emojis/fire.svg", "/emojis/clap.svg", "/emojis/done.svg"].map((src) => (
                        <span key={src} className="grid h-7 w-7 place-items-center rounded-full bg-[#F7FAFC] ring-1 ring-[#E5E7EB]">
                          <img src={src} alt="Premium reaction" className="h-4 w-4" loading="lazy" decoding="async" />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </div>
        </>)}

        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <SurfaceCard>
            <SectionTitle icon={Users} title={t("app.teams.dashboard")} description={t("app.teams.dashboardDesc")} />
            <div className="grid gap-3 sm:grid-cols-2">
              {TEAM_METRICS.map((metric) => (
                <div key={metric.labelKey} className="rounded-2xl bg-[#F7FAFC] p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6B7280]">{metric.label}</p>
                    <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <metric.icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[#111827]">{metric.value}</p>
                  <Pill tone={metric.tone} className="mt-2">{metric.trend}</Pill>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><Activity className="h-4 w-4" /> {t("app.teams.linkedChat")}</p>
              <p className="mt-1 text-sm text-indigo-700/80">{t("app.teams.linkedChatDesc")}</p>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Shield} title={t("app.teams.membersRoles")} description={t("app.teams.membersRolesDesc")} />
            <div className="space-y-3">
              {TEAM_MEMBERS.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <PremiumAvatarRing active={member.status === "Online"} className="h-11 w-11 rounded-2xl">
                      <div className="relative grid h-full w-full place-items-center rounded-[14px] bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-bold text-white">
                        {member.name.split(" ").map((part) => part[0]).join("")}
                        <PremiumStatusBadge status={TEAM_STATUS[member.status] ?? "offline"} size={16} className="absolute -bottom-1 -right-1 border-[#E5E7EB]" />
                      </div>
                    </PremiumAvatarRing>
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-[#111827]">
                        {member.name}
                        {member.role === "Admin" && <PremiumGradientBadge label="Creator" icon="/emojis/trophy.svg" />}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#6B7280]">
                        <img src={TEAM_FOCUS_ASSETS[member.focus as keyof typeof TEAM_FOCUS_ASSETS] ?? "/emojis/gem.svg"} alt={`${member.focus} skill icon`} className="h-4 w-4" loading="lazy" decoding="async" />
                        {t(`app.teams.focus.${member.focus.toLowerCase()}`, member.focus)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Pill tone={member.role === "Admin" ? "indigo" : "slate"}>{t(`app.teams.roles.${member.role.toLowerCase()}`, member.role)}</Pill>
                    <Pill tone={member.status === "Online" ? "green" : member.status === "Away" ? "amber" : "slate"}>{t(`app.chat.${member.status.toLowerCase()}`, member.status)}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <SurfaceCard>
            <SectionTitle icon={Users} title="Team spaces" description="Spaces connect people, projects, chats, workload and permissions." />
            <div className="grid gap-3 md:grid-cols-3">
              {TEAM_SPACES.map((space) => (
                <div key={space.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-[#111827]">{space.name}</h3>
                    <Pill tone="indigo">{space.projects} projects</Pill>
                  </div>
                  <p className="mt-2 text-sm text-[#6B7280]">{space.permissions}</p>
                  <div className="mt-4"><ProgressBar value={space.workload} label="Workload" /></div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Shield} title="Roles and permissions" description="Admin/member roles are ready for future backend permissions." />
            <div className="space-y-3">
              {["Create projects", "Manage automations", "Invite members", "Approve deliverables"].map((permission, index) => (
                <div key={permission} className="flex items-center justify-between rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]">
                  <span className="text-sm font-bold text-[#111827]">{permission}</span>
                  <div className="flex gap-2">
                    <Pill tone="indigo">Admin</Pill>
                    <Pill tone={index < 2 ? "slate" : "blue"}>{index < 2 ? "Restricted" : "Member"}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <Modal open={modalOpen} title={t("app.teams.modalTitle")} description={t("app.teams.modalDesc")} onClose={() => setModalOpen(false)}>
          <div className="space-y-3">
            <input className="w-full rounded-2xl border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.teams.teamName")} />
            <input className="w-full rounded-2xl border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.teams.inviteEmail")} />
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setModalOpen(false)}>{t("app.common.cancel")}</ActionButton>
              <ActionButton onClick={() => setModalOpen(false)}>{t("app.teams.createDemoTeam")}</ActionButton>
            </div>
          </div>
        </Modal>
      </PageShell>
      <Toast message={notice} />
    </AppLayout>
  );
}
