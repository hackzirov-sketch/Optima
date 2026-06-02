'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/utils/storage';
import type { UserProfile } from '@/types';
import { authApi, setTokens, clearTokens } from '@/lib/api';
import { mapApiUserToProfile } from '@/lib/userProfile';
import { disconnectWebSocket } from '@/hooks/useWebSocket';

type LoginResult = { success: boolean; redirect?: string; message?: string };

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  backendUser: { id: string; email: string } | null;
  hasBackendSession: boolean;
  login: (profile: UserProfile) => void;
  loginWithBackend: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendUser, setBackendUser] = useState<{ id: string; email: string } | null>(null);
  const router = useRouter();
  const initialized = useRef(false);

  // ── Full logout helper (clears all state) ────────────────────────────────
  const clearAuthState = () => {
    clearTokens();
    disconnectWebSocket();
    storage.clearUser();
    storage.clearOnboarded();
    setUser(null);
    setBackendUser(null);
  };

  // ── Listen for session-expired event (fired by api.ts on 401) ───────────
  useEffect(() => {
    const handleExpired = () => {
      clearAuthState();
      router.push('/auth/login');
    };
    window.addEventListener('upz:session-expired', handleExpired);
    return () => window.removeEventListener('upz:session-expired', handleExpired);
  }, [router]);

  // ── Multi-tab sync via BroadcastChannel ─────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('upz_auth');

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'logout') {
        setUser(null);
        setBackendUser(null);
      }
      if (e.data?.type === 'login') {
        const profile = e.data.profile as UserProfile | undefined;
        if (profile) setUser(profile);
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // ── App init: restore session ────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      const savedUser = storage.getUser();
      const pathname = window.location.pathname;
      const isAppRoute = pathname.startsWith('/app');

      if (!savedUser) {
        if (isAppRoute) router.push('/auth/login');
        setLoading(false);
        return;
      }

      setUser(savedUser);

      // Always attempt session restore — handles:
      // 1. Valid access token → success directly
      // 2. Expired access token + valid refresh token → auto-refresh → success
      // 3. Both tokens missing/expired → throws → clear all state
      try {
        const res = await authApi.me();
        if (res?.data) {
          setBackendUser({ id: res.data.id, email: res.data.email });
          const merged = mapApiUserToProfile(res.data, savedUser);
          storage.saveUser(merged);
          setUser(merged);
        }
      } catch (err: unknown) {
        const status = (err as Record<string, unknown>)?.status;
        if (status === 401) {
          // Refresh token also expired — force full logout
          clearAuthState();
          if (isAppRoute) router.push('/auth/login');
        }
        // Network errors: keep user logged in locally (offline mode)
      }

      setLoading(false);
    };

    init();
  }, [router]);

  // ── Login helpers ────────────────────────────────────────────────────────
  const broadcast = (msg: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const ch = new BroadcastChannel('upz_auth');
      ch.postMessage(msg);
      ch.close();
    }
  };

  const login = (profile: UserProfile) => {
    storage.saveUser(profile);
    storage.setOnboarded();
    setUser(profile);
    broadcast({ type: 'login', profile });

    // If a workspace invite was pending (user was redirected to login), accept it now
    const pendingInvite = sessionStorage.getItem('pending_invite_token');
    if (pendingInvite) {
      sessionStorage.removeItem('pending_invite_token');
      router.push(`/app/invite/${pendingInvite}`);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch { /* ignore */ }
    clearAuthState();
    broadcast({ type: 'logout' });
    router.push('/');
  };

  const loginWithBackend = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await authApi.login({ email, password });
      if (res?.data?.accessToken) {
        setTokens(res.data.accessToken, res.data.refreshToken);
        const { user: apiUser } = res.data;
        const existing = storage.getUser();
        const profile = mapApiUserToProfile(apiUser, existing);
        profile.authProvider = 'email';
        login(profile);
        setBackendUser({ id: apiUser.id, email: apiUser.email });
        return { success: true };
      }
      return { success: false, message: 'Login failed: No tokens received' };
    } catch (err) {
      const error = err as Record<string, unknown>;
      const code = error?.code as string | undefined;
      let errorMessage = 'Login failed';
      if (typeof error?.message === 'string' && error.message) errorMessage = error.message;
      else if (error?.status === 401) errorMessage = 'Invalid email or password';
      else if (error?.status === 400) errorMessage = 'Invalid request format';
      else if (error?.status) errorMessage = `Server error (${error.status})`;

      let redirect = error?.redirect as string | undefined;
      if (!redirect && (code === 'PENDING_VERIFICATION' || code === 'PASSWORD_SETUP_REQUIRED')) {
        redirect = '/verify';
      }

      return { success: false, message: errorMessage, redirect };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, isAuthenticated: !!user,
      backendUser, hasBackendSession: !!backendUser,
      login, loginWithBackend, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
