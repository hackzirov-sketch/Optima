import { useEffect } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, CheckCircle2, Clock3, GitBranch, GripVertical, Search, Sparkles, X } from "lucide-react";
import type { AutomationRule, DashboardWidget, SmartField as SmartFieldType, SmartTask, TaskView, WorkspaceZone } from "@/types";
import { ActionButton, Pill, ProgressBar, cn } from "./DesignSystem";

const viewLabels: Record<TaskView, string> = {
  list: "List",
  board: "Board",
  table: "Table",
  calendar: "Calendar",
  timeline: "Timeline",
  dashboard: "Dashboard",
};

const statusLabel: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

const statusTone: Record<string, "indigo" | "blue" | "green" | "amber" | "red" | "slate"> = {
  backlog: "slate",
  todo: "blue",
  in_progress: "indigo",
  review: "amber",
  blocked: "red",
  done: "green",
};

export function ViewSwitcher({
  views,
  value,
  onChange,
}: {
  views: TaskView[];
  value: TaskView;
  onChange: (view: TaskView) => void;
}) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1 shadow-sm">
      {views.map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChange(view)}
          className={cn(
            "h-9 flex-shrink-0 rounded-xl px-3 text-xs font-black transition-colors",
            value === view ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {viewLabels[view]}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  query,
  onQueryChange,
  chips,
  action,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  chips: string[];
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-muted px-3 ring-1 ring-border focus-within:ring-indigo-400 dark:focus-within:ring-indigo-500">
        <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search tasks, docs, owners, tags..."
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button key={chip} type="button" className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground ring-1 ring-border hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300">
            {chip}
          </button>
        ))}
        {action}
      </div>
    </div>
  );
}

export function SmartField({ field }: { field: SmartFieldType }) {
  return (
    <div className="rounded-2xl bg-muted px-3 py-2 ring-1 ring-border">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{field.label}</p>
      <div className="mt-1">
        <Pill tone={field.tone ?? "slate"}>{field.value}</Pill>
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  onRowClick,
}: {
  columns: string[];
  rows: Array<{ id: string; cells: ReactNode[] }>;
  onRowClick?: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-card">
      <div className="hidden grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-3 bg-muted px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground lg:grid">
        {columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onRowClick?.(row.id)}
            className="grid w-full gap-2 px-4 py-4 text-left transition-colors hover:bg-muted lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.7fr]"
          >
            {row.cells.map((cell, index) => (
              <span key={`${row.id}-${index}`} className="min-w-0 text-sm text-foreground">
                {cell}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WidgetCard({
  widget,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  widget: DashboardWidget;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <motion.div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        if (!onDragOver) return;
        event.preventDefault();
        onDragOver();
      }}
      onDragEnd={onDragEnd}
      whileHover={{ y: -3 }}
      className="rounded-[24px] border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{widget.title}</p>
          <p className="mt-3 text-2xl font-black text-foreground">{widget.value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          {draggable ? <GripVertical className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">{widget.meta}</p>
      <div className="mt-3">
        <Pill tone={widget.tone}>{widget.tone}</Pill>
      </div>
    </motion.div>
  );
}

export function WorkspaceHierarchy({
  zone,
  activeBoard,
  onSelectBoard,
}: {
  zone: WorkspaceZone;
  activeBoard: string;
  onSelectBoard: (board: string) => void;
}) {
  return (
    <aside className="rounded-[24px] border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Zone</p>
          <h3 className="mt-1 font-black text-foreground">{zone.name}</h3>
        </div>
        <Pill tone="green">{zone.health}%</Pill>
      </div>
      <div className="space-y-4">
        {zone.spaces.map((space) => (
          <div key={space.id}>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" />
              {space.name}
            </div>
            <div className="space-y-2">
              {space.collections.map((collection) => (
                <div key={collection.id} className="rounded-2xl bg-muted p-2 ring-1 ring-border">
                  <p className="px-2 text-xs font-bold text-foreground">{collection.name}</p>
                  <div className="mt-2 space-y-1">
                    {collection.boards.map((board) => (
                      <button
                        key={board}
                        type="button"
                        onClick={() => onSelectBoard(board)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs font-semibold transition-colors",
                          activeBoard === board ? "bg-card text-indigo-700 shadow-sm ring-1 ring-indigo-100 dark:text-indigo-300 dark:ring-indigo-500/30" : "text-muted-foreground hover:bg-card hover:text-foreground",
                        )}
                      >
                        {board}
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function ActivityTimeline({ items }: { items: string[] }) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex gap-3">
          <span className="mt-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-black text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25">{index + 1}</span>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm">
            {item}
            <p className="mt-1 text-xs font-medium text-muted-foreground">Recorded in local activity stream</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AutomationRuleCard({ rule, onToggle }: { rule: AutomationRule; onToggle?: () => void }) {
  return (
    <div className="rounded-[24px] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-foreground">{rule.name}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            When <span className="font-bold text-foreground">{rule.trigger}</span>, then <span className="font-bold text-foreground">{rule.action}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn("relative h-7 w-12 rounded-full transition-colors", rule.enabled ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700")}
          aria-label={`Toggle ${rule.name}`}
        >
          <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-card transition-all", rule.enabled ? "left-6" : "left-1")} />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs font-bold text-muted-foreground">
        <span>{rule.runs} demo runs</span>
        <Pill tone={rule.enabled ? "green" : "slate"}>{rule.enabled ? "Enabled" : "Paused"}</Pill>
      </div>
    </div>
  );
}

export function CommandMenu({
  commands,
  onRun,
}: {
  commands: Array<{ id: string; title: string; description: string }>;
  onRun?: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {commands.map((command) => (
        <button
          key={command.id}
          type="button"
          onClick={() => onRun?.(command.id)}
          className="rounded-[24px] border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Bot className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-sm font-black text-foreground">{command.title}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{command.description}</p>
        </button>
      ))}
    </div>
  );
}

export function TaskDrawer({
  task,
  onClose,
  onCreateTask,
}: {
  task: SmartTask | null;
  onClose: () => void;
  onCreateTask?: () => void;
}) {
  useEffect(() => {
    if (!task) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, task]);

  return (
    <AnimatePresence>
      {task && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/30 backdrop-blur-sm">
          <motion.aside
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl"
          >
            <div className="border-b border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={statusTone[task.status]}>{statusLabel[task.status]}</Pill>
                    <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-foreground">{task.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.description}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-2xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close task drawer">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {task.fields.map((field) => (
                  <SmartField key={field.id} field={field} />
                ))}
              </div>
              <div className="rounded-[24px] border border-border bg-muted p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-black text-foreground">Nested Actions</h3>
                  <Pill tone="blue">{task.subtasks.filter((item) => item.done).length}/{task.subtasks.length}</Pill>
                </div>
                <div className="space-y-2">
                  {task.subtasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm font-semibold text-foreground ring-1 ring-border">
                      {subtask.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                      {subtask.text}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-black text-foreground">Comments</h3>
                <div className="space-y-3">
                  {task.comments.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                        <span>{comment.author}</span>
                        <span>{comment.time}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{comment.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-black text-foreground">Activity</h3>
                <ActivityTimeline items={task.activity} />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
              <ActionButton variant="secondary" onClick={onClose}>Close</ActionButton>
              <ActionButton onClick={onCreateTask}>Create linked task</ActionButton>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
