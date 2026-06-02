'use client';

import { useState, useEffect, useCallback } from 'react';
import { workspacesApi, type ApiMember } from '@/lib/api';

export function useMembers(workspaceId: string | undefined) {
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await workspacesApi.members(workspaceId);
      setMembers(res?.data ?? []);
    } catch (err) {
      console.error('[useMembers]', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const invite = useCallback(async (email: string, role?: string) => {
    if (!workspaceId) throw new Error('No workspace');
    await workspacesApi.invite(workspaceId, email, role);
    await load();
  }, [workspaceId, load]);

  const removeMember = useCallback(async (userId: string) => {
    if (!workspaceId) throw new Error('No workspace');
    await workspacesApi.removeMember(workspaceId, userId);
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }, [workspaceId]);

  const updateRole = useCallback(async (userId: string, role: string) => {
    if (!workspaceId) throw new Error('No workspace');
    await workspacesApi.updateMemberRole(workspaceId, userId, role);
    setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, role } : m));
  }, [workspaceId]);

  return { members, loading, error, refresh: load, invite, removeMember, updateRole };
}
