'use client';

import { useState, useEffect, useCallback } from 'react';
import { tasksApi, type ApiTask, type CreateTaskDto } from '@/lib/api';
import { IS_DEMO, DEMO_TASKS } from '@/lib/demoData';

export function useTasks(projectId: string | undefined) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    if (IS_DEMO) {
      setTasks(DEMO_TASKS.filter((t) => t.projectId === projectId));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await tasksApi.listByProject(projectId);
      setTasks(res?.data ?? []);
    } catch (err) {
      console.error('[useTasks] load failed', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const createTask = useCallback(async (dto: CreateTaskDto) => {
    if (IS_DEMO) {
      const task: ApiTask = {
        id: `demo-task-${Date.now()}`,
        title: dto.title,
        description: dto.description,
        status: dto.status ?? 'todo',
        priority: dto.priority ?? 'medium',
        projectId: dto.projectId,
        workspaceId: dto.workspaceId,
        assigneeId: dto.assigneeId,
        columnId: dto.columnId,
        estimatedHours: dto.estimatedHours,
        dueDate: dto.dueDate,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [task, ...prev]);
      return task;
    }
    const res = await tasksApi.create(dto);
    setTasks((prev) => [res.data, ...prev]);
    return res.data;
  }, []);

  const updateTask = useCallback(async (taskId: string, data: Partial<CreateTaskDto>) => {
    if (IS_DEMO) {
      let updated!: ApiTask;
      setTasks((prev) => prev.map((t) => {
        if (t.id !== taskId) return t;
        updated = { ...t, ...data };
        return updated;
      }));
      return updated;
    }
    const res = await tasksApi.update(taskId, data);
    setTasks((prev) => prev.map((t) => t.id === taskId ? res.data : t));
    return res.data;
  }, []);

  const moveTask = useCallback(async (taskId: string, data: { columnId?: string; status?: string }) => {
    if (IS_DEMO) {
      let updated!: ApiTask;
      setTasks((prev) => prev.map((t) => {
        if (t.id !== taskId) return t;
        updated = { ...t, ...data };
        return updated;
      }));
      return updated;
    }
    const res = await tasksApi.move(taskId, data);
    setTasks((prev) => prev.map((t) => t.id === taskId ? res.data : t));
    return res.data;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    if (IS_DEMO) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      return;
    }
    await tasksApi.delete(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  return { tasks, loading, error, refresh: load, createTask, updateTask, moveTask, deleteTask };
}

/**
 * Load tasks for a workspace in one request when `workspaceId` is set.
 * Falls back to per-project requests only when workspace id is missing.
 */
export function useAllWorkspaceTasks(
  workspaceId: string | undefined,
  projectIds: string[] = [],
) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);

  const projectKey = projectIds.join(',');

  const load = useCallback(async () => {
    if (workspaceId) {
      if (IS_DEMO) {
        setTasks(DEMO_TASKS.filter((t) => t.workspaceId === workspaceId));
        return;
      }
      setLoading(true);
      try {
        const res = await tasksApi.listByWorkspace(workspaceId, { limit: 500 });
        setTasks(res?.data ?? []);
      } catch (err) {
        console.error('[useAllWorkspaceTasks] workspace load failed', err);
        setTasks([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!projectIds.length) {
      setTasks([]);
      return;
    }

    setLoading(true);
    try {
      const results = await Promise.all(
        projectIds.map((id) => tasksApi.listByProject(id).then((r) => r?.data ?? [])),
      );
      setTasks(results.flat());
    } catch (err) {
      console.error('[useAllWorkspaceTasks] project fallback failed', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return { tasks, loading, refresh: load };
}
