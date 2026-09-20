import { Bell, CalendarClock, Check, CheckCheck, LoaderCircle, MessageCircle, UserRound, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useI18n } from "../lib/i18n/i18n";
import { useOutsideClose } from "../lib/useOutsideClose";
import type { NotificationItem } from "../types";

/**
 * The topbar bell.
 *
 * The server has been writing notifications and pushing them over the socket
 * all along — a meeting invite, for instance, creates one alongside the email
 * — but nothing in the app ever read them: the bell was a button with no
 * handler, so the only invite anyone actually saw was the emailed one.
 */

/** Enough of an icon to tell one notification apart from another at a glance. */
function iconFor(type: string) {
  if (type.startsWith("meeting")) return <Video size={15} />;
  if (type.startsWith("message") || type.startsWith("chat")) return <MessageCircle size={15} />;
  if (type.includes("member") || type.includes("invite")) return <UserRound size={15} />;
  return <CalendarClock size={15} />;
}

export function NotificationsMenu() {
  const { t, locale } = useI18n();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClose(wrapRef, open, () => setOpen(false));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        api.notifications.list(),
        api.notifications.unreadCount(),
      ]);
      setItems(list.data);
      setUnread(count.count);
    } catch {
      // A bell that cannot reach the server is not worth a toast; the badge
      // simply stays where it was and the next push or open retries.
    } finally {
      setLoading(false);
    }
  }, []);

  // The badge has to be right before the menu is ever opened, so the count is
  // fetched on mount and kept current by the same socket event that delivers
  // the notification itself.
  useEffect(() => {
    void api.notifications.unreadCount().then(({ count }) => setUnread(count)).catch(() => {});
    const socket = getSocket();
    const onNotification = ({ notification }: { notification: NotificationItem }) => {
      if (!notification?.id) return;
      setItems((current) => current.some((item) => item.id === notification.id) ? current : [notification, ...current].slice(0, 20));
      if (!notification.isRead) setUnread((current) => current + 1);
    };
    socket.on("notification", onNotification);
    return () => { socket.off("notification", onNotification); };
  }, []);

  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening) void refresh();
  }

  async function openNotification(item: NotificationItem) {
    setOpen(false);
    if (!item.isRead) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry));
      setUnread((current) => Math.max(0, current - 1));
      await api.notifications.markRead(item.id).catch(() => {});
    }
    // actionUrl is the server's own routing hint; entityId is the fallback for
    // the notifications that predate it.
    const target = item.actionUrl || (item.entityType === "meeting" && item.entityId ? `/meetings/${item.entityId}` : null);
    if (target) navigate(target);
  }

  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnread(0);
    await api.notifications.readAll().catch(() => {});
  }

  const relative = (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (minutes < 60) return formatter.format(-minutes, "minute");
    if (minutes < 60 * 24) return formatter.format(-Math.round(minutes / 60), "hour");
    return formatter.format(-Math.round(minutes / 1440), "day");
  };

  return (
    <div className="notifications-wrap" ref={wrapRef}>
      <button className="icon-button topbar-notifications" onClick={toggle} aria-label={t("shell.notifications")}
              title={t("shell.notifications")} aria-expanded={open} aria-haspopup="menu">
        <Bell size={19} />
        {unread > 0 && <b className="dock-badge">{unread > 99 ? "99+" : unread}</b>}
      </button>
      {open && (
        <div className="notifications-menu" role="menu">
          <header>
            <strong>{t("shell.notifications")}</strong>
            {unread > 0 && <button className="notification-read-all" aria-label={t("shell.markAllRead")} title={t("shell.markAllRead")} onClick={() => void markAllRead()}><CheckCheck size={19} /></button>}
          </header>
          {loading && items.length === 0 ? (
            <div className="notifications-empty"><LoaderCircle className="spin" size={20} /></div>
          ) : items.length === 0 ? (
            <div className="notifications-empty"><Bell size={22} /><strong>{t("shell.noNotifications")}</strong></div>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button className={item.isRead ? "" : "unread"} onClick={() => void openNotification(item)} role="menuitem">
                    <span className="notification-icon">{iconFor(item.type)}</span>
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      {item.message && <small>{item.message}</small>}
                      <time>{relative(item.createdAt)}</time>
                    </span>
                    {!item.isRead && <span className="notification-dot" aria-hidden="true" />}
                    {item.isRead && <Check size={14} className="notification-read" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
