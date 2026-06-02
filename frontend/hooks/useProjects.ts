'use client';

import { useState, useEffect, useCallback } from 'react';
import { projectsApi, type ApiProject, type ApiColumn } from '@/lib/api';

type ApiErrorLike = {
  status?: number;
  message?: string;
};

export function useProjects(workspaceId: string | undefined) {
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await projectsApi.listByWorkspace(workspaceId);
      setProjects(res?.data ?? []);
    } catch (err: unknown) {
      const apiErr = err as ApiErrorLike;

      if (apiErr?.status === 403) {
        // Permission denied for this workspace; keep UI stable without noisy crash-like logs.
        setProjects([]);
        setError('You do not have access to this workspace projects');
        return;
      }

      console.error('[useProjects] load failed', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const createProject = useCallback(async (name: string, description?: string) => {
    if (!workspaceId) throw new Error('No active workspace');
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
    const res = await projectsApi.create({ workspaceId, name, slug, description });
    setProjects((prev) => [...prev, res.data]);
    return res.data;
  }, [workspaceId]);

  const deleteProject = useCallback(async (id: string) => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, error, refresh: load, createProject, deleteProject };
}

export function useProjectColumns(projectId: string | undefined) {
  const [columns, setColumns] = useState<ApiColumn[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    projectsApi.getById(projectId)
      .then((res) => {
        // columns may be embedded in project response
        const proj = res?.data as ApiProject & { columns?: ApiColumn[] };
        setColumns(proj?.columns ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  return { columns, loading };
}
