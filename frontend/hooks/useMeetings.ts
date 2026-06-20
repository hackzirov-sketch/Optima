'use client';

import { useState, useEffect, useCallback } from 'react';
import { meetingsApi, type ApiMeeting } from '@/lib/api';

export function useMeetings(workspaceId: string | undefined) {
  const [meetings, setMeetings] = useState<ApiMeeting[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await meetingsApi.list(workspaceId);
      setMeetings(res?.data ?? []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const createMeeting = useCallback(async (dto: {
    title: string;
    description?: string;
    startTime: string;
    endTime?: string;
    agenda?: string;
  }) => {
    if (!workspaceId) throw new Error('No workspace');
    const res = await meetingsApi.create(workspaceId, dto);
    setMeetings((prev) => [res.data, ...prev]);
    return res.data;
  }, [workspaceId]);

  const deleteMeeting = useCallback(async (id: string) => {
    await meetingsApi.delete(id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addMeeting = useCallback((meeting: ApiMeeting) => {
    setMeetings((prev) => {
      if (prev.some(m => m.id === meeting.id)) return prev;
      return [meeting, ...prev];
    });
  }, []);

  return { meetings, loading, refresh: load, createMeeting, deleteMeeting, addMeeting };
}
