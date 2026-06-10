'use client';

import { useState, useEffect, useCallback } from 'react';
import { workspacesApi, type ApiInvitation } from '@/lib/api';
import { IS_DEMO, DEMO_INVITATIONS } from '@/lib/demoData';

export function useInvitations(workspaceId: string | undefined) {
  const [invitations, setInvitations] = useState<ApiInvitation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    if (IS_DEMO) {
      setInvitations(DEMO_INVITATIONS.filter((i) => i.workspaceId === workspaceId));
      return;
    }
    setLoading(true);
    workspacesApi.listInvitations(workspaceId)
      .then((res) => setInvitations(res?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const send = useCallback(async (email: string, role: string) => {
    if (!workspaceId) throw new Error('No workspace');
    if (IS_DEMO) {
      const inv: ApiInvitation = {
        id: `demo-inv-${Date.now()}`,
        email,
        role,
        token: `demo-token-${Date.now()}`,
        workspaceId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        acceptedAt: null,
        declinedAt: null,
      };
      setInvitations((prev) => [inv, ...prev]);
      return;
    }
    await workspacesApi.invite(workspaceId, email, role);
    await load();
  }, [workspaceId, load]);

  const cancel = useCallback(async (id: string) => {
    if (!workspaceId) return;
    if (IS_DEMO) {
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    await workspacesApi.cancelInvitation(workspaceId, id).catch(() => {});
    setInvitations((prev) => prev.filter((i) => i.id !== id));
  }, [workspaceId]);

  return { invitations, loading, refresh: load, send, cancel };
}
