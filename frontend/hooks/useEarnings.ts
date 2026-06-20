'use client';

import { useCallback, useEffect, useState } from 'react';
import { earningsApi, type ApiEarningsSummary } from '@/lib/api';

export function useEarnings(workspaceId: string | undefined) {
  const [summary, setSummary] = useState<ApiEarningsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      const res = await earningsApi.getSummary(workspaceId);
      setSummary((res as ApiEarningsSummary) ?? null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { summary, loading, refresh: load };
}
