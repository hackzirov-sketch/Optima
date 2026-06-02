'use client';

import { useState, useEffect, useCallback } from 'react';
import { tasksApi, type ApiTask, type CreateTaskDto } from '@/lib/api';

export function useTasks(projectId: string | undefined) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
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
    const res = await tasksApi.create(dto);
    setTasks((prev) => [res.data, ...prev]);
    return res.data;
  }, []);

  const updateTask = useCallback(async (taskId: string, data: Partial<CreateTaskDto>) => {
    const res = await tasksApi.update(taskId, data);
    setTasks((prev) => prev.map((t) => t.id === taskId ? res.data : t));
    return res.data;
  }, []);

  const moveTask = useCallback(async (taskId: string, data: { columnId?: string; status?: string }) => {
    const res = await tasksApi.move(taskId, data);
    setTasks((prev) => prev.map((t) => t.id === taskId ? res.data : t));
    return res.data;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await tasksApi.delete(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  return { tasks, loading, error, refresh: load, createTask, updateTask, moveTask, deleteTask };
}

export function useAllWorkspaceTasks(projectIds: string[]) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectIds.length) { setTasks([]); return; }
    setLoading(true);
    Promise.all(projectIds.map((id) => tasksApi.listByProject(id).then((r) => r?.data ?? [])))
      .then((results) => setTasks(results.flat()))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { tasks, loading };
}
