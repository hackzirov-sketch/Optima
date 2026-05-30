import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Circle, Clock, Layers, ListTodo, MessageCircle, TrendingUp, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { MetricTile, PageHeader, PageShell, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import type { Task, UserProfile } from "@/types";
import { storage } from "@/utils/storage";
import { INITIAL_TASKS } from "@/data/mockData";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

const QUICK_ACTIONS = [
  { labelKey: "newTask", icon: ListTodo, href: "/app/tasks", color: "#6366F1" },
  { labelKey: "openChat", icon: MessageCircle, href: "/app/chat", color: "#3B82F6" },
  { labelKey: "workspace", icon: Layers, href: "/app/workspace", color: "#10B981" },
  { labelKey: "dashboard", icon: TrendingUp, href: "/app/dashboard", color: "#F59E0B" },
];

const RECENT_ACTIVITY = [
  { labelKey: "completedTask", timeKey: "twoHours" },
  { labelKey: "newMessage", timeKey: "threeHours" },
  { labelKey: "updatedNote", timeKey: "fiveHours" },
  { labelKey: "joinedChat", timeKey: "oneDay" },
  { labelKey: "onboarding", timeKey: "oneDay" },
];

export default function HomePage({ user, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const [time, setTime] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const saved = storage.getTasks();
    if (saved.length === 0) {
      storage.saveTasks(INITIAL_TASKS);
      setTasks(INITIAL_TASKS);
    } else {
      setTasks(saved);
    }
    const timer = window.setInterval(() => setTime(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const todaysTasks = tasks.filter((task) => !task.done).slice(0, 3);
  const completedCount = tasks.filter((task) => task.done).length;
  const dateStr = time.toLocaleDateString(i18n.language, { weekday: "long", month: "long", day: "numeric" });
  const timeStr = time.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  const goalLabel = t(`app.goals.${user.goal}`, user.goal);

  const toggleTask = (id: string) => {
    const updated = tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task));
    setTasks(updated);
    storage.saveTasks(updated);
  };

  return (
    <AppLayout user={user} title={t("app.nav.home")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={dateStr}
          title={t("app.home.welcome", { name: user.name })}
          description={t("app.home.description", { goal: goalLabel })}
        >
          <div className="rounded-2xl bg-[#F7FAFC] px-4 py-3 text-right">
            <div className="font-mono text-2xl font-bold text-[#111827]">{timeStr}</div>
            <div className="text-xs text-[#6B7280]">{t("app.home.tasksDoneCount", { done: completedCount, total: tasks.length })}</div>
          </div>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile label={t("app.home.metrics.focusScore")} value="88%" icon={Zap} trend={t("app.home.metrics.focusTrend")} />
          <MetricTile label={t("app.home.metrics.openProjects")} value="4" icon={Layers} accent="#3B82F6" trend={t("app.home.metrics.projectTrend")} />
          <MetricTile label={t("app.home.metrics.unreadItems")} value="9" icon={MessageCircle} accent="#F59E0B" trend={t("app.home.metrics.unreadTrend")} />
        </div>

        <SurfaceCard>
          <SectionTitle icon={Zap} title={t("app.home.quickActions")} description={t("app.home.quickActionsDesc")} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.href} href={action.href} className="flex w-full flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-sm">
                <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${action.color}14`, color: action.color }}>
                  <action.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-[#111827]">{t(`app.home.actions.${action.labelKey}`)}</span>
              </Link>
            ))}
          </div>
        </SurfaceCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <SurfaceCard>
            <SectionTitle icon={ListTodo} title={t("app.home.todaysTasks")} description={t("app.home.todaysTasksDesc")} action={<Link href="/app/tasks" className="rounded-2xl px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">{t("app.home.viewAll")}</Link>} />
            <div className="space-y-3">
              {todaysTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => toggleTask(task.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm">
                  {task.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-[#6B7280]" />}
                  <span className="min-w-0 flex-1 text-sm font-semibold text-[#111827]">{t(`app.mock.tasks.${task.id}`, task.text)}</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600">{t(`app.priority.${task.priority}`, task.priority)}</span>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Clock} title={t("app.home.recentActivity")} description={t("app.home.recentActivityDesc")} />
            <div className="space-y-3">
              {RECENT_ACTIVITY.map((item) => (
                <div key={item.labelKey} className="flex items-start gap-3 rounded-2xl bg-[#F7FAFC] p-4">
                  <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{t(`app.home.activity.${item.labelKey}`)}</p>
                    <p className="mt-1 text-xs text-[#6B7280]">{t(`app.home.time.${item.timeKey}`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </PageShell>
    </AppLayout>
  );
}
