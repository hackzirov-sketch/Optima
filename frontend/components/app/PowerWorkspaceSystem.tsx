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
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-sm">
      {views.map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChange(view)}
          className={cn(
            "h-9 flex-shrink-0 rounded-xl px-3 text-xs font-black transition-colors",
            value === view ? "bg-indigo-600 text-white shadow-sm" : "text-[#6B7280] hover:bg-[#F7FAFC] hover:text-[#111827]",
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
    <div className="flex flex-col gap-3 rounded-[24px] border border-[#E5E7EB] bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-[#F7FAFC] px-3 ring-1 ring-[#E5E7EB] focus-within:ring-indigo-200">
        <Search className="h-4 w-4 flex-shrink-0 text-[#6B7280]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search tasks, docs, owners, tags..."
          className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#6B7280]"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button key={chip} type="button" className="rounded-full bg-[#F7FAFC] px-3 py-1.5 text-xs font-bold text-[#6B7280] ring-1 ring-[#E5E7EB] hover:bg-indigo-50 hover:text-indigo-700">
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
    <div className="rounded-2xl bg-[#F7FAFC] px-3 py-2 ring-1 ring-[#E5E7EB]">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6B7280]">{field.label}</p>
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
    <div className="overflow-hidden rounded-[24px] border border-[#E5E7EB] bg-white">
      <div className="hidden grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-3 bg-[#F7FAFC] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#6B7280] lg:grid">
        {columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <div className="divide-y divide-[#E5E7EB]">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onRowClick?.(row.id)}
            className="grid w-full gap-2 px-4 py-4 text-left transition-colors hover:bg-[#F7FAFC] lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.7fr]"
          >
            {row.cells.map((cell, index) => (
              <span key={`${row.id}-${index}`} className="min-w-0 text-sm text-[#111827]">
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
      className="rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6B7280]">{widget.title}</p>
          <p className="mt-3 text-2xl font-black text-[#111827]">{widget.value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          {draggable ? <GripVertical className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[#6B7280]">{widget.meta}</p>
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
    <aside className="rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Zone</p>
          <h3 className="mt-1 font-black text-[#111827]">{zone.name}</h3>
        </div>
        <Pill tone="green">{zone.health}%</Pill>
      </div>
      <div className="space-y-4">
        {zone.spaces.map((space) => (
          <div key={space.id}>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#6B7280]">
              <GitBranch className="h-3.5 w-3.5" />
              {space.name}
            </div>
            <div className="space-y-2">
              {space.collections.map((collection) => (
                <div key={collection.id} className="rounded-2xl bg-[#F7FAFC] p-2 ring-1 ring-[#E5E7EB]">
                  <p className="px-2 text-xs font-bold text-[#111827]">{collection.name}</p>
                  <div className="mt-2 space-y-1">
                    {collection.boards.map((board) => (
                      <button
                        key={board}
                        type="button"
                        onClick={() => onSelectBoard(board)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs font-semibold transition-colors",
                          activeBoard === board ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100" : "text-[#6B7280] hover:bg-white hover:text-[#111827]",
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
          <span className="mt-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-black text-indigo-600 ring-1 ring-indigo-100">{index + 1}</span>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-semibold text-[#111827] shadow-sm">
            {item}
            <p className="mt-1 text-xs font-medium text-[#6B7280]">Recorded in local activity stream</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AutomationRuleCard({ rule, onToggle }: { rule: AutomationRule; onToggle?: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-[#111827]">{rule.name}</h3>
          <p className="mt-2 text-sm leading-6 text-[#6B7280]">
            When <span className="font-bold text-[#111827]">{rule.trigger}</span>, then <span className="font-bold text-[#111827]">{rule.action}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn("relative h-7 w-12 rounded-full transition-colors", rule.enabled ? "bg-indigo-600" : "bg-slate-200")}
          aria-label={`Toggle ${rule.name}`}
        >
          <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", rule.enabled ? "left-6" : "left-1")} />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs font-bold text-[#6B7280]">
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
          className="rounded-[24px] border border-[#E5E7EB] bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Bot className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-sm font-black text-[#111827]">{command.title}</h3>
          <p className="mt-2 text-xs leading-5 text-[#6B7280]">{command.description}</p>
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
        <div className="fixed inset-0 z-[80] flex justify-end bg-[#111827]/20 backdrop-blur-sm">
          <motion.aside
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="flex h-full w-full max-w-xl flex-col border-l border-[#E5E7EB] bg-white shadow-2xl"
          >
            <div className="border-b border-[#E5E7EB] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={statusTone[task.status]}>{statusLabel[task.status]}</Pill>
                    <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-[#111827]">{task.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">{task.description}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-2xl p-2 text-[#6B7280] hover:bg-[#F7FAFC] hover:text-[#111827]" aria-label="Close task drawer">
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
              <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-black text-[#111827]">Nested Actions</h3>
                  <Pill tone="blue">{task.subtasks.filter((item) => item.done).length}/{task.subtasks.length}</Pill>
                </div>
                <div className="space-y-2">
                  {task.subtasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[#111827] ring-1 ring-[#E5E7EB]">
                      {subtask.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock3 className="h-4 w-4 text-[#6B7280]" />}
                      {subtask.text}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-black text-[#111827]">Comments</h3>
                <div className="space-y-3">
                  {task.comments.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold text-[#6B7280]">
                        <span>{comment.author}</span>
                        <span>{comment.time}</span>
                      </div>
                      <p className="mt-2 text-sm text-[#111827]">{comment.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-black text-[#111827]">Activity</h3>
                <ActivityTimeline items={task.activity} />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E5E7EB] p-4">
              <ActionButton variant="secondary" onClick={onClose}>Close</ActionButton>
              <ActionButton onClick={onCreateTask}>Create linked task</ActionButton>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
