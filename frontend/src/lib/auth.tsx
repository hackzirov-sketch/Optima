import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AuthResult, User, Group } from "../types";
import { api, ApiError, refreshSession } from "./api";
import { session } from "./session";
import { setE2eeUser } from "./e2ee";

interface AuthContextValue {
  ready: boolean;
  user: User | null;
  groups: Group[];
  group: Group | null;
  login: (email: string, password: string) => Promise<void>;
  completeAuth: (result: AuthResult) => Promise<void>;
  completeOAuth: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User>;
  refreshWorkspaces: () => Promise<Group[]>;
  selectWorkspace: (group: Group) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * A fresh sign-in starts at Home.
 *
 * Signing in is a new session, not a continuation: whatever deep link the
 * browser happened to still be sitting on — most often /chat, since that is
 * where people spend their time before a session expires — is not where
 * someone who just typed their password expects to land. A reload is the
 * opposite case and is deliberately left alone: wouter reads window.location,
 * so refreshing keeps you exactly where you were.
 */
function landOnHome() {
  const { pathname, search } = window.location;
  if (pathname === "/" && !search) return;
  window.history.replaceState({}, "", "/");
  // wouter listens for popstate/pushState, not replaceState — nudge it so the
  // router re-reads the location it has just been given.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [groups, setWorkspaces] = useState<Group[]>([]);
  const [group, setWorkspace] = useState<Group | null>(null);

  // E2EE device keys are per user, so the crypto layer follows the session.
  // Set during render (not in an effect) so children's first API calls see it.
  setE2eeUser(user?.id ?? null);

  // Stable, always-current reads for callbacks/effects that must avoid
  // stale-closure state (the access token is an httpOnly cookie now — there's
  // no external store like the old localStorage to read fresh values from).
  const userRef = useRef<User | null>(null);
  const groupRef = useRef<Group | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { groupRef.current = group; }, [group]);

  const applyWorkspaces = useCallback(async (items: Group[], activeWorkspaceId: string | null) => {
    setWorkspaces(items);
    let next = items.find((item) => item.id === activeWorkspaceId) || null;
    if (!next && items.length) {
      // No group embedded in the session yet (fresh login/verify, or an
      // old session predating this claim) — default to the first one and
      // have the server embed it, same UX the old localStorage-based
      // "remember the selected group" gave, just server-verified now.
      next = items[0];
      try {
        await api.groups.select(next.id);
      } catch {
        // Non-fatal — the UI still shows the group even if the reissue
        // call failed; the next explicit select (or refresh) will retry.
      }
    }
    setWorkspace(next);
    return items;
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const items = await api.groups.list();
    return applyWorkspaces(items, groupRef.current?.id ?? null);
  }, [applyWorkspaces]);

  const refreshUser = useCallback(async () => {
    const next = await api.users.me();
    setUser(next);
    return next;
  }, []);

  const bootstrap = useCallback(async () => {
    if (!session.isActive()) {
      setReady(true);
      return;
    }
    try {
      const [nextUser, items] = await Promise.all([
        api.users.me(),
        api.groups.list(),
      ]);
      setUser(nextUser);
      await applyWorkspaces(items, null);
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
  }, [applyWorkspaces]);

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
      if (!userRef.current) return;
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
    // Cross-tab signal (see session.ts) — cookies are shared across tabs
    // automatically, so another tab logging out or switching group means
    // this tab's in-memory state is stale until it re-checks. This must only
    // ever CLEAR state, never re-fetch (e.g. call bootstrap()) — a genuinely
    // dead session means the re-fetch just 401s again, re-fires this same
    // signal, and floods the server in an infinite loop. Clearing state is
    // enough: it unmounts whatever authenticated view was showing, so
    // nothing keeps requesting data for a session that's gone.
    return session.onChange(() => {
      setUser(null);
      setWorkspaces([]);
      setWorkspace(null);
    });
  }, []);

  const completeAuth = useCallback(async (result: AuthResult) => {
    // Cookies are already set by the time this resolves (Set-Cookie on the
    // login/verify response) — nothing to store client-side, just adopt the
    // user and resolve which group is active.
    session.markActive();
    setUser(result.user);
    setReady(true);
    landOnHome();
    await refreshWorkspaces();
  }, [refreshWorkspaces]);

  const completeOAuth = useCallback(async (code: string) => {
    const result = await api.auth.exchangeOAuthCode(code);
    session.markActive();
    try {
      const [nextUser, items] = await Promise.all([api.users.me(), api.groups.list()]);
      setUser(nextUser);
      await applyWorkspaces(items, null);
      setReady(true);
      landOnHome();
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, [applyWorkspaces]);

  const login = useCallback(async (email: string, password: string) => {
    await completeAuth(await api.auth.login(email, password));
  }, [completeAuth]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      session.clear();
      setUser(null);
      setWorkspaces([]);
      setWorkspace(null);
      session.notify();
    }
  }, []);

  const selectWorkspace = useCallback(async (item: Group) => {
    await api.groups.select(item.id);
    setWorkspace(item);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    user,
    groups,
    group,
    login,
    completeAuth,
    completeOAuth,
    logout,
    refreshUser,
    refreshWorkspaces,
    selectWorkspace,
  }), [ready, user, groups, group, login, completeAuth, completeOAuth, logout, refreshUser, refreshWorkspaces, selectWorkspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
