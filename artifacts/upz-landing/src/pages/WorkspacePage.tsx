import { useMemo, useState } from "react";
import { Archive, Bell, CheckCircle2, FileText, FolderKanban, Layers, Plus, Rocket, Save, Settings, ShieldCheck, Timer, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { SMART_TASKS, WORKSPACE_ZONE } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

type WorkspaceTab = "overview" | "boards" | "tasks" | "automation";

const TABS: Array<{ id: WorkspaceTab; labelKey: string; icon: typeof Layers }> = [
  { id: "overview", labelKey: "app.workspace.clean.tabs.overview", icon: Layers },
  { id: "boards", labelKey: "app.workspace.clean.tabs.boards", icon: FolderKanban },
  { id: "tasks", labelKey: "app.workspace.clean.tabs.tasks", icon: CheckCircle2 },
  { id: "automation", labelKey: "app.workspace.clean.tabs.automation", icon: Workflow },
];

const BOARD_SUMMARY = [
  { name: "Roadmap", items: 12, status: "Active" },
  { name: "Sprint", items: 8, status: "Review" },
  { name: "Docs", items: 5, status: "Draft" },
  { name: "Archive", items: 21, status: "Stored" },
];

const AUTOMATIONS = [
  { key: "reviewGate", active: true },
  { key: "deadlineRadar", active: true },
  { key: "weeklySummary", active: false },
];

export default function WorkspacePage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const visibleTasks = useMemo(() => SMART_TASKS.slice(0, 6), []);
  const workspaceBoards = useMemo(
    () =>
      WORKSPACE_ZONE.spaces.flatMap((space) =>
        space.collections.flatMap((collection) =>
          collection.boards.map((board) => ({
            name: board,
            description: `${space.name} / ${collection.name}`,
            items: collection.boards.length,
          })),
        ),
      ),
    [],
  );
  const completion = Math.round((visibleTasks.filter((task) => task.status === "done").length / visibleTasks.length) * 100);

  const saveWorkspace = () => {
    setNotice(t("app.workspace.clean.saved"));
    window.setTimeout(() => setNotice(null), 1800);
  };

  return (
    <AppLayout user={user} title={t("app.nav.workspace")} onLogout={onLogout}>
      <PageShell>
        <PageHeader eyebrow={t("app.nav.workspace")} title={t("app.workspace.clean.title")} description={t("app.workspace.clean.description")}>
          <ActionButton onClick={saveWorkspace}>
            <Save className="h-4 w-4" />
            {t("app.common.save")}
          </ActionButton>
        </PageHeader>

        <SurfaceCard className="p-3">
          <div className="flex gap-2 overflow-x-auto">
            {TABS.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "inline-flex min-w-fit items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                  activeTab === id ? "bg-indigo-600 text-white" : "text-[#6B7280] hover:bg-[#F7FAFC] hover:text-[#111827]",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <main className="space-y-5">
            {activeTab === "overview" && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <SurfaceCard>
                    <SectionTitle icon={Rocket} title={t("app.workspace.clean.readiness")} description={t("app.workspace.clean.workspaceHealth")} />
                    <div className="text-4xl font-black text-[#111827]">{completion}%</div>
                    <ProgressBar value={completion} label={t("app.workspace.clean.taskCompletion")} />
                  </SurfaceCard>
                  <SurfaceCard>
                    <SectionTitle icon={FolderKanban} title={t("app.workspace.clean.tabs.boards")} description={t("app.workspace.clean.activeStructure")} />
                    <div className="text-4xl font-black text-[#111827]">{BOARD_SUMMARY.length}</div>
                    <p className="mt-2 text-sm text-[#6B7280]">{t("app.workspace.clean.boardList")}</p>
                  </SurfaceCard>
                  <SurfaceCard>
                    <SectionTitle icon={ShieldCheck} title={t("app.workspace.clean.guards")} description={t("app.workspace.clean.automationState")} />
                    <div className="text-4xl font-black text-[#111827]">{AUTOMATIONS.filter((item) => item.active).length}</div>
                    <p className="mt-2 text-sm text-[#6B7280]">{t("app.workspace.clean.guardsDesc")}</p>
                  </SurfaceCard>
                </div>

                <SurfaceCard>
                  <SectionTitle icon={Layers} title={t("app.workspace.clean.focus")} description={t("app.workspace.clean.focusDesc")} />
                  <div className="grid gap-3 md:grid-cols-2">
                    {workspaceBoards.slice(0, 4).map((board) => (
                      <div key={board.name} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-bold text-[#111827]">{board.name}</h3>
                        <Pill tone="indigo">{t("app.workspace.clean.items", { count: board.items })}</Pill>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-[#6B7280]">{board.description}</p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              </>
            )}

            {activeTab === "boards" && (
              <SurfaceCard>
                <SectionTitle icon={FolderKanban} title={t("app.workspace.clean.tabs.boards")} description={t("app.workspace.clean.mainLanes")} action={<ActionButton variant="secondary"><Plus className="h-4 w-4" />{t("app.workspace.clean.newBoard")}</ActionButton>} />
                <div className="grid gap-3 md:grid-cols-2">
                  {BOARD_SUMMARY.map((board) => (
                    <article key={board.name} className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-[#111827]">{board.name}</h3>
                        <Pill tone={board.status === "Review" ? "amber" : "slate"}>{t(`app.workspace.clean.status.${board.status.toLowerCase()}`)}</Pill>
                      </div>
                      <p className="mt-2 text-sm text-[#6B7280]">{t("app.workspace.clean.workspaceItems", { count: board.items })}</p>
                    </article>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {activeTab === "tasks" && (
              <SurfaceCard>
                <SectionTitle icon={CheckCircle2} title={t("app.workspace.clean.priorityTasks")} description={t("app.workspace.clean.priorityTasksDesc")} />
                <div className="divide-y divide-[#E5E7EB]">
                  {visibleTasks.map((task) => (
                    <button key={task.id} type="button" className="flex w-full items-center justify-between gap-4 py-3 text-left">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#111827]">{task.title}</span>
                        <span className="mt-1 block text-xs text-[#6B7280]">{task.assignee} • {task.dueDate}</span>
                      </span>
                      <Pill tone={task.status === "done" ? "green" : task.status === "review" ? "amber" : "blue"}>{task.status}</Pill>
                    </button>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {activeTab === "automation" && (
              <SurfaceCard>
                <SectionTitle icon={Workflow} title={t("app.workspace.clean.tabs.automation")} description={t("app.workspace.clean.automationDesc")} />
                <div className="grid gap-3">
                  {AUTOMATIONS.map((rule) => (
                    <div key={rule.key} className="flex items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                      <span>
                        <span className="block font-bold text-[#111827]">{t(`app.workspace.clean.automations.${rule.key}`)}</span>
                        <span className="mt-1 block text-sm text-[#6B7280]">{t(`app.workspace.clean.automations.${rule.key}Desc`)}</span>
                      </span>
                      <Pill tone={rule.active ? "green" : "slate"}>{rule.active ? t("app.common.on") : t("app.common.off")}</Pill>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}
          </main>

          <aside className="space-y-5">
            <SurfaceCard>
              <SectionTitle icon={Settings} title={t("app.workspace.clean.profilePreset")} description={t("app.workspace.clean.profilePresetDesc")} />
              <div className="rounded-2xl bg-[#F7FAFC] p-4">
                <p className="text-sm font-bold text-[#111827]">{user.name}</p>
                <p className="mt-1 text-sm capitalize text-[#6B7280]">{user.profession}</p>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={Bell} title={t("app.workspace.clean.signals")} description={t("app.workspace.clean.signalsDesc")} />
              <div className="space-y-3">
                <div className="flex gap-3 rounded-2xl bg-[#F7FAFC] p-3">
                  <Timer className="h-5 w-5 text-indigo-600" />
                  <p className="text-sm text-[#6B7280]">{t("app.workspace.clean.deadlinesAlert")}</p>
                </div>
                <div className="flex gap-3 rounded-2xl bg-[#F7FAFC] p-3">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  <p className="text-sm text-[#6B7280]">{t("app.workspace.clean.docsAlert")}</p>
                </div>
                <div className="flex gap-3 rounded-2xl bg-[#F7FAFC] p-3">
                  <Archive className="h-5 w-5 text-indigo-600" />
                  <p className="text-sm text-[#6B7280]">{t("app.workspace.clean.archiveAlert")}</p>
                </div>
              </div>
            </SurfaceCard>
          </aside>
        </div>
      </PageShell>
      <Toast message={notice} />
    </AppLayout>
  );
}
