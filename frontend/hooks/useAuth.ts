'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/utils/storage';
import type { UserProfile } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const savedUser = storage.getUser();
    const isOnboarded = storage.isOnboarded();
    
    if (!savedUser || !isOnboarded) {
      if (typeof window !== 'undefined' && 
          !window.location.pathname.includes('/onboarding') && 
          window.location.pathname !== '/') {
        router.push('/onboarding');
      }
    } else {
      setUser(savedUser);
    }
    setLoading(false);
  }, [router]);

  const logout = () => {
    storage.clearOnboarded();
    setUser(null);
    router.push('/');
  };

  const login = (profile: UserProfile) => {
    storage.saveUser(profile);
    storage.markOnboarded();
    setUser(profile);
  };

  return {
    user,
    loading,
    logout,
    login,
    isAuthenticated: !!user,
  };
}
