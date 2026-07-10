'use client';

import { useState, useCallback } from "react";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  UserPlus,
  Video,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { useNotifications } from "@/hooks/useNotifications";
import { useWebSocket } from "@/hooks/useWebSocket";
import { invitationsApi, projectsApi, type ApiNotification } from "@/lib/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";

function extractToken(actionUrl?: string): string | null {
  if (!actionUrl) return null;
  try {
    const url = new URL(actionUrl, 'http://x');
    return url.searchParams.get('token');
  } catch {
    const match = actionUrl.match(/[?&]token=([^&]+)/);
    return match?.[1] ?? null;
  }
}

function notifIcon(type: string) {
  if (type === 'workspace_invite') return <UserPlus className="h-4 w-4" />;
  if (type.includes('task')) return <CheckCircle2 className="h-4 w-4" />;
  return <Bell className="h-4 w-4" />;
}

function notifTone(type: string): 'indigo' | 'green' | 'amber' | 'blue' | 'slate' {
  if (type === 'workspace_invite') return 'indigo';
  if (type.includes('task') || type.includes('done')) return 'green';
  if (type.includes('warn') || type.includes('deadline')) return 'amber';
  return 'blue';
}

function InviteActions({
  notification,
  onDone,
}: {
  notification: ApiNotification;
  onDone: (id: string, action: 'accepted' | 'declined') => void;
}) {
  const { refreshWorkspaces } = useWorkspace();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);

  const token = extractToken(notification.actionUrl);

  if (!token) return null;
  if (result) {
    return (
      <span className={cn("text-xs font-semibold", result === 'accepted' ? 'text-green-600' : 'text-rose-500')}>
        {result === 'accepted' ? '✓ Accepted' : '✗ Declined'}
      </span>
    );
  }

  const handleAccept = async () => {
    setBusy('accept');
    try {
      await invitationsApi.accept(token);
      await refreshWorkspaces();
      setResult('accepted');
      onDone(notification.id, 'accepted');
    } catch {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    setBusy('decline');
    try {
      await invitationsApi.decline(token);
      setResult('declined');
      onDone(notification.id, 'declined');
    } catch {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex gap-2">
      <ActionButton
        onClick={handleAccept}
        disabled={!!busy}
        className="h-8 px-4 text-xs"
      >
        {busy === 'accept' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Accept
      </ActionButton>
      <ActionButton
        variant="secondary"
        onClick={handleDecline}
        disabled={!!busy}
        className="h-8 px-4 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:border-rose-800 dark:hover:bg-rose-950/30"
      >
        {busy === 'decline' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
        Decline
      </ActionButton>
    </div>
  );
}

function MeetingInviteActions({
  notification,
  onDone,
}: {
  notification: ApiNotification;
  onDone: (id: string) => void;
}) {
  const joinCode = (notification.metadata as Record<string, string> | null)?.joinCode;
  if (!joinCode) return null;

  return (
    <div className="mt-3 flex gap-2">
      <Link
        href={`/app/meetings?joinCode=${joinCode}`}
        onClick={() => onDone(notification.id)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors"
      >
        <Video className="h-3 w-3" />
        Qo&apos;shilish
      </Link>
      <button
        type="button"
        onClick={() => onDone(notification.id)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
      >
        <XCircle className="h-3 w-3" />
        Bekor qilish
      </button>
    </div>
  );
}

function ProjectInviteActions({
  notification,
  onDone,
}: {
  notification: ApiNotification;
  onDone: (id: string, action: 'accepted' | 'declined') => void;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);

  const memberId = (notification.metadata as Record<string, string> | null)?.memberId;
  if (!memberId) return null;
  if (result) {
    return (
      <span className={cn("text-xs font-semibold", result === 'accepted' ? 'text-green-600' : 'text-rose-500')}>
        {result === 'accepted' ? '✓ Qabul qilindi' : '✗ Rad etildi'}
      </span>
    );
  }

  const handle = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    try {
      await projectsApi.respondToInvite(memberId, accept);
      setResult(accept ? 'accepted' : 'declined');
      onDone(notification.id, accept ? 'accepted' : 'declined');
    } catch {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex gap-2">
      <ActionButton onClick={() => handle(true)} disabled={!!busy} className="h-8 px-4 text-xs">
        {busy === 'accept' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Qabul qilish
      </ActionButton>
      <ActionButton
        variant="secondary"
        onClick={() => handle(false)}
        disabled={!!busy}
        className="h-8 px-4 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:border-rose-800 dark:hover:bg-rose-950/30"
      >
        {busy === 'decline' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
        Rad etish
      </ActionButton>
    </div>
  );
}

export default function InboxPage() {
  const { notifications, loading, markRead, markAllRead, refresh } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread' | 'invites'>('all');
  const [toast, setToast] = useState<string | null>(null);

  useWebSocket({ onNotification: () => refresh() });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }, []);

  const handleInviteDone = useCallback(async (id: string, action: 'accepted' | 'declined') => {
    await markRead(id);
    showToast(action === 'accepted' ? 'You joined the workspace!' : 'Invitation declined');
    refresh();
  }, [markRead, showToast, refresh]);

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'invites') return n.type === 'workspace_invite';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const inviteCount = notifications.filter((n) => n.type === 'workspace_invite' && !n.isRead).length;

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Updates"
          title="Inbox"
          description="All your workspace notifications, invitations, and activity."
        >
          {unreadCount > 0 && (
            <ActionButton variant="secondary" onClick={() => markAllRead()}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </ActionButton>
          )}
        </PageHeader>

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {([
            { key: 'all', label: `All (${notifications.length})` },
            { key: 'unread', label: `Unread (${unreadCount})` },
            { key: 'invites', label: `Invites (${inviteCount})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                filter === key
                  ? "bg-indigo-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <SurfaceCard>
          <SectionTitle icon={Inbox} title="Messages" description="Click a notification to mark it as read." />

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Inbox className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">
                {filter === 'all' ? 'No notifications yet' : filter === 'unread' ? 'All caught up!' : 'No pending invitations'}
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {filtered.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-2xl border p-4 transition-colors",
                    !n.isRead
                      ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-800/50 dark:bg-indigo-950/20"
                      : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn(
                      "mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl",
                      !n.isRead
                        ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
                        : "bg-muted text-muted-foreground",
                    )}>
                      {notifIcon(n.type)}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={notifTone(n.type)}>{n.type.replace(/_/g, ' ')}</Pill>
                        {!n.isRead && (
                          <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        )}
                      </div>
                      <p className="mt-1 text-sm font-bold text-foreground">{n.title}</p>
                      {(n.body || n.message) && (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{n.body ?? n.message}</p>
                      )}

                      {/* Invite actions */}
                      {n.type === 'workspace_invite' && !n.isRead && (
                        <InviteActions notification={n} onDone={handleInviteDone} />
                      )}
                      {n.type === 'meeting_invite' && !n.isRead && (
                        <MeetingInviteActions notification={n} onDone={(id) => { markRead(id); refresh(); }} />
                      )}
                      {n.type === 'project_member_invite' && !n.isRead && (
                        <ProjectInviteActions notification={n} onDone={handleInviteDone} />
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <Clock3 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString([], {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => markRead(n.id)}
                            className="ml-auto text-[11px] font-semibold text-indigo-500 hover:text-indigo-700"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </PageShell>
      <Toast message={toast} />
    </>
  );
}
