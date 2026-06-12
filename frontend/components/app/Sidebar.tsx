'use client';

import type { ComponentType } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  BriefcaseBusiness,
  Building2,
  ChevronUp,
  CreditCard,
  Crown,
  LayoutDashboard,
  Layers,
  Plus,
  ListTodo,
  LogOut,
  MessageCircle,
  Newspaper,
  Settings,
  User,
  Users,
  Video,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@/types";
import { PROFESSION_LABELS } from "@/data/mockData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "./DesignSystem";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const SIDEBAR_WIDTH_EXPANDED = 272;
const SIDEBAR_WIDTH_COLLAPSED = 68;

const NAV_GROUPS = [
  {
    titleKey: "core",
    items: [
      { path: "/app/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
      { path: "/app/workspace", labelKey: "workspace", icon: Layers },
      { path: "/app/chat", labelKey: "chat", icon: MessageCircle, badgeKey: "live" },
      { path: "/app/meetings", labelKey: "meetings", icon: Video },
    ],
  },
  {
    titleKey: "work",
    items: [
      { path: "/app/projects", labelKey: "projects", icon: BriefcaseBusiness },
      { path: "/app/teams", labelKey: "teams", icon: Building2 },
      { path: "/app/tasks", labelKey: "tasks", icon: ListTodo },
      { path: "/app/assistant", labelKey: "assistant", icon: Bot },
    ],
  },
  {
    titleKey: "growth",
    items: [
      { path: "/app/community", labelKey: "community", icon: Users },
      { path: "/app/news", labelKey: "news", icon: Newspaper },
      { path: "/app/bank", labelKey: "bank", icon: CreditCard },
      { path: "/app/premium", labelKey: "premium", icon: Crown, badgeKey: "pro" },
    ],
  },
];

interface SidebarProps {
  user: UserProfile;
  onLogout: () => void;
  collapsed?: boolean;
  onNavigate?: () => void;
}

interface NavItemProps {
  path: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badgeKey?: string;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  badgeLabel?: string;
}

function NavItem({
  path,
  label,
  icon: Icon,
  badgeKey,
  badgeLabel,
  active,
  collapsed,
  onNavigate,
}: NavItemProps) {
  const itemContent = (
    <motion.div
      onClick={onNavigate}
      className={cn(
        "group relative flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        collapsed ? "justify-center px-0" : "font-medium",
        active
          ? cn(
              "font-semibold text-[var(--upz-nav-navy)] dark:text-white",
              collapsed
                ? ""
                : "bg-[var(--upz-nav-accent)] pl-6 dark:bg-white/[0.08]",
            )
          : "text-slate-600 hover:bg-slate-50 hover:text-[var(--upz-nav-navy)] dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-slate-100",
      )}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
    >
      {active && collapsed && (
        <span className="absolute inset-1 rounded-lg bg-[var(--upz-nav-accent)] dark:bg-white/10" aria-hidden />
      )}

      {active && !collapsed && (
        <span
          className="absolute left-3.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--upz-nav-brand)] dark:bg-blue-400"
          aria-hidden
        />
      )}

      <Icon
        className={cn(
          "relative z-[1] h-[18px] w-[18px] flex-shrink-0 transition-colors",
          active
            ? "text-[var(--upz-nav-brand)] dark:text-blue-300"
            : "text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200",
        )}
      />

      {!collapsed && (
        <>
          <span className="relative z-[1] min-w-0 flex-1 truncate">{label}</span>
          {badgeKey && badgeLabel && (
            <span
              className={cn(
                "relative z-[1] ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                active
                  ? "bg-[var(--upz-nav-accent)] text-[var(--upz-nav-navy)] dark:bg-blue-500/20 dark:text-blue-200"
                  : "bg-[var(--upz-nav-accent)] text-[var(--upz-nav-brand)] dark:bg-blue-500/20 dark:text-blue-300",
              )}
            >
              {badgeLabel}
            </span>
          )}
        </>
      )}
    </motion.div>
  );

  const link = (
    <Link href={path} className="block">
      {itemContent}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="font-semibold">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ user, onLogout, collapsed = false, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newWsOpen, setNewWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsLoading, setNewWsLoading] = useState(false);
  const { workspaces, activeWorkspace, setActiveWorkspace, createWorkspace } = useWorkspace();

  const menuItems = [
    { href: "/app/profile", label: t("app.nav.profile"), icon: User },
    { href: "/app/settings", label: t("app.nav.settings"), icon: Settings },
    { href: "/app/premium", label: t("app.nav.premium"), icon: Crown },
  ];

  return (
    <aside
      className="flex h-full flex-col border-r border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-950"
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        transition: "width 0.2s ease",
        flexShrink: 0,
      }}
    >
      <div className="flex-shrink-0 border-b border-slate-200/90 dark:border-slate-800">
        <div className="flex min-h-[88px] items-center px-4">
          <div className={cn("flex w-full items-center gap-3", collapsed && "justify-center")}>
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[var(--upz-nav-brand)] shadow-sm shadow-blue-200/60 dark:shadow-none">
              <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={2.25} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="block text-[17px] font-bold leading-tight tracking-tight text-[var(--upz-nav-navy)] dark:text-slate-100">
                  UPZ
                </span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#8BB0E0] dark:text-slate-500">
                  {activeWorkspace?.name?.toUpperCase() ?? t("app.brand.badge")}
                </span>
              </div>
            )}
          </div>
        </div>
        {!collapsed && activeWorkspace && (
          <div className="space-y-1.5 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <select
              value={activeWorkspace.id}
              onChange={(e) => {
                const ws = workspaces.find((w) => w.id === e.target.value);
                if (ws) setActiveWorkspace(ws);
              }}
              className="w-full rounded-xl border border-slate-200 bg-[var(--upz-nav-accent)] px-3 py-2 text-xs font-semibold text-[var(--upz-nav-navy)] outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>

            {/* New workspace inline form */}
            {newWsOpen ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newWsName.trim() && !newWsLoading) {
                      setNewWsLoading(true);
                      try { await createWorkspace(newWsName.trim()); setNewWsName(''); setNewWsOpen(false); }
                      catch { /* ignore */ }
                      finally { setNewWsLoading(false); }
                    }
                    if (e.key === 'Escape') { setNewWsOpen(false); setNewWsName(''); }
                  }}
                  placeholder="Workspace name…"
                  className="min-w-0 flex-1 rounded-xl border border-indigo-300 bg-card px-2 py-1.5 text-xs text-foreground outline-none"
                />
                <button
                  onClick={async () => {
                    if (!newWsName.trim() || newWsLoading) return;
                    setNewWsLoading(true);
                    try { await createWorkspace(newWsName.trim()); setNewWsName(''); setNewWsOpen(false); }
                    catch { /* ignore */ }
                    finally { setNewWsLoading(false); }
                  }}
                  disabled={newWsLoading || !newWsName.trim()}
                  className="rounded-xl bg-indigo-600 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {newWsLoading ? '…' : 'Add'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setNewWsOpen(true)}
                className="flex w-full items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> New workspace
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div
            key={group.titleKey}
            className={cn(groupIndex > 0 && "mt-6 border-t border-border/80 pt-5")}
          >
            {!collapsed && (
              <div className="mb-2.5 px-1 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.26em] text-slate-400">
                {t(`app.nav.${group.titleKey}`)}
              </div>
            )}

            <div className="space-y-2">
              {group.items.map(({ path, labelKey, icon, badgeKey }) => (
                <NavItem
                  key={path}
                  path={path}
                  label={t(`app.nav.${labelKey}`)}
                  icon={icon}
                  badgeKey={badgeKey}
                  badgeLabel={badgeKey ? t(`app.nav.${badgeKey}`) : undefined}
                  active={pathname.startsWith(path)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section at the very bottom */}
      <div className="border-t border-border px-3 py-3">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          {collapsed ? (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    className={cn(
                      "flex w-full items-center justify-center rounded-xl py-2 transition-colors hover:bg-muted",
                      popoverOpen && "bg-muted",
                    )}
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--upz-nav-brand)] text-xs font-bold text-white shadow-sm">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                  </motion.button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="font-semibold">
                {user.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            <PopoverTrigger asChild>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted",
                  popoverOpen && "bg-muted",
                )}
              >
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[var(--upz-nav-brand)] text-xs font-bold text-white shadow-sm">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="min-w-0 truncate text-sm font-semibold text-foreground">{user.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t(`app.professions.${user.profession}`, PROFESSION_LABELS[user.profession])}
                  </p>
                </div>
                <ChevronUp
                  className={cn(
                    "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
                    popoverOpen && "rotate-180",
                  )}
                />
              </motion.button>
            </PopoverTrigger>
          )}
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-52 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-overlay"
          >
            <div className="p-1.5">
              {menuItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => { setPopoverOpen(false); onNavigate?.(); }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.07]",
                    pathname.startsWith(href) && "bg-[var(--upz-nav-accent)] text-[var(--upz-nav-navy)] dark:bg-white/[0.08] dark:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                onClick={() => { setPopoverOpen(false); onLogout(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                {t("app.nav.logout")}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}
