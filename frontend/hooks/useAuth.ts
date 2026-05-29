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

      if (!savedUser || !isOnboarded) {
        if (
          typeof window !== 'undefined' &&
          !window.location.pathname.includes('/onboarding') &&
          !window.location.pathname.startsWith('/auth') &&
          window.location.pathname !== '/'
        ) {
          router.push('/onboarding');
        }
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

  /** Full backend login: authenticates and stores tokens */
  const loginWithBackend = async (email: string, password: string): Promise<boolean> => {
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
        return true;
      }
      return false;
    } catch {
      return false;
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
