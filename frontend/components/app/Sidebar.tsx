import type { ComponentType } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  Crown,
  Home,
  LayoutDashboard,
  Layers,
  ListTodo,
  LogOut,
  MessageCircle,
  Newspaper,
  Settings,
  User,
  Users,
  Video,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@/types";
import { PROFESSION_LABELS } from "@/data/mockData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "./DesignSystem";

const SIDEBAR_WIDTH_EXPANDED = 272;
const SIDEBAR_WIDTH_COLLAPSED = 68;

const NAV_GROUPS = [
  {
    titleKey: "core",
    items: [
      { path: "/app/home", labelKey: "home", icon: Home },
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
  {
    titleKey: "account",
    items: [
      { path: "/app/profile", labelKey: "profile", icon: User },
      { path: "/app/settings", labelKey: "settings", icon: Settings },
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
              "font-semibold text-indigo-700 dark:text-white",
              collapsed
                ? ""
                : "bg-indigo-50/70 pl-6 dark:bg-white/[0.08]",
            )
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-slate-100",
      )}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
    >
      {active && collapsed && (
        <span className="absolute inset-1 rounded-lg bg-indigo-50 dark:bg-white/10" aria-hidden />
      )}

      {active && !collapsed && (
        <span
          className="absolute left-3.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-indigo-500 dark:bg-indigo-400"
          aria-hidden
        />
      )}

      <Icon
        className={cn(
          "relative z-[1] h-[18px] w-[18px] flex-shrink-0 transition-colors",
          active
            ? "text-indigo-600 dark:text-indigo-300"
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
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200"
                  : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300",
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

  const logoutButton = (
    <motion.button
      type="button"
      onClick={onLogout}
      className={cn(
        "flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-300 dark:hover:bg-rose-500/15 dark:hover:text-rose-400",
        collapsed && "justify-center px-0",
      )}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
    >
      <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
      {!collapsed && <span>{t("app.nav.logout")}</span>}
    </motion.button>
  );

  return (
    <aside
      className="flex h-full flex-col border-r border-border bg-sidebar shadow-sm"
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        transition: "width 0.2s ease",
        flexShrink: 0,
      }}
    >
      <div className="border-b border-border px-3 py-5">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 shadow-sm shadow-indigo-200">
            <Zap className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block text-sm font-bold tracking-wide text-foreground">UPZ</span>
              <span className="block truncate text-xs text-muted-foreground">Universal Productivity Zone</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-3 ring-1 ring-indigo-100 dark:from-indigo-500/15 dark:to-blue-500/15 dark:ring-indigo-500/25">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">{t("app.nav.zoneHealth")}</span>
              <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">88%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/60 dark:bg-white/10">
              <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-indigo-500 to-blue-500" />
            </div>
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
              <div className="sticky top-0 z-10 -mx-1 mb-2.5 bg-sidebar/95 px-1 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.26em] text-muted-foreground/60 backdrop-blur-sm">
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

      <div className="border-t border-border px-3 py-4">
        {!collapsed && (
          <div className="mb-3 rounded-2xl bg-muted p-3 ring-1 ring-border">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">{user.name}</p>
              <span className="flex-shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-2 py-0.5 text-[10px] font-black text-white">{t("app.nav.pro")}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{t(`app.professions.${user.profession}`, PROFESSION_LABELS[user.profession])}</p>
          </div>
        )}
        {collapsed ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>{logoutButton}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="font-semibold">
              {t("app.nav.logout")}
            </TooltipContent>
          </Tooltip>
        ) : (
          logoutButton
        )}
      </div>
    </aside>
  );
}
