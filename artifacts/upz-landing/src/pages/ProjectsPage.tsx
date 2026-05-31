import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Plus, Target, UserPlus, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, Modal, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { ActivityTimeline, AutomationRuleCard, DataTable, FilterBar, TaskDrawer, ViewSwitcher } from "@/components/app/PowerWorkspaceSystem";
import { ACTIVITY_LOG, AUTOMATION_RULES, GOALS, POWER_VIEWS, SMART_TASKS, TEAM_MEMBERS, TIME_ENTRIES } from "@/data/ecosystemData";
import type { SmartTask, TaskStatus, TaskView, UserProfile } from "@/types";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

export default function ProjectsPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [view, setView] = useState<TaskView>("board");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<SmartTask[]>(SMART_TASKS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<SmartTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) => `${task.title} ${task.project} ${task.assignee} ${task.status} ${task.tags.join(" ")}`.toLowerCase().includes(normalized));
  }, [query, tasks]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  };

  const moveTask = (taskId: string, status: TaskStatus) => {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    setSelectedTask((current) => (current?.id === taskId ? { ...current, status } : current));
    showNotice(`Task moved to ${status.replace("_", " ")}`);
  };

  const tableRows = filteredTasks.map((task) => ({
    id: task.id,
    cells: [
      <span className="font-black">{task.title}</span>,
      <Pill tone="indigo">{task.status.replace("_", " ")}</Pill>,
      <span>{task.assignee}</span>,
      <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span className="text-[#6B7280]">{task.dueDate}</span>,
    ],
  }));

  return (
    <AppLayout user={user} title={t("app.nav.projects")} onLogout={onLogout}>
      <PageShell>
        <PageHeader eyebrow="Smart Projects" title="Project command center" description="Kanban, table, timeline, calendar, workload, goals, automations and task detail drawers in one Optima power-user workspace.">
          <ActionButton onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Create project</ActionButton>
          <ActionButton variant="secondary"><CalendarDays className="h-4 w-4" /> Deadlines</ActionButton>
        </PageHeader>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ViewSwitcher views={POWER_VIEWS} value={view} onChange={setView} />
          <div className="flex flex-wrap gap-2"><Pill tone="green">Health 87%</Pill><Pill tone="amber">2 blockers</Pill><Pill tone="indigo">4 active projects</Pill></div>
        </div>

        <FilterBar query={query} onQueryChange={setQuery} chips={["Assignee", "Priority", "Due date", "Status", "Tag"]} action={<ActionButton className="py-1.5" onClick={() => showNotice("Saved view created locally")}>Save view</ActionButton>} />

        {view === "board" && (
          <SurfaceCard>
            <SectionTitle icon={ClipboardList} title="Smart Task board" description="ClickUp-style capability translated to Optima cards, fields and detail drawer." />
            <div className="grid gap-4 xl:grid-cols-5">
              {(["backlog", "todo", "in_progress", "review", "done"] as TaskStatus[]).map((status) => (
                <div
                  key={status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain") || draggingId;
                    if (taskId) moveTask(taskId, status);
                    setDraggingId(null);
                  }}
                  className={cn("rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3 transition-colors", draggingId && "border-indigo-200 bg-indigo-50")}
                >
                  <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black capitalize text-[#111827]">{status.replace("_", " ")}</h3><Pill tone="slate">{filteredTasks.filter((task) => task.status === status).length}</Pill></div>
                  <div className="space-y-3">
                    {filteredTasks.filter((task) => task.status === status).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          setDraggingId(task.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", task.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => setSelectedTask(task)}
                        className={cn("w-full cursor-grab rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left transition-colors hover:border-indigo-200 active:cursor-grabbing", draggingId === task.id && "opacity-50")}
                      >
                        <p className="font-black leading-snug text-[#111827]">{task.title}</p>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6B7280]">{task.description}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">{task.tags.slice(0, 2).map((tag) => <Pill key={tag} tone="blue">{tag}</Pill>)}</div>
                        <div className="mt-3 flex items-center justify-between text-xs font-bold text-[#6B7280]"><span>{task.assignee}</span><span>{task.dueDate}</span></div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        )}

        {(view === "list" || view === "table") && <DataTable columns={["Task", "Status", "Owner", "Priority", "Due"]} rows={tableRows} onRowClick={(id) => setSelectedTask(tasks.find((task) => task.id === id) ?? null)} />}

        {(view === "timeline" || view === "calendar") && (
          <SurfaceCard>
            <SectionTitle icon={CalendarDays} title={`${view} view`} description="Dates, estimates, tracked time and task progress in compact planning lanes." />
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => setSelectedTask(task)} className="grid w-full gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-left md:grid-cols-[1fr_1.4fr_0.6fr] md:items-center">
                  <div><p className="font-black text-[#111827]">{task.title}</p><p className="text-xs text-[#6B7280]">{task.assignee} - {task.project}</p></div>
                  <ProgressBar value={task.progress} />
                  <Pill tone="indigo">{task.dueDate}</Pill>
                </button>
              ))}
            </div>
          </SurfaceCard>
        )}

        {view === "dashboard" && (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <SurfaceCard><SectionTitle icon={Target} title="Milestones" description="Goal tracking and OKR-style progress." />{GOALS.map((goal) => <div key={goal.id} className="mb-4 rounded-2xl bg-[#F7FAFC] p-4 ring-1 ring-[#E5E7EB]"><div className="flex items-center justify-between"><p className="font-black text-[#111827]">{goal.title}</p><Pill tone="blue">{goal.owner}</Pill></div><ProgressBar value={goal.progress} label={goal.dueDate} /></div>)}</SurfaceCard>
            <SurfaceCard><SectionTitle icon={Zap} title="Flow Automations" description="Trigger/action rules shown as backend-ready frontend demo." /><div className="space-y-3">{AUTOMATION_RULES.map((rule) => <AutomationRuleCard key={rule.id} rule={rule} onToggle={() => showNotice(`${rule.name} toggled locally`)} />)}</div></SurfaceCard>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <SurfaceCard>
            <SectionTitle icon={UserPlus} title="Workload" description="Owners, assignments and tracked focus time." />
            <div className="space-y-3">
              {TEAM_MEMBERS.slice(0, 5).map((member, index) => (
                <div key={member.id} className="rounded-2xl bg-[#F7FAFC] p-4 ring-1 ring-[#E5E7EB]"><div className="flex items-center justify-between"><div><p className="font-black text-[#111827]">{member.name}</p><p className="text-sm text-[#6B7280]">{member.focus}</p></div><Pill tone={index === 0 ? "indigo" : "slate"}>{index + 2} tasks</Pill></div><ProgressBar value={72 + index * 4} /></div>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard>
            <SectionTitle title="Activity + time tracking" description="Project history, focus time and local demo audit trail." />
            <ActivityTimeline items={[...ACTIVITY_LOG.slice(0, 4), ...TIME_ENTRIES.map((entry) => `${entry.owner} tracked ${entry.duration} on ${entry.task}`)]} />
          </SurfaceCard>
        </div>

        <Modal open={modalOpen} title="Create demo project" description="Frontend-only project creation modal for the Optima MVP." onClose={() => setModalOpen(false)}>
          <div className="space-y-3">
            <input className="w-full rounded-2xl border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder="Project name" />
            <textarea className="min-h-28 w-full rounded-2xl border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder="Project brief" />
            <div className="flex justify-end gap-2 pt-2"><ActionButton variant="secondary" onClick={() => setModalOpen(false)}>Cancel</ActionButton><ActionButton onClick={() => { setModalOpen(false); showNotice("Demo project created locally"); }}>Create project</ActionButton></div>
          </div>
        </Modal>
        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onCreateTask={() => showNotice("Linked task created locally")} />
      </PageShell>
      <Toast message={notice} />
    </AppLayout>
  );
}
