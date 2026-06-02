'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationsApi, type ApiNotification } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export function useNotifications() {
  const { hasBackendSession } = useAuth();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!hasBackendSession) return;
    setLoading(true);
    try {
      const res = await notificationsApi.list(1, 30);
      const payload = res?.data;
      setNotifications(payload?.data ?? []);
      setTotal(payload?.total ?? 0);
    } catch (err) {
      console.error('[useNotifications]', err);
    } finally {
      setLoading(false);
    }
  }, [hasBackendSession]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, total, unreadCount, loading, refresh: load, markRead, markAllRead };
}
