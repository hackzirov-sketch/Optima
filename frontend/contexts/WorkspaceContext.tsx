'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { workspacesApi, type ApiWorkspace } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { IS_DEMO, DEMO_WORKSPACE } from '@/lib/demoData';

interface WorkspaceState {
  workspaces: ApiWorkspace[];
  activeWorkspace: ApiWorkspace | null;
  loading: boolean;
  error: string | null;
  setActiveWorkspace: (ws: ApiWorkspace) => void;
  createWorkspace: (name: string, description?: string) => Promise<ApiWorkspace>;
  updateWorkspace: (wsId: string, data: { name?: string; description?: string }) => Promise<ApiWorkspace>;
  deleteWorkspace: (wsId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

const ACTIVE_WS_KEY = 'upz_active_workspace_id';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasBackendSession } = useAuth();
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<ApiWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    if (IS_DEMO) {
      setWorkspaces([DEMO_WORKSPACE]);
      setActiveWorkspaceState(DEMO_WORKSPACE);
      setLoading(false);
      return;
    }
    if (!hasBackendSession) return;
    setLoading(true);
    setError(null);
    try {
      const res = await workspacesApi.list();
      const list = res?.data ?? [];
      setWorkspaces(list);

      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem(ACTIVE_WS_KEY)
        : null;

      const found = savedId ? list.find((ws) => ws.id === savedId) : null;
      setActiveWorkspaceState(found ?? list[0] ?? null);
    } catch (err) {
      console.error('[WorkspaceContext] load failed', err);
      setError('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, [hasBackendSession]);

  useEffect(() => {
    if (IS_DEMO) {
      loadWorkspaces();
      return;
    }
    if (isAuthenticated && hasBackendSession) {
      loadWorkspaces();
    } else {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
    }
  }, [isAuthenticated, hasBackendSession, loadWorkspaces]);

  const setActiveWorkspace = useCallback((ws: ApiWorkspace) => {
    setActiveWorkspaceState(ws);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_WS_KEY, ws.id);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    if (IS_DEMO) {
      const ws: ApiWorkspace = {
        id: `demo-ws-${Date.now()}`,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36),
        description,
        ownerId: 'demo-user-001',
        visibility: 'private',
        createdAt: new Date().toISOString(),
      };
      setWorkspaces((prev) => [...prev, ws]);
      setActiveWorkspace(ws);
      return ws;
    }
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
    const res = await workspacesApi.create({ name, slug, description });
    const ws = res.data;
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspace(ws);
    return ws;
  }, [setActiveWorkspace]);

  const updateWorkspace = useCallback(async (wsId: string, data: { name?: string; description?: string }) => {
    if (IS_DEMO) {
      let updated!: ApiWorkspace;
      setWorkspaces((prev) => prev.map((w) => {
        if (w.id !== wsId) return w;
        updated = { ...w, ...data };
        return updated;
      }));
      if (activeWorkspace?.id === wsId) setActiveWorkspaceState(updated);
      return updated;
    }
    const res = await workspacesApi.update(wsId, data);
    const updated = res.data;
    setWorkspaces((prev) => prev.map((w) => w.id === wsId ? updated : w));
    if (activeWorkspace?.id === wsId) setActiveWorkspaceState(updated);
    return updated;
  }, [activeWorkspace?.id]);

  const deleteWorkspace = useCallback(async (wsId: string) => {
    if (IS_DEMO) {
      setWorkspaces((prev) => {
        const remaining = prev.filter((w) => w.id !== wsId);
        if (activeWorkspace?.id === wsId) setActiveWorkspaceState(remaining[0] ?? null);
        return remaining;
      });
      return;
    }
    await workspacesApi.delete(wsId);
    setWorkspaces((prev) => {
      const remaining = prev.filter((w) => w.id !== wsId);
      if (activeWorkspace?.id === wsId) setActiveWorkspaceState(remaining[0] ?? null);
      return remaining;
    });
  }, [activeWorkspace?.id]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading,
      error,
      setActiveWorkspace,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      refreshWorkspaces: loadWorkspaces,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
