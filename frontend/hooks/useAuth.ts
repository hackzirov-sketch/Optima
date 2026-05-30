'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/utils/storage';
import type { UserProfile } from '@/types';
import { authApi, setTokens, clearTokens, getAccessToken } from '@/lib/api';
import { disconnectWebSocket } from '@/hooks/useWebSocket';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendUser, setBackendUser] = useState<{ id: string; email: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const savedUser = storage.getUser();
      const isOnboarded = storage.isOnboarded();
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const isAppRoute = pathname.startsWith('/app');
      const isAuthRoute = pathname.startsWith('/auth');
      const isOnboardingRoute = pathname === '/onboarding';

      if (!savedUser) {
        if (isAppRoute) {
          router.push('/auth/login');
        }
        setLoading(false);
        return;
      }

      if (!isOnboarded && isAppRoute) {
        router.push('/onboarding');
        setLoading(false);
        return;
      }

      setUser(savedUser);

      // Try to sync with backend if we have an access token
      const token = getAccessToken();
      if (token) {
        try {
          const res = await authApi.me();
          if (res?.data) {
            setBackendUser({ id: res.data.id, email: res.data.email });
          }
        } catch {
          // Token invalid — clear silently, app still works with local storage
          clearTokens();
        }
      }

      setLoading(false);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    try {
      const token = getAccessToken();
      if (token) await authApi.logout();
    } catch {
      // ignore
    }
    clearTokens();
    disconnectWebSocket();
    storage.clearOnboarded();
    setUser(null);
    setBackendUser(null);
    router.push('/');
  };

  const login = (profile: UserProfile) => {
    storage.saveUser(profile);
    storage.setOnboarded();
    setUser(profile);
  };

  type LoginResult = {
    success: boolean;
    redirect?: string;
    message?: string;
  };

  /** Full backend login: authenticates and stores tokens */
  const loginWithBackend = async (email: string, password: string): Promise<LoginResult> => {
    try {
      console.log('[useAuth] Logging in with email:', email);
      const res = await authApi.login({ email, password });
      console.log('[useAuth] Login response:', res);
      
      if (res?.data?.accessToken) {
        console.log('[useAuth] Login successful, setting tokens');
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
      const error = err as Record<string, any>;
      console.error('[useAuth] Login error:', error);
      
      // Extract error message from various possible sources
      let errorMessage = 'Login failed';
      if (error?.message && error.message !== 'Login failed') {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (error?.msg) {
        errorMessage = error.msg;
      } else if (error?.status === 401) {
        errorMessage = 'Invalid email or password';
      } else if (error?.status === 400) {
        errorMessage = 'Invalid request format';
      } else if (error?.status) {
        errorMessage = `Server error (${error.status})`;
      }
      
      return {
        success: false,
        message: errorMessage,
        redirect: error?.redirect,
      };
    }
  };

  return {
    user,
    loading,
    logout,
    login,
    loginWithBackend,
    isAuthenticated: !!user,
    backendUser,
    hasBackendSession: !!backendUser,
  };
}
