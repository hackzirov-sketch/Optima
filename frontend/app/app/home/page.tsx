'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock, Layers, ListTodo, Loader2, MessageCircle, TrendingUp, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MetricTile, PageHeader, PageShell, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { useNotifications } from "@/hooks/useNotifications";
import { tasksApi } from "@/lib/api";
import { getUserDisplayName } from "@/lib/displayUser";
import { computeFocusScore, sortPendingTasks } from "@/lib/taskCharts";

const QUICK_ACTIONS = [
  { labelKey: "newTask", icon: ListTodo, href: "/app/tasks", color: "#6366F1" },
  { labelKey: "openChat", icon: MessageCircle, href: "/app/chat", color: "#3B82F6" },
  { labelKey: "workspace", icon: Layers, href: "/app/workspace", color: "#10B981" },
  { labelKey: "dashboard", icon: TrendingUp, href: "/app/dashboard", color: "#F59E0B" },
];

export default function HomePage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const { projects, loading: projectsLoading } = useProjects(activeWorkspace?.id);
  const { tasks: apiTasks, loading: tasksLoading } = useAllWorkspaceTasks(
    activeWorkspace?.id,
    projects.map((p) => p.id),
  );
  const { notifications, unreadCount, loading: notifsLoading } = useNotifications();
  const [time, setTime] = useState(new Date());
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const getStatus = (taskId: string, original: string) => localStatus[taskId] ?? original;

  const pendingTasks = sortPendingTasks(
    apiTasks.filter((task) => getStatus(task.id, task.status) !== 'done'),
    5,
  );

  const completedCount = apiTasks.filter((task) => getStatus(task.id, task.status) === 'done').length;
  const totalCount = apiTasks.length;
  const focusScore = computeFocusScore(apiTasks, getStatus);

  const dateStr = time.toLocaleDateString(i18n.language, { weekday: "long", month: "long", day: "numeric" });
  const timeStr = time.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const goalLabel = user ? t(`app.goals.${user?.goal}`, user?.goal ?? "") : '';

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'backlog' : 'done';
    setLocalStatus((prev) => ({ ...prev, [taskId]: newStatus }));
    try {
      await tasksApi.move(taskId, { status: newStatus });
    } catch {
      setLocalStatus((prev) => ({ ...prev, [taskId]: currentStatus }));
    }
  };

  const recentActivity = notifications.slice(0, 5);

  return (
    <PageShell>
      <PageHeader
        eyebrow={dateStr}
        title={t("app.home.welcome", { name: getUserDisplayName(user, t("app.home.guest", "there")) })}
        description={t("app.home.description", { goal: goalLabel })}
      >
        <div className="rounded-2xl bg-muted px-4 py-3 text-right">
          <div className="font-mono text-2xl font-bold text-foreground">{timeStr}</div>
          <div className="text-xs text-muted-foreground">
            {tasksLoading
              ? 'Loading…'
              : t("app.home.tasksDoneCount", { done: completedCount, total: totalCount })
            }
          </div>
        </div>
      </PageHeader>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label={t("app.home.metrics.focusScore")}
          value={tasksLoading ? '…' : focusScore === null ? '—' : `${focusScore}%`}
          icon={Zap}
          trend={t("app.home.metrics.focusTrend")}
        />
        <MetricTile
          label={t("app.home.metrics.openProjects")}
          value={projectsLoading ? '…' : String(projects.length)}
          icon={Layers}
          accent="#3B82F6"
          trend={t("app.home.metrics.projectTrend")}
        />
        <MetricTile
          label={t("app.home.metrics.unreadItems")}
          value={notifsLoading ? '…' : String(unreadCount)}
          icon={MessageCircle}
          accent="#F59E0B"
          trend={t("app.home.metrics.unreadTrend")}
        />
      </div>

      {/* Quick actions */}
      <SurfaceCard>
        <SectionTitle icon={Zap} title={t("app.home.quickActions")} description={t("app.home.quickActionsDesc")} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border border-border bg-muted p-4 transition-all hover:-translate-y-1 hover:bg-card hover:shadow-sm"
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-2xl"
                style={{ background: `${action.color}14`, color: action.color }}
              >
                <action.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {t(`app.home.actions.${action.labelKey}`)}
              </span>
            </Link>
          ))}
        </div>
      </SurfaceCard>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pending tasks */}
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
              {totalCount === 0 ? 'No tasks yet — create one in Projects.' : 'All tasks completed! 🎉'}
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
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
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

        {/* Recent activity (real notifications) */}
        <SurfaceCard>
          <SectionTitle icon={Clock} title={t("app.home.recentActivity")} description={t("app.home.recentActivityDesc")} />

          {notifsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No recent activity yet.
            </p>
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
    </PageShell>
  );
}
