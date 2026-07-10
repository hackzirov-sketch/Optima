'use client';

import { useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, Inbox, Loader2, PanelLeft, PanelLeftClose, Video, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@/types";
import { LanguageSwitcher } from "@/components/landing/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "./DesignSystem";
import { useNotifications } from "@/hooks/useNotifications";
import { invitationsApi, type ApiNotification } from "@/lib/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface TopbarProps {
  user: UserProfile;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

const PATH_TITLE_KEY: [string, string][] = [
  ["/app/home", "home"],
  ["/app/dashboard", "dashboard"],
  ["/app/workspace", "workspace"],
  ["/app/inbox", "inbox"],
  ["/app/chat", "chat"],
  ["/app/meetings", "meetings"],
  ["/app/premium", "premium"],
  ["/app/projects", "projects"],
  ["/app/community", "community"],
  ["/app/news", "news"],
  ["/app/bank", "bank"],
  ["/app/assistant", "assistant"],
  ["/app/teams", "teams"],
  ["/app/tasks", "tasks"],
  ["/app/profile", "profile"],
  ["/app/settings", "settings"],
];

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

function InviteNotifRow({
  notification,
  onDone,
}: {
  notification: ApiNotification;
  onDone: (id: string) => void;
}) {
  const { refreshWorkspaces } = useWorkspace();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);
  const token = extractToken(notification.actionUrl);

  if (result) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-slate-200 dark:bg-slate-600" />
        <span className="flex-1 text-sm text-muted-foreground">
          {result === 'accepted' ? '✓ Accepted invitation' : '✗ Invitation declined'}
        </span>
      </div>
    );
  }

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    setBusy('accept');
    try {
      await invitationsApi.accept(token);
      await refreshWorkspaces();
      setResult('accepted');
      onDone(notification.id);
    } catch { setBusy(null); }
  };

  const handleDecline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    setBusy('decline');
    try {
      await invitationsApi.decline(token);
      setResult('declined');
      onDone(notification.id);
    } catch { setBusy(null); }
  };

  return (
    <div className={cn(
      "rounded-2xl px-3 py-2.5 transition-colors",
      !notification.isRead && "bg-[var(--upz-nav-accent)]/70 dark:bg-blue-500/10",
    )}>
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", !notification.isRead ? "bg-[var(--upz-nav-brand)]" : "bg-slate-200 dark:bg-slate-600")} />
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-500">Workspace Invite</span>
          <span className="block truncate text-sm font-semibold text-foreground">{notification.title}</span>
        </span>
      </div>
      {token && (
        <div className="mt-2 flex gap-2 pl-4">
          <button
            type="button"
            onClick={handleAccept}
            disabled={!!busy}
            className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy === 'accept' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Accept
          </button>
          <button
            type="button"
            onClick={handleDecline}
            disabled={!!busy}
            className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-60"
          >
            {busy === 'decline' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function MeetingInviteNotifRow({
  notification,
  onDone,
}: {
  notification: ApiNotification;
  onDone: (id: string) => void;
}) {
  const joinCode = notification.metadata?.joinCode as string | undefined;
  
  const handleJoin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDone(notification.id);
  };

  const handleDecline = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDone(notification.id);
  };

  return (
    <div className={cn(
      "rounded-2xl px-3 py-2.5 transition-colors",
      !notification.isRead && "bg-[var(--upz-nav-accent)]/70 dark:bg-blue-500/10",
    )}>
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", !notification.isRead ? "bg-[var(--upz-nav-brand)]" : "bg-slate-200 dark:bg-slate-600")} />
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#4361EE]">Meeting Invite</span>
          <span className="block truncate text-sm font-semibold text-foreground">{notification.title}</span>
          <span className="block text-xs leading-5 text-muted-foreground">{notification.body ?? notification.message}</span>
        </span>
      </div>
      {joinCode && (
        <div className="mt-2 flex gap-2 pl-4">
          <Link
            href={`/app/meetings?joinCode=${joinCode}`}
            onClick={handleJoin}
            className="flex items-center gap-1 rounded-xl bg-[#4361EE] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4361EE]/90"
          >
            <Video className="h-3 w-3" />
            Qo&apos;shilish
          </Link>
          <button
            type="button"
            onClick={handleDecline}
            className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <XCircle className="h-3 w-3" />
            Bekor qilish
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onToggleSidebar, sidebarCollapsed }: TopbarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { notifications: realNotifs, unreadCount, markRead, markAllRead, refresh: refreshNotifs } = useNotifications();
  const { status: wsStatus } = useWebSocket({
    disabled: false,
    onNotification: () => { refreshNotifs(); },
  });
  const titleKey = PATH_TITLE_KEY.find(([path]) => pathname.startsWith(path))?.[1] ?? "home";
  const [bellOpen, setBellOpen] = useState(false);

  const localizedTitle = t(`app.nav.${titleKey}`);

  return (
    <>
      {bellOpen && (
        <div
          className="fixed inset-0 z-[45]"
          onClick={() => setBellOpen(false)}
          aria-hidden="true"
        />
      )}

      <header
        className="relative z-[60] flex min-h-[88px] flex-shrink-0 items-center justify-between overflow-visible border-b border-slate-200/90 px-4 sm:px-5 md:px-6 dark:border-slate-800"
        style={{
          background: "linear-gradient(180deg, var(--upz-nav-header-from) 0%, var(--upz-nav-header-to) 100%)",
        }}
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--upz-nav-accent)] text-[var(--upz-nav-navy)] transition-colors hover:bg-blue-100/80 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label={t("app.topbar.toggleSidebar")}
          >
            {sidebarCollapsed
              ? <PanelLeft className="h-5 w-5" strokeWidth={2} />
              : <PanelLeftClose className="h-5 w-5" strokeWidth={2} />
            }
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[var(--upz-nav-navy)] sm:text-2xl dark:text-slate-100">
              {localizedTitle}
            </h1>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {t("app.topbar.greeting")}
            </p>
          </div>
          <span
            className={cn(
              "ml-1 hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 lg:inline-flex",
              wsStatus === "connected"
                ? "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
                : wsStatus === "connecting"
                ? "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800"
                : "bg-slate-50 text-slate-500 ring-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
            )}
          >
            <span className={`ws-status-dot ${wsStatus}`} />
            {wsStatus === "connected" ? t("app.topbar.synced") : wsStatus === "connecting" ? t("app.topbar.connecting", "Connecting…") : t("app.topbar.offline", "Offline")}
          </span>
        </div>

        <div className="relative z-[70] flex flex-shrink-0 items-center gap-1.5 overflow-visible sm:gap-2">
          <button
            type="button"
            onClick={() => setBellOpen((current) => !current)}
            className="relative grid h-10 w-10 place-items-center rounded-xl bg-[var(--upz-nav-accent)] text-[var(--upz-nav-navy)] transition-colors hover:bg-blue-100/80 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label={t("app.topbar.openNotifications")}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--upz-nav-brand)] px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          <ThemeToggle compact />
          <LanguageSwitcher variant="toolbar" />
        </div>

        <AnimatePresence>
          {bellOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.99 }}
              className="absolute right-4 top-[76px] z-50 w-[min(430px,calc(100vw-2rem))] rounded-[24px] glass p-3"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t("app.topbar.notifications")}</h3>
                  <p className="text-xs text-muted-foreground">{t("app.topbar.notificationsDesc")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="rounded-xl px-2 py-1 text-xs font-semibold text-[var(--upz-nav-brand)] hover:bg-[var(--upz-nav-accent)] dark:hover:bg-slate-800"
                >
                  {t("app.topbar.markAllRead")}
                </button>
              </div>
              <div className="max-h-[380px] space-y-1 overflow-y-auto">
                {realNotifs.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                    No notifications
                  </div>
                )}
                {realNotifs.map((notification) =>
                  notification.type === 'workspace_invite' ? (
                    <InviteNotifRow
                      key={notification.id}
                      notification={notification}
                      onDone={(id) => { markRead(id); refreshNotifs(); }}
                    />
                  ) : notification.type === 'meeting_invite' ? (
                    <MeetingInviteNotifRow
                      key={notification.id}
                      notification={notification}
                      onDone={(id) => { markRead(id); refreshNotifs(); }}
                    />
                  ) : (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => { markRead(notification.id); }}
                      className={cn(
                        "flex w-full gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted",
                        !notification.isRead && "bg-[var(--upz-nav-accent)]/70 dark:bg-blue-500/10",
                      )}
                    >
                      <span className={cn("mt-1 h-2 w-2 flex-shrink-0 rounded-full", !notification.isRead ? "bg-[var(--upz-nav-brand)]" : "bg-slate-200 dark:bg-slate-600")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{notification.type}</span>
                          <span className="text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleDateString()}</span>
                        </span>
                        <span className="mt-1 block text-sm font-semibold text-foreground">{notification.title}</span>
                        <span className="block text-xs leading-5 text-muted-foreground">{notification.body ?? notification.message}</span>
                      </span>
                    </button>
                  )
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-muted px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {wsStatus === "connected" ? t("app.topbar.liveSync", "Live sync active") : t("app.topbar.localOnly")}
                </div>
                <Link
                  href="/app/inbox"
                  onClick={() => setBellOpen(false)}
                  className="flex items-center gap-1 text-xs font-semibold text-[var(--upz-nav-brand)] hover:underline"
                >
                  <Inbox className="h-3.5 w-3.5" /> View all
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
