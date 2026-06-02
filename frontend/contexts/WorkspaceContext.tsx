'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { workspacesApi, type ApiWorkspace } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface WorkspaceState {
  workspaces: ApiWorkspace[];
  activeWorkspace: ApiWorkspace | null;
  loading: boolean;
  error: string | null;
  setActiveWorkspace: (ws: ApiWorkspace) => void;
  createWorkspace: (name: string, description?: string) => Promise<ApiWorkspace>;
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
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const res = await workspacesApi.create({ name, slug, description });
    const ws = res.data;
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspace(ws);
    return ws;
  }, [setActiveWorkspace]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading,
      error,
      setActiveWorkspace,
      createWorkspace,
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
