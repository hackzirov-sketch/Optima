'use client';

import { useCallback, useEffect, useState } from 'react';
import { analyticsApi, type ApiWorkspaceAnalytics } from '@/lib/api';
import { IS_DEMO, DEMO_ANALYTICS } from '@/lib/demoData';

export function useWorkspaceAnalytics(workspaceId: string | undefined) {
  const [analytics, setAnalytics] = useState<ApiWorkspaceAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setAnalytics(null);
      return;
    }
    if (IS_DEMO) {
      setAnalytics(DEMO_ANALYTICS);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getWorkspaceOverview(workspaceId);
      setAnalytics(res?.data ?? null);
    } catch (err) {
      console.error('[useWorkspaceAnalytics]', err);
      setError('Failed to load workspace analytics');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { analytics, loading, error, refresh: load };
}
