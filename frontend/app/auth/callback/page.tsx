'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setTokens, authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/utils/storage';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      // Fetch user profile
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
            router.push('/app/home');
          } else {
            router.push('/onboarding');
          }
        } else {
          router.push('/auth/login');
        }
      }).catch(() => {
        router.push('/auth/login');
      });
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
