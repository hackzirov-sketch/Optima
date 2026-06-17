'use client';

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  Loader2,
  MessageCircle,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CommandCard, MetricTile, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { WidgetCard } from "@/components/app/PowerWorkspaceSystem";
import type { DashboardWidget } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { useMembers } from "@/hooks/useMembers";
import { useNotifications } from "@/hooks/useNotifications";
import { useWorkspaceAnalytics } from "@/hooks/useWorkspaceAnalytics";
import { tasksApi } from "@/lib/api";
import { getUserDisplayName } from "@/lib/displayUser";
import { buildProductivityData, buildWeeklyActivity, computeFocusScore, sortPendingTasks } from "@/lib/taskCharts";
import { storage } from "@/utils/storage";

const PROJECT_COLORS = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B"];

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 16,
    color: "hsl(var(--foreground))",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },
  cursor: { fill: "rgba(99,102,241,0.08)" },
};

function MetricSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-muted p-4">
      <div className="h-3 w-20 rounded bg-border" />
      <div className="mt-3 h-8 w-12 rounded bg-border" />
      <div className="mt-2 h-3 w-24 rounded bg-border" />
    </div>
  );
}

export default function Page() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const { projects, loading: projectsLoading } = useProjects(activeWorkspace?.id);
  const { tasks, loading: tasksLoading } = useAllWorkspaceTasks(
    activeWorkspace?.id,
    projects.map((p) => p.id),
  );
  const { members } = useMembers(activeWorkspace?.id);
  const { notifications, unreadCount, loading: notifsLoading } = useNotifications();
  const { analytics } = useWorkspaceAnalytics(activeWorkspace?.id);

  // Real-time clock
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Pending task local toggle state
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});
  const getStatus = (taskId: string, original: string) => localStatus[taskId] ?? original;

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'backlog' : 'done';
    setLocalStatus((prev) => ({ ...prev, [taskId]: newStatus }));
    try {
      await tasksApi.move(taskId, { status: newStatus });
    } catch {
      setLocalStatus((prev) => ({ ...prev, [taskId]: currentStatus }));
    }
  };

  const pendingTasks = sortPendingTasks(
    tasks.filter((task) => getStatus(task.id, task.status) !== 'done'),
    5,
  );

  // Draggable widgets
  const [preset, setPreset] = useState("Launch");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const WIDGET_IDS = ['w-tasks', 'w-workload', 'w-goals', 'w-time', 'w-risk', 'w-mentions', 'w-wallet', 'w-ai'];
  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = storage.getDashboardLayout();
    return saved.length ? saved : WIDGET_IDS;
  });
  useEffect(() => { storage.saveDashboardLayout(widgetOrder); }, [widgetOrder]);

  const orderedWidgets = widgetOrder
    .map((id) => liveWidgets.find((w) => w.id === id))
    .filter((w): w is DashboardWidget => Boolean(w));

  const moveWidget = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setWidgetOrder((cur) => {
      const si = cur.indexOf(draggingId);
      const ti = cur.indexOf(targetId);
      if (si < 0 || ti < 0) return cur;
      const next = [...cur];
      const [moved] = next.splice(si, 1);
      next.splice(ti, 0, moved);
      return next;
    });
  };

  // Computed metrics
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const activeTasks = tasks.filter((task) => task.status !== 'done').length;
  const inReview = tasks.filter((task) => task.status === 'review').length;
  const focusScore = computeFocusScore(tasks, getStatus);

  // Project progress bars (top 4)
  const projectProgress = useMemo(() => {
    return projects.slice(0, 4).map((proj, i) => {
      const projTasks = tasks.filter((task) => task.projectId === proj.id);
      const done = projTasks.filter((task) => task.status === 'done').length;
      const pct = projTasks.length === 0 ? 0 : Math.round((done / projTasks.length) * 100);
      return { name: proj.name, progress: pct, color: PROJECT_COLORS[i % PROJECT_COLORS.length] };
    });
  }, [projects, tasks]);

  // Charts
  const weeklyActivity = useMemo(() => buildWeeklyActivity(tasks), [tasks]);
  const productivityData = useMemo(() => buildProductivityData(tasks), [tasks]);

  // Dynamic insight widgets from real backend data
  const liveWidgets = useMemo((): DashboardWidget[] => {
    const totalEstHours = tasks
      .filter((t) => t.status !== 'done')
      .reduce((s, t) => s + (t.estimatedHours ?? 0), 0);

    const highPriorityOpen = tasks.filter(
      (t) => t.priority === 'high' && t.status !== 'done',
    ).length;
    const riskTone: DashboardWidget['tone'] =
      highPriorityOpen === 0 ? 'green' : highPriorityOpen <= 2 ? 'amber' : 'red';
    const riskLabel = highPriorityOpen === 0 ? 'Low' : highPriorityOpen <= 2 ? 'Medium' : 'High';

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const dueThisWeek = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) >= weekStart && t.status !== 'done',
    ).length;

    const completionPct =
      tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100);

    return [
      {
        id: 'w-tasks',
        title: 'Smart tasks',
        value: tasksLoading ? '…' : String(activeTasks),
        meta: dueThisWeek > 0 ? `${dueThisWeek} due this week` : 'All on track',
        tone: 'indigo',
      },
      {
        id: 'w-workload',
        title: 'Workload',
        value: tasksLoading ? '…' : `${completionPct}%`,
        meta: completionPct >= 70 ? 'Team capacity is healthy' : completionPct >= 40 ? 'Keep pushing' : 'Getting started',
        tone: completionPct >= 60 ? 'green' : completionPct >= 30 ? 'amber' : 'blue',
      },
      {
        id: 'w-goals',
        title: 'Milestones',
        value: String(projects.length),
        meta: projects.length === 0 ? 'No projects yet' : `${projects.length} active project${projects.length !== 1 ? 's' : ''}`,
        tone: 'amber',
      },
      {
        id: 'w-time',
        title: 'Focus time',
        value: tasksLoading ? '…' : `${totalEstHours}h`,
        meta: totalEstHours > 0 ? 'Estimated open tasks' : 'No estimates set',
        tone: 'blue',
      },
      {
        id: 'w-risk',
        title: 'Project risk',
        value: tasksLoading ? '…' : riskLabel,
        meta: highPriorityOpen === 0 ? 'No blockers open' : `${highPriorityOpen} high-priority open`,
        tone: riskTone,
      },
      {
        id: 'w-mentions',
        title: 'Mentions',
        value: String(unreadCount),
        meta: unreadCount === 0 ? 'All caught up' : 'Unread notifications',
        tone: unreadCount > 5 ? 'red' : unreadCount > 0 ? 'amber' : 'green',
      },
      {
        id: 'w-wallet',
        title: 'Earnings',
        value: '$4.6k',
        meta: 'Universal Bank coming soon',
        tone: 'green',
      },
      {
        id: 'w-ai',
        title: 'AI suggestions',
        value: '14',
        meta: 'Ready to apply',
        tone: 'indigo',
      },
    ];
  }, [tasks, projects, completedTasks, activeTasks, unreadCount, tasksLoading]);

  // Recent activity
  const recentActivity = notifications.slice(0, 5);

  const isLoading = wsLoading || projectsLoading;

  // Date/time strings
  const dateStr = time.toLocaleDateString(i18n.language, { weekday: "long", month: "long", day: "numeric" });
  const timeStr = time.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const goalLabel = user ? t(`app.goals.${user?.goal}`, user?.goal ?? "") : '';

  const COMMANDS = [
    {
      icon: MessageCircle,
      title: t("app.dashboard.commands.chatTitle"),
      description: t("app.dashboard.commands.chatDesc"),
      meta: `${unreadCount} unread`,
      accent: "#3B82F6",
      href: "/app/chat",
    },
    {
      icon: CalendarDays,
      title: t("app.dashboard.commands.projectTitle"),
      description: t("app.dashboard.commands.projectDesc"),
      meta: `${projects.length} projects`,
      accent: "#6366F1",
      href: "/app/projects",
    },
    {
      icon: CheckSquare,
      title: "Active tasks",
      description: "Tasks in progress across all projects",
      meta: `${activeTasks} open`,
      accent: "#10B981",
      href: "/app/tasks",
    },
    {
      icon: Users,
      title: "Team",
      description: "Workspace members and collaboration",
      meta: `${members.length} members`,
      accent: "#F59E0B",
      href: "/app/teams",
    },
  ];

  return (
    <PageShell>
      {/* ── Header with clock ─────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={dateStr}
        title={t("app.dashboard.welcome", { name: getUserDisplayName(user, t("app.dashboard.guest", "there")) })}
        description={goalLabel ? t("app.home.description", { goal: goalLabel }) : t("app.dashboard.description")}
      >
        <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl bg-muted px-4 py-3 text-right">
            <div className="font-mono text-2xl font-bold tabular-nums text-foreground">{timeStr}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {tasksLoading ? 'Loading…' : `${completedTasks} / ${tasks.length} done`}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/app/assistant">
              <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-[0.98]">
                <Bot className="h-4 w-4" /> {t("app.dashboard.askAI")}
              </span>
            </Link>
            <Link href="/app/chat">
              <span className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98]">
                <MessageCircle className="h-4 w-4" /> {t("app.dashboard.openChat")}
              </span>
            </Link>
          </div>
        </div>
      </PageHeader>

      {/* ── Metric tiles ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile
            label={t("app.dashboard.tasksDone")}
            value={String(completedTasks)}
            icon={CheckSquare}
            trend={`${tasks.length} total`}
          />
          <MetricTile
            label={t("app.dashboard.activeProjects")}
            value={String(projects.length)}
            icon={FolderOpen}
            accent="#3B82F6"
            trend={`${activeTasks} open tasks`}
          />
          <MetricTile
            label={t("app.dashboard.teamMembers")}
            value={String(members.length)}
            icon={Users}
            accent="#10B981"
            trend={`${inReview} in review`}
          />
          <MetricTile
            label={t("app.home.metrics.focusScore")}
            value={tasksLoading ? '…' : focusScore === null ? '—' : `${focusScore}%`}
            icon={Zap}
            accent="#6366F1"
            trend={t("app.home.metrics.focusTrend")}
          />
        </div>
      )}

      {/* ── Hero + Project progress ────────────────────────────────────────── */}
      <SurfaceCard className="overflow-hidden bg-gradient-to-br from-card via-card to-indigo-50/40 dark:to-indigo-950/20">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {analytics ? (
                <>
                  <Pill tone="indigo">{analytics.projectCount ?? analytics.totalProjects ?? projects.length} projects</Pill>
                  <Pill tone="green">
                    {analytics.completedTasks ??
                      analytics.taskByStatus?.find((s: { status: string }) => s.status === 'done')?.count ??
                      0}{' '}
                    done
                  </Pill>
                  <Pill tone="blue">
                    {analytics.openTasks ??
                      analytics.taskByStatus?.find((s: { status: string }) => s.status === 'in_progress')?.count ??
                      activeTasks}{' '}
                    in progress
                  </Pill>
                </>
              ) : (
                <>
                  <Pill tone="indigo">{t("app.dashboard.focusScore")}</Pill>
                  <Pill tone="blue">{projects.length} {t("app.dashboard.activeProjectsPill")}</Pill>
                  <Pill tone="green">{members.length} {t("app.dashboard.teammatesOnlinePill")}</Pill>
                </>
              )}
            </div>
            <h2 className="text-2xl font-black tracking-tight text-foreground md:text-4xl">
              {t("app.dashboard.heroTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("app.dashboard.heroDesc")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link href="/app/projects">
                <span className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98]">
                  <ArrowUpRight className="h-4 w-4" /> {t("app.dashboard.continueProjects")}
                </span>
              </Link>
              <Link href="/app/workspace">
                <span className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98]">
                  <FolderOpen className="h-4 w-4" /> {t("app.dashboard.openWorkspace")}
                </span>
              </Link>
            </div>
          </div>

          {/* Project launch readiness */}
          <div className="rounded-[24px] border border-border bg-card p-4 shadow-sm">
            <SectionTitle
              icon={Target}
              title={t("app.dashboard.launchReadiness")}
              description={t("app.dashboard.trackerDesc")}
            />
            {tasksLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : projectProgress.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No projects yet.{' '}
                <Link href="/app/projects" className="text-indigo-600 hover:underline">Create one →</Link>
              </p>
            ) : (
              <div className="space-y-4">
                {projectProgress.map((proj) => (
                  <ProgressBar key={proj.name} value={proj.progress} accent={proj.color} label={proj.name} />
                ))}
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* ── Pending tasks + Recent activity ───────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard>
          <SectionTitle
            icon={ListTodo}
            title={t("app.home.todaysTasks")}
            description={t("app.home.todaysTasksDesc")}
            action={
              <Link href="/app/tasks" className="rounded-2xl px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                {t("app.home.viewAll")}
              </Link>
            }
          />

          {wsLoading || tasksLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
            </div>
          ) : !activeWorkspace ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Select or create a workspace to see tasks.
            </p>
          ) : pendingTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tasks.length === 0 ? 'No tasks yet — create one in Projects.' : 'All tasks completed! 🎉'}
            </p>
          ) : (
            <div className="space-y-3">
              {pendingTasks.map((task) => {
                const status = getStatus(task.id, task.status);
                const isDone = status === 'done';
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => toggleTask(task.id, status)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    {isDone
                      ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                      : <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    }
                    <span className={`min-w-0 flex-1 truncate text-sm font-semibold text-foreground ${isDone ? 'line-through opacity-50' : ''}`}>
                      {task.title}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      task.priority === 'high'
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                        : task.priority === 'medium'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                          : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
                    }`}>
                      {task.priority}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            icon={Clock}
            title={t("app.home.recentActivity")}
            description={t("app.home.recentActivityDesc")}
          />
          {notifsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No recent activity yet.</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((notif) => (
                <div key={notif.id} className="flex items-start gap-3 rounded-2xl bg-muted p-4">
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${notif.isRead ? 'bg-slate-300' : 'bg-indigo-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{notif.title}</p>
                    {notif.body && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{notif.body}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(notif.createdAt).toLocaleTimeString(i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle
          icon={Zap}
          title={t("app.dashboard.nextActions")}
          description={t("app.dashboard.nextActionsDesc")}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COMMANDS.map((cmd) => (
            <Link key={cmd.title} href={cmd.href}>
              <CommandCard
                icon={cmd.icon}
                title={cmd.title}
                description={cmd.description}
                meta={cmd.meta}
                accent={cmd.accent}
              />
            </Link>
          ))}
        </div>
      </SurfaceCard>

      {/* ── Draggable widgets ─────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle icon={LayoutDashboard} title="Insight Boards" description="Customisable dashboard widgets — drag to reorder." />
        <div className="mb-4 flex flex-wrap gap-2">
          {["Personal", "Team", "Freelancer", "Launch"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPreset(item)}
              className={`rounded-2xl px-3 py-2 text-xs font-black transition-colors ${
                preset === item ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground ring-1 ring-border hover:bg-card"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {orderedWidgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              draggable
              onDragStart={() => setDraggingId(widget.id)}
              onDragOver={() => moveWidget(widget.id)}
              onDragEnd={() => setDraggingId(null)}
            />
          ))}
        </div>
      </SurfaceCard>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard>
          <SectionTitle
            icon={BarChart3}
            title={t("app.dashboard.weeklyActivity")}
            description="Tasks created and completed this week (Mon–Sun)"
          />
          {tasksLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chart…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyActivity} barGap={4}>
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="created" fill="#6366F1" radius={[8, 8, 0, 0]} name="Created" />
                <Bar dataKey="done" fill="#10B981" radius={[8, 8, 0, 0]} name="Done" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle
            icon={TrendingUp}
            title={t("app.dashboard.productivityScore")}
            description="Task completion rate over the last 5 weeks"
          />
          {tasksLoading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chart…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={productivityData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#10B981"
                  strokeWidth={3}
                  dot={{ fill: "#10B981", strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: "#10B981" }}
                  name="Completion %"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SurfaceCard>
      </div>
    </PageShell>
  );
}
