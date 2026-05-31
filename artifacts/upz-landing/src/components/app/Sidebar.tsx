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
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@/types";
import { PROFESSION_LABELS } from "@/data/mockData";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  { titleKey: "core", items: [{ path: "/app/home", labelKey: "home", icon: Home }, { path: "/app/dashboard", labelKey: "dashboard", icon: LayoutDashboard }, { path: "/app/workspace", labelKey: "workspace", icon: Layers }, { path: "/app/chat", labelKey: "chat", icon: MessageCircle, badgeKey: "live" }, { path: "/app/meetings", labelKey: "meetings", icon: Video }] },
  { titleKey: "work", items: [{ path: "/app/projects", labelKey: "projects", icon: BriefcaseBusiness }, { path: "/app/teams", labelKey: "teams", icon: Building2 }, { path: "/app/tasks", labelKey: "tasks", icon: ListTodo }, { path: "/app/assistant", labelKey: "assistant", icon: Bot }] },
  { titleKey: "growth", items: [{ path: "/app/community", labelKey: "community", icon: Users }, { path: "/app/news", labelKey: "news", icon: Newspaper }, { path: "/app/bank", labelKey: "bank", icon: CreditCard }, { path: "/app/premium", labelKey: "premium", icon: Crown, badgeKey: "pro" }] },
  { titleKey: "account", items: [{ path: "/app/profile", labelKey: "profile", icon: User }, { path: "/app/settings", labelKey: "settings", icon: Settings }] },
];

interface SidebarProps {
  user: UserProfile;
  onLogout: () => void;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ user, onLogout, collapsed = false, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();

  return (
    <aside className="flex h-dvh min-h-0 flex-col border-r border-[#E5E7EB] bg-white" style={{ width: collapsed ? 76 : 272, transition: "width 0.2s ease", flexShrink: 0 }}>
      <div className="border-b border-[#E5E7EB] px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-indigo-600">
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
          <div className="mt-4 rounded-2xl bg-[#F7FAFC] p-3 ring-1 ring-[#E5E7EB]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">{t("app.nav.zoneHealth")}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-600">88%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white">
              <div className="h-full w-[88%] rounded-full bg-indigo-600" />
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.titleKey} className="mb-4 last:mb-0">
            {!collapsed && <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">{t(`app.nav.${group.titleKey}`)}</div>}
            <div className="space-y-1">
              {group.items.map(({ path, labelKey, icon: Icon, badgeKey }) => {
                const active = location === path || (path !== "/app/home" && location.startsWith(path + "/"));
                const label = t(`app.nav.${labelKey}`);
                return (
                  <button
                      key={path}
                      type="button"
                      onClick={() => {
                        navigate(path);
                        onNavigate?.();
                      }}
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[#F7FAFC] hover:text-[#111827]",
                        collapsed && "justify-center",
                        active ? "bg-indigo-50 text-indigo-700" : "text-[#6B7280]",
                      )}
                      title={collapsed ? label : undefined}
                    >
                      {active && <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-indigo-600" />}
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                      {!collapsed && badgeKey && (badgeKey !== "pro" || user.isPremium) && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600">{t(`app.nav.${badgeKey}`)}</span>
                      )}
                  </button>
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
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", user.isPremium ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600")}>{user.isPremium ? t("app.nav.pro") : "FREE"}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-[#6B7280]">{t(`app.professions.${user.profession}`, PROFESSION_LABELS[user.profession])}</p>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[#6B7280] transition-colors hover:bg-rose-50 hover:text-rose-600", collapsed && "justify-center")}
          title={collapsed ? t("app.nav.logout") : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{t("app.nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
