'use client';

import { useState, useEffect, useCallback } from 'react';
import { projectsApi, type ApiProject, type ApiColumn } from '@/lib/api';
import { IS_DEMO, DEMO_PROJECTS } from '@/lib/demoData';

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
    if (IS_DEMO) {
      setProjects(DEMO_PROJECTS.filter((p) => p.workspaceId === workspaceId));
      return;
    }
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
    if (IS_DEMO) {
      const project: ApiProject = {
        id: `demo-project-${Date.now()}`,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36),
        description,
        workspaceId,
        status: 'active',
        priority: 'medium',
        ownerId: 'demo-user-001',
        createdAt: new Date().toISOString(),
      };
      setProjects((prev) => [...prev, project]);
      return project;
    }
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
    const res = await projectsApi.create({ workspaceId, name, slug, description });
    setProjects((prev) => [...prev, res.data]);
    return res.data;
  }, [workspaceId]);

  const deleteProject = useCallback(async (id: string) => {
    if (IS_DEMO) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return;
    }
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
