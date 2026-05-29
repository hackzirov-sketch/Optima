import { useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, Menu, Search, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@/types";
import { GLOBAL_SEARCH_ITEMS, NOTIFICATIONS } from "@/data/ecosystemData";
import { LanguageSwitcher } from "@/components/landing/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PremiumStatusBadge } from "@/components/premium/PremiumAssets";
import { cn } from "./DesignSystem";

interface TopbarProps {
  user: UserProfile;
  title: string;
  onToggleSidebar?: () => void;
}

const TITLE_KEY_BY_LABEL: Record<string, string> = {
  Home: "home",
  Dashboard: "dashboard",
  Workspace: "workspace",
  Chat: "chat",
  Meetings: "meetings",
  Premium: "premium",
  Projects: "projects",
  Community: "community",
  News: "news",
  "Universal Bank": "bank",
  "AI Assistant": "assistant",
  Teams: "teams",
  "Tasks & Notes": "tasks",
  Profile: "profile",
  Settings: "settings",
};

export function Topbar({ user, title, onToggleSidebar }: TopbarProps) {
  const { t } = useTranslation();
  const { status: wsStatus } = useWebSocket({ disabled: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [readIds, setReadIds] = useState<string[]>([]);

  const searchItems = useMemo(
    () =>
      GLOBAL_SEARCH_ITEMS.map((item, index) => ({
        ...item,
        title: t(`app.search.items.${index}.title`, item.title),
        detail: t(`app.search.items.${index}.detail`, item.detail),
        typeLabel: t(`app.search.types.${item.type}`, item.type),
      })),
    [t],
  );

  const notifications = useMemo(
    () =>
      NOTIFICATIONS.map((notification) => ({
        ...notification,
        category: t(`app.notifications.${notification.id}.category`, notification.category),
        title: t(`app.notifications.${notification.id}.title`, notification.title),
        body: t(`app.notifications.${notification.id}.body`, notification.body),
        time: t(`app.notifications.${notification.id}.time`, notification.time),
      })),
    [t],
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setBellOpen(false);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setBellOpen(false);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const filteredResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return searchItems;
    return searchItems.filter((item) => `${item.typeLabel} ${item.title} ${item.detail}`.toLowerCase().includes(normalized));
  }, [query, searchItems]);

  const unreadCount = NOTIFICATIONS.filter((notification) => notification.unread && !readIds.includes(notification.id)).length;
  const baseTitle = title.replace(/\s+\(.+\)$/, "");
  const suffix = title.slice(baseTitle.length);
  const localizedTitle = `${t(`app.nav.${TITLE_KEY_BY_LABEL[baseTitle] ?? baseTitle.toLowerCase()}`, baseTitle)}${suffix}`;

  return (
    <header className="relative z-[60] flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 shadow-sm backdrop-blur-xl sm:px-4 md:px-5 xl:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("app.topbar.toggleSidebar")}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground">{localizedTitle}</h1>
            <span className={[
              "hidden rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 sm:inline-flex items-center gap-1",
              wsStatus === "connected"
                ? "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
                : wsStatus === "connecting"
                ? "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800"
                : "bg-slate-50 text-slate-500 ring-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
            ].join(" ")}>
              <span className={`ws-status-dot ${wsStatus}`} />
              {wsStatus === "connected" ? t("app.topbar.synced") : wsStatus === "connecting" ? t("app.topbar.connecting", "Connecting…") : t("app.topbar.offline", "Offline")}
            </span>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">{t("app.topbar.tagline")}</p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
        <button
          type="button"
          onClick={() => {
            setSearchOpen((current) => !current);
            setBellOpen(false);
          }}
          className="hidden h-10 min-w-0 items-center gap-2 rounded-2xl border border-border bg-muted px-3 text-sm text-muted-foreground transition-colors hover:border-indigo-200 hover:bg-card hover:text-foreground lg:flex lg:w-[240px] xl:w-[320px]"
        >
          <Search className="h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left text-xs">{t("app.topbar.searchLong")}</span>
          <kbd className="hidden flex-shrink-0 rounded-lg bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-[#E5E7EB] xl:inline-flex">Ctrl K</kbd>
        </button>

        <button
          type="button"
          onClick={() => {
            setSearchOpen((current) => !current);
            setBellOpen(false);
          }}
          className="hidden h-10 w-10 place-items-center rounded-2xl border border-border bg-muted text-muted-foreground transition-colors hover:border-indigo-200 hover:bg-card hover:text-foreground md:grid lg:hidden"
          aria-label={t("app.topbar.openSearch")}
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setSearchOpen((current) => !current);
            setBellOpen(false);
          }}
          className="grid h-10 w-10 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          aria-label={t("app.topbar.openSearch")}
        >
          <Search className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setBellOpen((current) => !current);
            setSearchOpen(false);
          }}
          className="relative rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("app.topbar.openNotifications")}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
        </button>

        <div className="hidden items-center gap-2 rounded-2xl border border-border bg-muted px-2 py-1.5 sm:flex lg:max-xl:hidden">
          <div className="relative grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-xs font-bold text-white shadow-sm shadow-indigo-200" title={user.name}>
            {user.name.slice(0, 2).toUpperCase()}
            <PremiumStatusBadge status="available" size={13} className="absolute -bottom-1 -right-1 rounded-full p-0" />
          </div>
          <div className="hidden text-left lg:block">
            <p className="max-w-28 truncate text-xs font-bold text-foreground">{user.name}</p>
            <p className="text-[11px] text-muted-foreground">{t("app.topbar.online")}</p>
          </div>
        </div>
        <ThemeToggle compact />
        <LanguageSwitcher />
      </div>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            className="absolute inset-x-3 top-[58px] z-50 overflow-hidden rounded-[22px] border border-border bg-card p-2.5 shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[min(520px,calc(100vw-2rem))] sm:p-3 lg:w-[520px]"
          >
            <div className="flex h-10 items-center gap-2 rounded-2xl border border-border bg-muted px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("app.topbar.searchShort")}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="rounded-xl p-1 text-muted-foreground hover:bg-card hover:text-foreground" aria-label={t("app.topbar.closeSearch")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 px-3 py-2 text-xs text-indigo-700 ring-1 ring-indigo-100">
              <Sparkles className="h-4 w-4" />
              {t("app.topbar.commandReady")}
            </div>
            <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto">
              {filteredResults.map((item) => (
                <button key={`${item.type}-${item.title}`} type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted">
                  <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-600">{item.typeLabel}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                </button>
              ))}
              {filteredResults.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("app.topbar.noResults")}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {bellOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            className="absolute right-4 top-[58px] z-50 w-[min(430px,calc(100vw-2rem))] rounded-[24px] border border-border bg-card p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <h3 className="text-sm font-bold text-foreground">{t("app.topbar.notifications")}</h3>
                <p className="text-xs text-muted-foreground">{t("app.topbar.notificationsDesc")}</p>
              </div>
              <button type="button" onClick={() => setReadIds(NOTIFICATIONS.map((item) => item.id))} className="rounded-xl px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
                {t("app.topbar.markAllRead")}
              </button>
            </div>
            <div className="max-h-[380px] space-y-1 overflow-y-auto">
              {notifications.map((notification) => {
                const unread = notification.unread && !readIds.includes(notification.id);
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => setReadIds((current) => [...new Set([...current, notification.id])])}
                    className={cn("flex w-full gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted", unread && "bg-indigo-50/70")}
                  >
                    <span className={cn("mt-1 h-2 w-2 rounded-full", unread ? "bg-indigo-600" : "bg-slate-200")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{notification.category}</span>
                        <span className="text-xs text-muted-foreground">{notification.time}</span>
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-foreground">{notification.title}</span>
                      <span className="block text-xs leading-5 text-muted-foreground">{notification.body}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {wsStatus === "connected" ? t("app.topbar.liveSync", "Live sync active") : t("app.topbar.localOnly")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
