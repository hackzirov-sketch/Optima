import {
  ArrowUpRight,
  Bell,
  Bot,
  CalendarDays,
  CheckSquare,
  Clock,
  FolderOpen,
  LayoutDashboard,
  MessageCircle,
  Target,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { DashboardCharts } from "@/components/app/DashboardCharts";
import { CommandCard, MetricTile, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { WidgetCard } from "@/components/app/PowerWorkspaceSystem";
import { BANK_TRANSACTIONS, DASHBOARD_WIDGETS, ECOSYSTEM_MODULES, GOALS, NOTIFICATIONS } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";
import { storage } from "@/utils/storage";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

const PROJECT_PROGRESS = [
  { nameKey: "productSystem", progress: 92, color: "#6366F1" },
  { nameKey: "internalExpansion", progress: 76, color: "#3B82F6" },
  { nameKey: "backendIntegration", progress: 40, color: "#10B981" },
  { nameKey: "mobileUx", progress: 58, color: "#F59E0B" },
];

const TODAY_COMMANDS = [
  {
    titleKey: "chatTitle",
    descriptionKey: "chatDesc",
    meta: "Chat",
    icon: MessageCircle,
    accent: "#3B82F6",
  },
  {
    titleKey: "projectTitle",
    descriptionKey: "projectDesc",
    metaKey: "todayTime",
    icon: CalendarDays,
    accent: "#6366F1",
  },
  {
    titleKey: "walletTitle",
    descriptionKey: "walletDesc",
    meta: BANK_TRANSACTIONS[0].amount,
    icon: WalletCards,
    accent: "#10B981",
  },
  {
    titleKey: "aiTitle",
    descriptionKey: "aiDesc",
    metaKey: "aiReady",
    icon: Bot,
    accent: "#F59E0B",
  },
];

const AGENDA = [
  { time: "09:30", titleKey: "teamReview", areaKey: "teams" },
  { time: "11:00", titleKey: "heroQa", areaKey: "project" },
  { time: "14:00", titleKey: "moderation", areaKey: "community" },
  { time: "16:00", titleKey: "demo", areaKey: "workspace" },
];

export default function DashboardPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState("Launch");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = storage.getDashboardLayout();
    return saved.length ? saved : DASHBOARD_WIDGETS.map((widget) => widget.id);
  });
  const unreadNotifications = NOTIFICATIONS.filter((notification) => notification.unread).length;
  const orderedWidgets = widgetOrder
    .map((id) => DASHBOARD_WIDGETS.find((widget) => widget.id === id))
    .filter((widget): widget is (typeof DASHBOARD_WIDGETS)[number] => Boolean(widget));

  useEffect(() => {
    storage.saveDashboardLayout(widgetOrder);
  }, [widgetOrder]);

  const moveWidget = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setWidgetOrder((current) => {
      const sourceIndex = current.indexOf(draggingId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  return (
    <AppLayout user={user} title={t("app.nav.dashboard")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={t("app.dashboard.eyebrow")}
          title={t("app.dashboard.welcome", { name: user.name })}
          description={t("app.dashboard.description")}
        >
          <Link href="/app/assistant">
            <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-500 active:scale-[0.98]">
              <Bot className="h-4 w-4" /> {t("app.dashboard.askAI")}
            </span>
          </Link>
          <Link href="/app/chat">
            <span className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition-all hover:bg-slate-50 active:scale-[0.98]">
              <MessageCircle className="h-4 w-4" /> {t("app.dashboard.openChat")}
            </span>
          </Link>
        </PageHeader>

        <SurfaceCard>
          <SectionTitle icon={LayoutDashboard} title="Insight Boards" description="Customizable dashboard presets with draggable widgets saved to localStorage." />
          <div className="mb-4 flex flex-wrap gap-2">
            {["Personal", "Team", "Freelancer", "Launch"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPreset(item)}
                className={`rounded-2xl px-3 py-2 text-xs font-black transition-colors ${preset === item ? "bg-indigo-600 text-white" : "bg-[#F7FAFC] text-[#6B7280] ring-1 ring-[#E5E7EB] hover:bg-white"}`}
              >
                {item}
              </button>
            ))}
            <Pill tone="green">{GOALS.length} milestones tracked</Pill>
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

        <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
          <SurfaceCard className="overflow-hidden bg-gradient-to-br from-white via-white to-indigo-50">
            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr] lg:items-center">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Pill tone="indigo">{t("app.dashboard.focusScore")}</Pill>
                  <Pill tone="blue">{t("app.dashboard.activeProjectsPill")}</Pill>
                  <Pill tone="green">{t("app.dashboard.teammatesOnlinePill")}</Pill>
                </div>
                <h2 className="text-2xl font-black tracking-tight text-[#111827] md:text-4xl">
                  {t("app.dashboard.heroTitle")}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6B7280]">
                  {t("app.dashboard.heroDesc")}
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Link href="/app/projects">
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-500 active:scale-[0.98]">
                      <ArrowUpRight className="h-4 w-4" /> {t("app.dashboard.continueProjects")}
                    </span>
                  </Link>
                  <Link href="/app/workspace">
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition-all hover:bg-slate-50 active:scale-[0.98]">
                      <FolderOpen className="h-4 w-4" /> {t("app.dashboard.openWorkspace")}
                    </span>
                  </Link>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
                <SectionTitle icon={Target} title={t("app.dashboard.launchReadiness")} description={t("app.dashboard.trackerDesc")} />
                <div className="space-y-4">
                  {PROJECT_PROGRESS.slice(0, 3).map((project) => (
                    <ProgressBar key={project.nameKey} value={project.progress} accent={project.color} label={t(`app.dashboard.progress.${project.nameKey}`)} />
                  ))}
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Clock} title={t("app.dashboard.agenda")} description={t("app.dashboard.agendaDesc")} />
            <div className="space-y-3">
              {AGENDA.map((item) => (
                <div key={`${item.time}-${item.titleKey}`} className="flex gap-3 rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]">
                  <span className="w-12 flex-shrink-0 text-xs font-bold text-indigo-600">{item.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#111827]">{t(`app.dashboard.agendaItems.${item.titleKey}`)}</span>
                    <span className="text-xs text-[#6B7280]">{t(`app.dashboard.areas.${item.areaKey}`)}</span>
                  </span>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label={t("app.dashboard.tasksDone")} value="24" icon={CheckSquare} trend={t("app.dashboard.tasksTrend")} />
          <MetricTile label={t("app.dashboard.activeProjects")} value="4" icon={FolderOpen} accent="#3B82F6" trend={t("app.dashboard.activeProjectsTrend")} />
          <MetricTile label={t("app.dashboard.teamMembers")} value="7" icon={Users} accent="#10B981" trend={t("app.dashboard.teamMembersTrend")} />
          <MetricTile label={t("app.dashboard.unreadAlerts")} value={`${unreadNotifications}`} icon={Bell} accent="#F59E0B" trend={t("app.dashboard.unreadTrend")} />
        </div>

        <SurfaceCard>
          <SectionTitle icon={Zap} title={t("app.dashboard.nextActions")} description={t("app.dashboard.nextActionsDesc")} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {TODAY_COMMANDS.map((command) => (
              <CommandCard
                key={command.titleKey}
                icon={command.icon}
                title={t(`app.dashboard.commands.${command.titleKey}`)}
                description={t(`app.dashboard.commands.${command.descriptionKey}`)}
                meta={command.metaKey ? t(`app.dashboard.commands.${command.metaKey}`) : command.meta}
                accent={command.accent}
              />
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle icon={Zap} title={t("app.dashboard.ecosystemHealth")} description={t("app.dashboard.ecosystemDesc")} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ECOSYSTEM_MODULES.map((module) => (
              <div key={module.name} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#111827]">{t(`app.ecosystem.modules.${module.name}.name`, module.name)}</p>
                    <p className="mt-1 text-sm text-[#6B7280]">{t(`app.ecosystem.modules.${module.name}.status`, module.status)}</p>
                  </div>
                  <span className="text-xl font-bold text-indigo-600">{module.score}</span>
                </div>
                <ProgressBar value={Number.parseInt(module.score, 10)} />
                <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#6B7280]">
                  <span>{t("app.dashboard.moduleUsers", { count: module.users })}</span>
                  <span>{t("app.dashboard.backendReady")}</span>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <DashboardCharts />
      </PageShell>
    </AppLayout>
  );
}
