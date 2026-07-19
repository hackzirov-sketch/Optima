import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthResult, User, Workspace } from "../types";
import { api, ApiError, refreshSession } from "./api";
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
    // A single failed refresh isn't necessarily a dead token — the backend
    // intentionally tolerates brief concurrent-refresh races (e.g. two
    // triggers landing close together) by rejecting the losing call with a
    // benign, recoverable 401 rather than treating it as theft. Only give up
    // after consecutive failures, so that race doesn't read as a hard logout
    // — but a token that's actually dead still won't be retried forever,
    // since real failures do accumulate here.
    let consecutiveFailures = 0;
    // The access token is valid for ~20 minutes server-side — there's no
    // reason to hit /auth/refresh more often than roughly every 15 minutes.
    // Without this floor, every tab focus (alt-tab, switching windows) fires
    // an extra refresh call regardless of how recently one already
    // succeeded, which needlessly hammers the server at scale (thousands of
    // idle-but-focused tabs all refreshing on every glance back at the
    // browser) and raises the odds of tripping the concurrent-refresh race
    // above. Only the periodic timer and tab-focus events call refresh(), so
    // gating both on this floor is enough — it doesn't touch apiFetch's
    // reactive 401 retry, which always needs to run immediately regardless
    // of timing.
    const MIN_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
    let lastRefreshAt = 0;
    const refresh = (force = false) => {
      if (!session.refreshToken()) return;
      if (!force && Date.now() - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
      lastRefreshAt = Date.now();
      void refreshSession().then((result) => {
        if (result.ok) {
          consecutiveFailures = 0;
          return;
        }
        // Not being able to reach the network (e.g. right after waking from
        // sleep, before the connection is back) isn't evidence the session
        // is invalid — don't count it toward a forced logout, and don't
        // hold the cooldown against a retry either.
        if (result.networkError) {
          lastRefreshAt = 0;
          return;
        }
        consecutiveFailures += 1;
        if (consecutiveFailures >= 2) {
          session.clear();
          setUser(null);
          setWorkspaces([]);
          setWorkspace(null);
        }
      });
    };
    const timer = window.setInterval(() => refresh(true), MIN_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
