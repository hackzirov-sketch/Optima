'use client';

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast } from "@/components/app/DesignSystem";
import { DataTable, FilterBar, TaskDrawer } from "@/components/app/PowerWorkspaceSystem";
import type { Priority, SmartTask } from "@/types";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useMembers } from "@/hooks/useMembers";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { tasksApi, type ApiMember, type ApiTask, type CreateTaskDto } from "@/lib/api";

function buildMemberMap(members: ApiMember[]): Map<string, string> {
  const m = new Map<string, string>();
  members.forEach((member) => {
    const name = `${member.user?.firstName ?? ''} ${member.user?.lastName ?? ''}`.trim() || member.user?.email || 'Unknown';
    m.set(member.userId, name);
  });
  return m;
}

function apiTaskToSmart(t: ApiTask, memberMap: Map<string, string>): SmartTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    status: (t.status as SmartTask['status']) ?? 'backlog',
    priority: (t.priority as SmartTask['priority']) ?? 'medium',
    assignee: memberMap.get(t.assigneeId ?? '') ?? 'Unassigned',
    dueDate: t.dueDate ?? '—',
    project: t.projectId,
    tags: [],
    progress: t.status === 'done' ? 100 : t.status === 'in_progress' ? 50 : 0,
    estimate: t.estimatedHours ? `${t.estimatedHours}h` : '—',
    timeTracked: '0h',
    fields: [],
    subtasks: [],
    comments: [],
    activity: [],
  };
}

export default function TasksPage() {
  const { activeWorkspace } = useWorkspace();

  const { projects } = useProjects(activeWorkspace?.id);
  const { members } = useMembers(activeWorkspace?.id);
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { tasks: apiTasks, loading: tasksLoading, refresh: refreshTasks } = useAllWorkspaceTasks(projectIds);

  const [newTask, setNewTask] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<SmartTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2000);
  };

  const memberMap = useMemo(() => buildMemberMap(members), [members]);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const smart = apiTasks.map((t) => apiTaskToSmart(t, memberMap));
    if (!normalized) return smart;
    return smart.filter((task) =>
      `${task.title} ${task.status} ${task.priority} ${task.assignee}`.toLowerCase().includes(normalized),
    );
  }, [apiTasks, query, memberMap]);

  const rows = filteredTasks.map((task) => ({
    id: task.id,
    cells: [
      <span key="title" className="font-black">{task.title}</span>,
      <Pill key="status" tone="indigo">{task.status.replace("_", " ")}</Pill>,
      <span key="assignee">{task.assignee}</span>,
      <Pill key="priority" tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span key="dueDate" className="text-muted-foreground">{task.dueDate}</span>,
    ],
  }));

  const pending = filteredTasks.filter((task) => task.status !== "done");
  const done = filteredTasks.filter((task) => task.status === "done");

  const addTask = async () => {
    if (!newTask.trim() || !activeWorkspace) return;
    const projId = newProjectId || projects[0]?.id;
    if (!projId) { showNotice("Create a project first"); return; }
    setSaving(true);
    try {
      const dto: CreateTaskDto = {
        projectId: projId,
        workspaceId: activeWorkspace.id,
        title: newTask.trim(),
        priority: newPriority,
        status: 'backlog',
      };
      await tasksApi.create(dto);
      setNewTask("");
      showNotice("Task created");
      await refreshTasks();
    } catch {
      showNotice("Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'done' ? 'backlog' : 'done';
      await tasksApi.move(id, { status: newStatus });
      showNotice(newStatus === 'done' ? "Marked done" : "Reopened");
      await refreshTasks();
    } catch {
      showNotice("Failed to update task");
    }
  };

  const deleteTaskById = async (id: string) => {
    try {
      await tasksApi.delete(id);
      showNotice("Task deleted");
      await refreshTasks();
    } catch {
      showNotice("Failed to delete task");
    }
  };

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "Workspace"}
          title="Tasks"
          description="All tasks across your projects in this workspace."
        >
          <ActionButton onClick={addTask} disabled={!newTask.trim() || saving}>
            <Plus className="h-4 w-4" /> Quick add
          </ActionButton>
        </PageHeader>

        <FilterBar
          query={query}
          onQueryChange={setQuery}
          chips={["Status", "Priority", "Project"]}
          action={null}
        />

        {tasksLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
          </div>
        ) : (
          <SurfaceCard>
            <SectionTitle icon={CheckCircle2} title="All tasks" description={`${apiTasks.length} tasks across ${projects.length} projects`} />
            <DataTable
              columns={["Task", "Status", "Assignee", "Priority", "Due"]}
              rows={rows}
              onRowClick={(id) => {
                const st = filteredTasks.find((task) => task.id === id);
                if (st) setSelectedTask(st);
              }}
            />
          </SurfaceCard>
        )}

        <SurfaceCard>
          <SectionTitle icon={Plus} title="Quick add task" description="Add a task to any project in this workspace." />
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted p-3 sm:flex-row sm:items-center">
            <input
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addTask()}
              placeholder="Task title…"
              className="min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {projects.length > 1 && (
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground outline-none"
              >
                <option value="">First project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select
              value={newPriority}
              onChange={(event) => setNewPriority(event.target.value as Priority)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <ActionButton onClick={addTask} className="py-2" disabled={saving || !newTask.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </ActionButton>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl bg-muted p-3 ring-1 ring-border">
              <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                Pending {pending.length}
              </h3>
              <div className="space-y-2">
                <AnimatePresence>
                  {pending.slice(0, 10).map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border"
                    >
                      <button type="button" onClick={() => toggleTask(task.id, task.status)}>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{task.title}</span>
                      <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>
                      <button type="button" onClick={() => deleteTaskById(task.id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
            <div className="rounded-2xl bg-muted p-3 ring-1 ring-border">
              <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                Completed {done.length}
              </h3>
              <div className="space-y-2">
                {done.slice(0, 10).map((task) => (
                  <div key={task.id} className="flex items-center gap-2 rounded-xl bg-card p-2 text-sm text-muted-foreground line-through ring-1 ring-border">
                    <button type="button" onClick={() => toggleTask(task.id, task.status)}>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </button>
                    {task.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onCreateTask={() => showNotice("Subtask created")} />
      </PageShell>
      <Toast message={notice} />
    </>
  );
}
