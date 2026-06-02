import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, CheckCircle2, FileText, FormInput, Plus, Repeat2, StickyNote, Timer, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast } from "@/components/app/DesignSystem";
import { DataTable, FilterBar, TaskDrawer } from "@/components/app/PowerWorkspaceSystem";
import { DOC_PAGES, FORM_FIELDS, SMART_TASKS, TIME_ENTRIES } from "@/data/ecosystemData";
import { INITIAL_TASKS } from "@/data/mockData";
import type { SmartTask, Task, Priority, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

interface Props { user: UserProfile; onLogout: () => void; }

export default function TasksNotesPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [query, setQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<SmartTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = storage.getTasks();
    setTasks(saved.length ? saved : INITIAL_TASKS);
    if (!saved.length) storage.saveTasks(INITIAL_TASKS);
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    const task: Task = { id: `t${Date.now()}`, text: newTask.trim(), done: false, createdAt: Date.now(), priority: newPriority };
    const updated = [task, ...tasks];
    setTasks(updated);
    storage.saveTasks(updated);
    setNewTask("");
    showNotice("Task added locally");
  };

  const toggleTask = (id: string) => {
    const updated = tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task);
    setTasks(updated);
    storage.saveTasks(updated);
  };

  const deleteTask = (id: string) => {
    const updated = tasks.filter((task) => task.id !== id);
    setTasks(updated);
    storage.saveTasks(updated);
  };

  const filteredSmartTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return SMART_TASKS;
    return SMART_TASKS.filter((task) => `${task.title} ${task.project} ${task.assignee} ${task.tags.join(" ")}`.toLowerCase().includes(normalized));
  }, [query]);

  const rows = filteredSmartTasks.map((task) => ({
    id: task.id,
    cells: [
      <span className="font-black">{task.title}</span>,
      <Pill tone="indigo">{task.status.replace("_", " ")}</Pill>,
      <span>{task.assignee}</span>,
      <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span className="text-[#6B7280]">{task.dueDate}</span>,
    ],
  }));

  const pending = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <AppLayout user={user} title={t("app.nav.tasks")} onLogout={onLogout}>
      <PageShell>
        <PageHeader eyebrow="Tasks + Knowledge Hub" title="Smart task and docs operating room" description="Optima task management now includes smart tables, quick tasks, docs/wiki, intake forms, recurring placeholders, reminders and focus time." >
          <ActionButton><Plus className="h-4 w-4" /> New smart task</ActionButton>
          <ActionButton variant="secondary"><Repeat2 className="h-4 w-4" /> Recurring rules</ActionButton>
        </PageHeader>

        <FilterBar query={query} onQueryChange={setQuery} chips={["Saved filters", "Bulk select", "Priority group", "Reminder", "Recurring"]} action={<ActionButton className="py-1.5" onClick={() => showNotice("Saved filter updated locally")}>Save filter</ActionButton>} />

        <SurfaceCard>
          <SectionTitle icon={CheckCircle2} title="Smart Task table" description="Power-user table with status, owner, priority and due date. Row click opens task drawer." />
          <DataTable columns={["Task", "Status", "Owner", "Priority", "Due"]} rows={rows} onRowClick={(id) => setSelectedTask(SMART_TASKS.find((task) => task.id === id) ?? null)} />
        </SurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <SurfaceCard>
            <SectionTitle icon={Plus} title="Quick personal tasks" description="Existing localStorage task flow preserved for fast personal capture." />
            <div className="flex flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3 sm:flex-row sm:items-center">
              <input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="Add a quick task" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#111827] outline-none" />
              <select value={newPriority} onChange={(event) => setNewPriority(event.target.value as Priority)} className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B7280] outline-none"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
              <ActionButton onClick={addTask} className="py-2">Add</ActionButton>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]"><h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">Pending {pending.length}</h3><div className="space-y-2">{pending.map((task) => <div key={task.id} className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-[#E5E7EB]"><button onClick={() => toggleTask(task.id)}><CheckCircle2 className="h-4 w-4 text-[#6B7280]" /></button><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#111827]">{task.text}</span><Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill><button onClick={() => deleteTask(task.id)}><Trash2 className="h-4 w-4 text-rose-500" /></button></div>)}</div></div>
              <div className="rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]"><h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">Completed {done.length}</h3><div className="space-y-2">{done.map((task) => <div key={task.id} className="flex items-center gap-2 rounded-xl bg-white p-2 text-sm text-[#6B7280] line-through ring-1 ring-[#E5E7EB]"><button onClick={() => toggleTask(task.id)}><CheckCircle2 className="h-4 w-4 text-emerald-500" /></button>{task.text}</div>)}</div></div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={AlarmClock} title="Recurring + reminders" description="MVP placeholders for schedule rules and notification reminders." />
            <div className="space-y-3">
              {["Every Monday: plan launch sprint", "Daily 09:00: focus top 3 tasks", "Friday: send client progress report"].map((item) => <div key={item} className="flex items-center justify-between rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]"><span className="text-sm font-bold text-[#111827]">{item}</span><Pill tone="blue">Demo</Pill></div>)}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <SurfaceCard>
            <SectionTitle icon={FileText} title="Knowledge Hub" description="Docs/wiki pages with linked task counts." />
            <div className="grid gap-3 md:grid-cols-3">
              {DOC_PAGES.map((doc) => <motion.button key={doc.id} whileHover={{ y: -3 }} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-left"><StickyNote className="h-5 w-5 text-indigo-600" /><h3 className="mt-3 font-black text-[#111827]">{doc.title}</h3><p className="mt-2 line-clamp-3 text-sm text-[#6B7280]">{doc.excerpt}</p><div className="mt-3 flex justify-between text-xs font-bold text-[#6B7280]"><span>{doc.updated}</span><span>{doc.linkedTasks} tasks</span></div></motion.button>)}
            </div>
          </SurfaceCard>
          <SurfaceCard>
            <SectionTitle icon={FormInput} title="Intake Forms + Focus Time" description="Forms, clips and timesheets prepared for backend integration." />
            <div className="space-y-3">
              {FORM_FIELDS.map((field) => <div key={field.id} className="flex items-center justify-between rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]"><span className="text-sm font-bold text-[#111827]">{field.label}</span><Pill tone={field.required ? "indigo" : "slate"}>{field.type}</Pill></div>)}
              {TIME_ENTRIES.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-[#E5E7EB]"><span className="text-sm font-bold text-[#111827]"><Timer className="mr-2 inline h-4 w-4 text-indigo-600" />{entry.owner}</span><span className="text-xs font-bold text-[#6B7280]">{entry.duration}</span></div>)}
            </div>
          </SurfaceCard>
        </div>

        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onCreateTask={() => showNotice("Linked task created locally")} />
      </PageShell>
      <AnimatePresence><Toast message={notice} /></AnimatePresence>
    </AppLayout>
  );
}
