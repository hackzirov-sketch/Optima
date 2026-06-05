import type { ApiTask } from '@/lib/api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday 00:00 of the week containing `reference`. */
export function getWeekRange(reference = new Date()) {
  const dayIndex = (reference.getDay() + 6) % 7;
  const start = startOfDay(reference);
  start.setDate(start.getDate() - dayIndex);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** Task created/completed counts per weekday — current calendar week only. */
export function buildWeeklyActivity(tasks: ApiTask[]) {
  const { start, end } = getWeekRange();
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const doneCounts = [0, 0, 0, 0, 0, 0, 0];

  tasks.forEach((task) => {
    if (!task.createdAt) return;
    const created = new Date(task.createdAt);
    if (created < start || created >= end) return;

    const day = (created.getDay() + 6) % 7;
    counts[day]++;
    if (task.status === 'done') doneCounts[day]++;
  });

  return DAYS.map((day, i) => ({ day, created: counts[i], done: doneCounts[i] }));
}

/** Completion rate for each of the last 5 rolling weeks. */
export function buildProductivityData(tasks: ApiTask[]) {
  const now = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 7);

    const weekTasks = tasks.filter((t) => {
      if (!t.createdAt) return false;
      const d = new Date(t.createdAt);
      return d >= weekStart && d < weekEnd;
    });
    const done = weekTasks.filter((t) => t.status === 'done').length;
    const score =
      weekTasks.length === 0 ? 0 : Math.round((done / weekTasks.length) * 100);
    return { week: `W${5 - i}`, score };
  }).reverse();
}

export function isTaskRelevantToday(task: ApiTask, today = startOfDay()): boolean {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (task.dueDate) {
    const due = new Date(task.dueDate);
    if (due >= today && due < tomorrow) return true;
  }
  if (task.createdAt) {
    const created = new Date(task.createdAt);
    if (created >= today && created < tomorrow) return true;
  }
  return false;
}

/** Focus % for today’s pool; returns null when there is nothing to measure. */
export function computeFocusScore(
  tasks: ApiTask[],
  getStatus: (taskId: string, status: string) => string,
): number | null {
  const today = startOfDay();
  const todayPool = tasks.filter((t) => isTaskRelevantToday(t, today));
  const pool =
    todayPool.length > 0
      ? todayPool
      : tasks.filter((t) => getStatus(t.id, t.status) !== 'done');

  if (pool.length === 0) return null;

  const done = pool.filter((t) => getStatus(t.id, t.status) === 'done').length;
  return Math.round((done / pool.length) * 100);
}

export function sortPendingTasks(tasks: ApiTask[], limit = 5): ApiTask[] {
  return [...tasks]
    .filter((task) => task.status !== 'done')
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 2;
      const pb = PRIORITY_RANK[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;

      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit);
}
