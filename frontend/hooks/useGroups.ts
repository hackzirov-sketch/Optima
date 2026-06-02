'use client';

import { useCallback, useEffect, useState } from 'react';
import { groupsApi, type ApiGroup } from '@/lib/api';

export function useGroups(workspaceId: string | undefined) {
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setGroups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await groupsApi.listByWorkspace(workspaceId);
      setGroups(res?.data ?? []);
    } catch (err) {
      console.error('[useGroups]', err);
      setError('Failed to load groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const createGroup = useCallback(
    async (name: string, description?: string) => {
      if (!workspaceId) throw new Error('No workspace');
      const res = await groupsApi.create({ workspaceId, name, description });
      setGroups((prev) => [...prev, res.data]);
      return res.data;
    },
    [workspaceId],
  );

  const deleteGroup = useCallback(async (id: string) => {
    await groupsApi.delete(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  return { groups, loading, error, refresh: load, createGroup, deleteGroup };
}
