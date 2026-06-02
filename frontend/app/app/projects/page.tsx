'use client';

import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, FolderOpen, Loader2, Plus, Target, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton, Modal, PageHeader, PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, Toast } from "@/components/app/DesignSystem";
import { AutomationRuleCard, DataTable, FilterBar, TaskDrawer, ViewSwitcher } from "@/components/app/PowerWorkspaceSystem";
import { AUTOMATION_RULES, GOALS, POWER_VIEWS } from "@/data/ecosystemData";
import type { SmartTask, TaskView } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import type { ApiTask, CreateTaskDto } from "@/lib/api";

function apiTaskToSmartTask(t: ApiTask): SmartTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    status: (t.status as SmartTask['status']) ?? 'backlog',
    priority: (t.priority as SmartTask['priority']) ?? 'medium',
    assignee: t.assigneeId ?? 'Unassigned',
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

export default function Page() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { activeWorkspace } = useWorkspace();

  const [view, setView] = useState<TaskView>("board");
  const [query, setQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<SmartTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const { projects, loading: projectsLoading, createProject } = useProjects(activeWorkspace?.id);
  const { tasks, loading: tasksLoading, createTask, moveTask, deleteTask } = useTasks(
    activeProjectId ?? projects[0]?.id,
  );

  const currentProjectId = activeProjectId ?? projects[0]?.id;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2000);
  };

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) =>
      `${task.title} ${task.description ?? ''} ${task.status} ${task.priority}`.toLowerCase().includes(normalized),
    );
  }, [query, tasks]);

  const smartTasks = filteredTasks.map(apiTaskToSmartTask);

  const tableRows = smartTasks.map((task) => ({
    id: task.id,
    cells: [
      <span key="title" className="font-black">{task.title}</span>,
      <Pill key="status" tone="indigo">{task.status.replace("_", " ")}</Pill>,
      <span key="assignee">{task.assignee}</span>,
      <Pill key="priority" tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>,
      <span key="dueDate" className="text-muted-foreground">{task.dueDate}</span>,
    ],
  }));

  const handleCreateProject = async () => {
    if (!projectName.trim() || !activeWorkspace) return;
    setSaving(true);
    try {
      const proj = await createProject(projectName.trim(), projectDesc.trim() || undefined);
      setActiveProjectId(proj.id);
      setCreateProjectOpen(false);
      setProjectName("");
      setProjectDesc("");
      showNotice(`Project "${proj.name}" created`);
    } catch {
      showNotice("Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !currentProjectId || !activeWorkspace) return;
    setSaving(true);
    try {
      const dto: CreateTaskDto = {
        projectId: currentProjectId,
        workspaceId: activeWorkspace.id,
        title: taskTitle.trim(),
        priority: taskPriority,
        status: 'backlog',
      };
      await createTask(dto);
      setCreateTaskOpen(false);
      setTaskTitle("");
      showNotice("Task created");
    } catch {
      showNotice("Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    try {
      await moveTask(taskId, { status: newStatus });
    } catch {
      showNotice("Failed to move task");
    }
  };

  if (!activeWorkspace) {
    return (
      <PageShell>
        <SurfaceCard>
          <div className="py-12 text-center text-muted-foreground">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="font-semibold">No workspace selected</p>
            <p className="mt-1 text-sm">Create or select a workspace to view projects.</p>
          </div>
        </SurfaceCard>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={activeWorkspace.name}
          title="Project command center"
          description="Kanban, table, timeline, calendar, goals and task detail drawers in one workspace."
        >
          <ActionButton onClick={() => setCreateProjectOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setCreateTaskOpen(true)} disabled={!currentProjectId}>
            <Plus className="h-4 w-4" /> Add task
          </ActionButton>
        </PageHeader>

        {/* Project tabs */}
        {projectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <SurfaceCard>
            <div className="py-10 text-center">
              <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your first project to get started.</p>
              <ActionButton className="mt-4" onClick={() => setCreateProjectOpen(true)}>
                <Plus className="h-4 w-4" /> Create project
              </ActionButton>
            </div>
          </SurfaceCard>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => setActiveProjectId(proj.id)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-all ${
                    (currentProjectId === proj.id)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-border bg-card text-muted-foreground hover:border-indigo-200 hover:text-foreground"
                  }`}
                >
                  {proj.name}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <ViewSwitcher views={POWER_VIEWS} value={view} onChange={setView} />
              <div className="flex flex-wrap gap-2">
                <Pill tone="indigo">{tasks.length} tasks</Pill>
                <Pill tone="green">{tasks.filter((t) => t.status === 'done').length} done</Pill>
                <Pill tone="amber">{tasks.filter((t) => t.status === 'in_progress').length} in progress</Pill>
              </div>
            </div>

            <FilterBar
              query={query}
              onQueryChange={setQuery}
              chips={["Priority", "Status", "Due date"]}
              action={<ActionButton className="py-1.5" onClick={() => setCreateTaskOpen(true)}>+ Task</ActionButton>}
            />

            {tasksLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
              </div>
            )}

            {!tasksLoading && view === "board" && (
              <SurfaceCard>
                <SectionTitle icon={ClipboardList} title="Task board" description="Drag-and-drop style kanban — click column status to move tasks." />
                <div className="grid gap-4 xl:grid-cols-5">
                  {["backlog", "todo", "in_progress", "review", "done"].map((status) => (
                    <div key={status} className="rounded-2xl border border-border bg-muted p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-black capitalize text-foreground">{status.replace("_", " ")}</h3>
                        <Pill tone="slate">{smartTasks.filter((task) => task.status === status).length}</Pill>
                      </div>
                      <div className="space-y-3">
                        {smartTasks.filter((task) => task.status === status).map((task) => (
                          <div key={task.id} className="group w-full rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                            <button type="button" onClick={() => setSelectedTask(task)} className="w-full text-left">
                              <p className="font-black leading-snug text-foreground">{task.title}</p>
                              {task.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p>}
                            </button>
                            <div className="mt-3 flex items-center justify-between">
                              <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>
                              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                {status !== "done" && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveTask(task.id, status === "backlog" ? "todo" : status === "todo" ? "in_progress" : status === "in_progress" ? "review" : "done")}
                                    className="rounded-xl px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50"
                                  >
                                    →
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => deleteTask(task.id).catch(() => showNotice("Failed to delete"))}
                                  className="rounded-xl px-2 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-50"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {!tasksLoading && (view === "list" || view === "table") && (
              <DataTable
                columns={["Task", "Status", "Assignee", "Priority", "Due"]}
                rows={tableRows}
                onRowClick={(id) => {
                  const st = smartTasks.find((task) => task.id === id);
                  if (st) setSelectedTask(st);
                }}
              />
            )}

            {!tasksLoading && (view === "timeline" || view === "calendar") && (
              <SurfaceCard>
                <SectionTitle icon={CalendarDays} title={`${view} view`} description="Tasks ordered by due date." />
                <div className="space-y-3">
                  {smartTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="grid w-full gap-3 rounded-2xl border border-border bg-muted p-4 text-left md:grid-cols-[1fr_1.4fr_0.6fr] md:items-center"
                    >
                      <div>
                        <p className="font-black text-foreground">{task.title}</p>
                        <p className="text-xs text-muted-foreground">{task.status.replace("_", " ")}</p>
                      </div>
                      <ProgressBar value={task.progress} />
                      <Pill tone="indigo">{task.dueDate}</Pill>
                    </button>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {!tasksLoading && view === "dashboard" && (
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <SurfaceCard>
                  <SectionTitle icon={Target} title="Milestones" description="Goal tracking and OKR-style progress." />
                  {GOALS.map((goal) => (
                    <div key={goal.id} className="mb-4 rounded-2xl bg-muted p-4 ring-1 ring-[#E5E7EB]">
                      <div className="flex items-center justify-between">
                        <p className="font-black text-foreground">{goal.title}</p>
                        <Pill tone="blue">{goal.owner}</Pill>
                      </div>
                      <ProgressBar value={goal.progress} label={goal.dueDate} />
                    </div>
                  ))}
                </SurfaceCard>
                <SurfaceCard>
                  <SectionTitle icon={Zap} title="Flow Automations" description="Trigger/action rules." />
                  <div className="space-y-3">
                    {AUTOMATION_RULES.map((rule) => (
                      <AutomationRuleCard key={rule.id} rule={rule} onToggle={() => showNotice(`${rule.name} toggled`)} />
                    ))}
                  </div>
                </SurfaceCard>
              </div>
            )}
          </>
        )}

        {/* Create Project Modal */}
        <Modal open={createProjectOpen} title="Create project" description={`In workspace: ${activeWorkspace.name}`} onClose={() => setCreateProjectOpen(false)}>
          <div className="space-y-3">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300"
              placeholder="Project name"
              autoFocus
            />
            <textarea
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              className="min-h-20 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300"
              placeholder="Description (optional)"
            />
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setCreateProjectOpen(false)}>Cancel</ActionButton>
              <ActionButton onClick={handleCreateProject} disabled={saving || !projectName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create project"}
              </ActionButton>
            </div>
          </div>
        </Modal>

        {/* Create Task Modal */}
        <Modal open={createTaskOpen} title="Add task" description={`To: ${projects.find((p) => p.id === currentProjectId)?.name ?? ''}`} onClose={() => setCreateTaskOpen(false)}>
          <div className="space-y-3">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
              className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300"
              placeholder="Task title"
              autoFocus
            />
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value)}
              className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setCreateTaskOpen(false)}>Cancel</ActionButton>
              <ActionButton onClick={handleCreateTask} disabled={saving || !taskTitle.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add task"}
              </ActionButton>
            </div>
          </div>
        </Modal>

        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onCreateTask={() => showNotice("Linked task created")} />
      </PageShell>
      <Toast message={notice} />
    </>
  );
}
