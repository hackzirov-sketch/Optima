import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthResult, User, Workspace } from "../types";
import { api, ApiError } from "./api";
import { session } from "./session";

interface AuthContextValue {
  ready: boolean;
  user: User | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  login: (email: string, password: string) => Promise<void>;
  completeAuth: (result: AuthResult) => Promise<void>;
  completeOAuth: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User>;
  refreshWorkspaces: () => Promise<Workspace[]>;
  selectWorkspace: (workspace: Workspace) => void;
  createWorkspace: (data: { name: string; slug: string; description?: string }) => Promise<Workspace>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(() => session.user());
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const applyWorkspaces = useCallback((items: Workspace[]) => {
    setWorkspaces(items);
    const selected = session.selectedWorkspace();
    const next = items.find((item) => item.id === selected) || items[0] || null;
    setWorkspace(next);
    if (next) session.selectWorkspace(next.id);
    return items;
  }, []);

  const refreshWorkspaces = useCallback(async () => applyWorkspaces(await api.workspaces.list()), [applyWorkspaces]);

  const refreshUser = useCallback(async () => {
    const next = await api.users.me();
    setUser(next);
    session.saveUser(next);
    return next;
  }, []);

  const bootstrap = useCallback(async () => {
    if (!session.accessToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      await Promise.all([refreshUser(), refreshWorkspaces()]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        session.clear();
        setUser(null);
        setWorkspaces([]);
        setWorkspace(null);
      }
    } finally {
      setReady(true);
    }
  }, [refreshUser, refreshWorkspaces]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const syncSession = () => {
      if (session.accessToken()) return;
      setUser(null);
      setWorkspaces([]);
      setWorkspace(null);
      setReady(true);
    };
    window.addEventListener("optima:session", syncSession);
    return () => window.removeEventListener("optima:session", syncSession);
  }, []);

  const completeAuth = useCallback(async (result: AuthResult) => {
    session.save(result);
    setUser(result.user);
    setReady(true);
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const completeOAuth = useCallback(async (code: string) => {
    const tokens = await api.auth.exchangeOAuthCode(code);
    session.saveTokens(tokens.accessToken, tokens.refreshToken);
    try {
      await Promise.all([refreshUser(), refreshWorkspaces()]);
      setReady(true);
    } catch (error) {
      session.clear();
      setUser(null);
      throw error;
    }
  }, [refreshUser, refreshWorkspaces]);

  const login = useCallback(async (email: string, password: string) => {
    await completeAuth(await api.auth.login(email, password));
  }, [completeAuth]);

  const logout = useCallback(async () => {
    const refreshToken = session.refreshToken();
    try {
      if (refreshToken) await api.auth.logout(refreshToken);
    } finally {
      session.clear();
      setUser(null);
      setWorkspaces([]);
      setWorkspace(null);
    }
  }, []);

  const selectWorkspace = useCallback((item: Workspace) => {
    session.selectWorkspace(item.id);
    setWorkspace(item);
  }, []);

  const createWorkspace = useCallback(async (data: { name: string; slug: string; description?: string }) => {
    const created = await api.workspaces.create(data);
    const items = await refreshWorkspaces();
    const next = items.find((item) => item.id === created.id) || created;
    selectWorkspace(next);
    return next;
  }, [refreshWorkspaces, selectWorkspace]);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    user,
    workspaces,
    workspace,
    login,
    completeAuth,
    completeOAuth,
    logout,
    refreshUser,
    refreshWorkspaces,
    selectWorkspace,
    createWorkspace,
  }), [ready, user, workspaces, workspace, login, completeAuth, completeOAuth, logout, refreshUser, refreshWorkspaces, selectWorkspace, createWorkspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
