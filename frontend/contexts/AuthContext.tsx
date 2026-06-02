'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/utils/storage';
import type { UserProfile } from '@/types';
import { authApi, setTokens, clearTokens, getAccessToken } from '@/lib/api';
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

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      const savedUser = storage.getUser();
      const isOnboarded = storage.isOnboarded();
      const pathname = window.location.pathname;
      const isAppRoute = pathname.startsWith('/app');

      if (!savedUser) {
        if (isAppRoute) router.push('/auth/login');
        setLoading(false);
        return;
      }

      if (!isOnboarded && isAppRoute) {
        router.push('/onboarding');
        setLoading(false);
        return;
      }

      setUser(savedUser);

      const token = getAccessToken();
      if (token) {
        try {
          const res = await authApi.me();
          if (res?.data) setBackendUser({ id: res.data.id, email: res.data.email });
        } catch {
          clearTokens();
        }
      }

      setLoading(false);
    };

    init();
  }, [router]);

  const login = (profile: UserProfile) => {
    storage.saveUser(profile);
    storage.setOnboarded();
    setUser(profile);
  };

  const logout = async () => {
    try {
      const token = getAccessToken();
      if (token) await authApi.logout();
    } catch { /* ignore */ }
    clearTokens();
    disconnectWebSocket();
    storage.clearOnboarded();
    setUser(null);
    setBackendUser(null);
    router.push('/');
  };

  const loginWithBackend = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await authApi.login({ email, password });
      if (res?.data?.accessToken) {
        setTokens(res.data.accessToken, res.data.refreshToken);
        const { user: apiUser } = res.data;
        const profile: UserProfile = {
          name: `${apiUser.firstName} ${apiUser.lastName}`.trim(),
          profession: 'developer',
          goal: 'build_portfolio',
          experience: 'intermediate',
          joinedAt: Date.now(),
          email: apiUser.email,
          username: apiUser.username,
          authProvider: 'email',
        };
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
