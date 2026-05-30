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
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@/types";
import { PROFESSION_LABELS } from "@/data/mockData";
import { cn } from "@/lib/utils";

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

export function Sidebar({ user, onLogout, collapsed = false, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const [location] = useLocation();

  return (
    <aside
      className="flex h-full flex-col border-r border-[#E5E7EB] bg-white shadow-sm"
      style={{ width: collapsed ? 76 : 272, transition: "width 0.2s ease", flexShrink: 0 }}
    >
      <div className="border-b border-[#E5E7EB] px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 shadow-sm shadow-indigo-200">
            <Zap className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block text-sm font-bold tracking-wide text-[#111827]">Optima</span>
              <span className="block truncate text-xs text-[#6B7280]">Optima</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-3 ring-1 ring-indigo-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">{t("app.nav.zoneHealth")}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-600">88%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white">
              <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-indigo-500 to-blue-500" />
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.titleKey} className="mb-4 last:mb-0">
            {!collapsed && (
              <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
                {t(`app.nav.${group.titleKey}`)}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map(({ path, labelKey, icon: Icon, badgeKey }) => {
                const active = location === path || (path !== "/app/home" && location.startsWith(path + "/"));
                const label = t(`app.nav.${labelKey}`);
                return (
                  <Link key={path} href={path}>
                    <motion.div
                      onClick={onNavigate}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
                        collapsed && "justify-center",
                      )}
                      style={{ background: active ? "#EEF2FF" : "transparent", color: active ? "#4F46E5" : "#6B7280" }}
                      whileHover={{ background: active ? "#EEF2FF" : "#F7FAFC", color: active ? "#4F46E5" : "#111827" }}
                      transition={{ duration: 0.15 }}
                      title={collapsed ? label : undefined}
                    >
                      {active && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-indigo-500"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        />
                      )}
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                      {!collapsed && badgeKey && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600">{t(`app.nav.${badgeKey}`)}</span>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#E5E7EB] px-3 py-4">
        {!collapsed && (
          <div className="mb-3 rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-[#111827]">{user.name}</p>
              <span className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-2 py-0.5 text-[10px] font-black text-white">{t("app.nav.pro")}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-[#6B7280]">{t(`app.professions.${user.profession}`, PROFESSION_LABELS[user.profession])}</p>
          </div>
        )}
        <motion.button
          type="button"
          onClick={onLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-[#6B7280] transition-colors hover:bg-rose-50 hover:text-rose-600",
            collapsed && "justify-center",
          )}
          whileTap={{ scale: 0.98 }}
          title={collapsed ? t("app.nav.logout") : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{t("app.nav.logout")}</span>}
        </motion.button>
      </div>
    </aside>
  );
}
