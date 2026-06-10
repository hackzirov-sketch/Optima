'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setTokens, authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/utils/storage';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation — the one-time code
    // is consumed on first use; a second call would get 401 and redirect to login.
    if (hasRun.current) return;
    hasRun.current = true;

    // Backend now sends a short-lived one-time `code` in the URL instead of
    // actual tokens — prevents tokens from appearing in browser history / logs.
    const code = searchParams.get('code');

    // Legacy fallback: support old ?accessToken=...&refreshToken=... URLs
    // (can be removed once all environments are updated)
    const legacyAccess = searchParams.get('accessToken');
    const legacyRefresh = searchParams.get('refreshToken');

    const handleTokens = (accessToken: string, refreshToken: string) => {
      setTokens(accessToken, refreshToken);
      authApi.me().then(res => {
        if (res?.data) {
          login({
            name: `${res.data.firstName} ${res.data.lastName}`.trim(),
            email: res.data.email,
            username: res.data.username,
            profession: 'developer',
            goal: 'build_portfolio',
            experience: 'intermediate',
            joinedAt: Date.now(),
            authProvider: 'social',
          });
          if (storage.isOnboarded()) {
            router.push('/app/dashboard');
          } else {
            router.push('/onboarding');
          }
        } else {
          router.push('/auth/login');
        }
      }).catch(() => {
        router.push('/auth/login');
      });
    };

    if (code) {
      // Exchange one-time code for real tokens via POST (secure)
      fetch('/api/auth/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then(r => r.json())
        .then(data => {
          const tokens = data?.data ?? data;
          if (tokens?.accessToken && tokens?.refreshToken) {
            handleTokens(tokens.accessToken, tokens.refreshToken);
          } else {
            router.push('/auth/login');
          }
        })
        .catch(() => router.push('/auth/login'));
    } else if (legacyAccess && legacyRefresh) {
      handleTokens(legacyAccess, legacyRefresh);
    } else {
      router.push('/auth/login');
    }
  }, [router, searchParams, login]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#08111F]">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto"></div>
        <p className="text-slate-500 dark:text-slate-400">Authenticating...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#08111F]">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto"></div>
          <p className="text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
