import { BarChart3, BookOpen, BrainCircuit, Check, ChevronDown, Crown, Globe2, GraduationCap, LayoutDashboard, LogOut, Megaphone, Menu, MessageCircle, Moon, Settings, Sun, UserRound, UsersRound, Video, X, Youtube } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { useUnreadTotal } from "../lib/chatUnread";
import { locales, localeMeta, useI18n, type Locale } from "../lib/i18n/i18n";
import { setMyPresenceStatus, type PresenceStatus } from "../lib/presence";
import { Avatar, DisplayName, Logo } from "./ui";
import { FlagIcon } from "./FlagIcon";
import { NotificationsMenu } from "./NotificationsMenu";
import { useOutsideClose } from "../lib/useOutsideClose";

const STATUS_OPTIONS: Array<{ value: Exclude<PresenceStatus, "offline" | "in_meeting">; dotClass: string }> = [
  { value: "online", dotClass: "status-dot-online" },
  { value: "away", dotClass: "status-dot-away" },
  { value: "busy", dotClass: "status-dot-busy" },
  { value: "dnd", dotClass: "status-dot-dnd" },
  { value: "invisible", dotClass: "status-dot-invisible" },
];

type TextKey = "home" | "chat" | "meetings" | "statistics" | "ai" | "youtube" | "library" | "education" | "profile";

const nav: { href: string; key: TextKey; icon: typeof LayoutDashboard }[] = [
  { href: "/", key: "home", icon: LayoutDashboard },
  { href: "/chat", key: "chat", icon: MessageCircle },
  { href: "/meetings", key: "meetings", icon: Video },
  { href: "/statistics", key: "statistics", icon: BarChart3 },
  { href: "/ai", key: "ai", icon: BrainCircuit },
  { href: "/youtube", key: "youtube", icon: Youtube },
  { href: "/library", key: "library", icon: BookOpen },
  { href: "/education", key: "education", icon: GraduationCap },
  { href: "/profile", key: "profile", icon: UserRound },
];

/** The phone drawer: the destinations people reach from the menu button. */
type DrawerKey = TextKey | "channels" | "groups" | "settings";
const drawerNav: { href: string; key: DrawerKey; icon: typeof LayoutDashboard; activeKey?: TextKey }[] = [
  { href: "/", key: "home", icon: LayoutDashboard },
  { href: "/chat", key: "chat", icon: MessageCircle },
  { href: "/chat?tab=channel", key: "channels", icon: Megaphone },
  { href: "/chat?tab=group", key: "groups", icon: UsersRound },
  { href: "/meetings", key: "meetings", icon: Video },
  { href: "/ai", key: "ai", icon: BrainCircuit },
  { href: "/statistics", key: "statistics", icon: BarChart3 },
  { href: "/youtube", key: "youtube", icon: Youtube },
  { href: "/library", key: "library", icon: BookOpen },
  { href: "/education", key: "education", icon: GraduationCap },
  { href: "/profile", key: "settings", icon: Settings, activeKey: "profile" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupOpen, setWorkspaceOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const { locale, setLocale, t } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const { user, group, groups, selectWorkspace, logout } = useAuth();
  const unreadTotal = useUnreadTotal();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClose(groupMenuRef, groupOpen, () => setWorkspaceOpen(false));
  useOutsideClose(languageMenuRef, languageOpen, () => setLanguageOpen(false));
  useOutsideClose(statusMenuRef, statusMenuOpen, () => setStatusMenuOpen(false));
  useEffect(() => {
    setMobileOpen(false);
    setWorkspaceOpen(false);
    setLanguageOpen(false);
    setStatusMenuOpen(false);
  }, [location]);
  useEffect(() => {
    const closeDrawer = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeDrawer);
    return () => window.removeEventListener("keydown", closeDrawer);
  }, []);
  // Not read back from the server: /chat/presence masks INVISIBLE -> OFFLINE
  // for everyone (including the owner) since it can't tell who's asking, so
  // the only reliable "what did I pick" source is the choice itself.
  const [myStatus, setMyStatus] = useState<Exclude<PresenceStatus, "offline" | "in_meeting">>("online");
  const active = (href: string) =>
    href === "/"
      ? location === "/"
      : href === "/chat"
        ? /^\/(chat|u|g|ch)(\/|$)/.test(location)
        : location.startsWith(href);
  const dockItems = nav.map((item) => {
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} data-nav={item.key}
      className={`${active(item.href) ? "active" : ""} ${item.key === "ai" ? "dock-ai" : ""}`}
      aria-label={t(`shell.${item.key}`)} title={t(`shell.${item.key}`)}
      aria-current={active(item.href) ? "page" : undefined}>
      <span className="dock-icon"><Icon size={22} strokeWidth={1.8} /></span>
      {item.key === "chat" && unreadTotal > 0 && <b className="dock-badge">{unreadTotal > 99 ? "99+" : unreadTotal}</b>}
      <span className="dock-label">{t(`shell.${item.key}`)}</span>
    </Link>;
  });

  function chooseLanguage(next: Locale) {
    setLocale(next);
    setLanguageOpen(false);
  }

  function chooseStatus(status: Exclude<PresenceStatus, "offline" | "in_meeting">) {
    setMyStatus(status);
    setMyPresenceStatus(status);
    setStatusMenuOpen(false);
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("optima-theme", next);
    setTheme(next);
  }

  return (
    <div className={`app-shell ${/^\/(chat|u|g|ch)(\/|$)/.test(location) ? "app-shell-chat" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo compact />
          <span className="drawer-brand-copy"><strong>Optima</strong><span>{t("shell.brandLine")}</span><small>{t("shell.brandTagline")}</small></span>
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label={t("shell.closeMenu")}><X size={20} /></button>
        </div>
        <div className="group-switcher" ref={groupMenuRef}>
          <button className="group-button" onClick={() => setWorkspaceOpen((value) => !value)} aria-expanded={groupOpen}>
            <span className="group-avatar">{group?.name?.[0]?.toUpperCase() || "O"}</span>
            <span><small>{t("shell.group")}</small><strong>{group?.name || "Optima"}</strong></span>
            <ChevronDown size={16} />
          </button>
          {groupOpen && (
            <div className="group-menu">
              {groups.map((item) => (
                <button key={item.id} onClick={() => { selectWorkspace(item); setWorkspaceOpen(false); }} className={item.id === group?.id ? "selected" : ""}>
                  <span className="group-avatar group-avatar-sm">{item.name[0]?.toUpperCase()}</span>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="main-nav" aria-label={t("shell.mainNav")}>
          {drawerNav.map((item) => {
            const Icon = item.icon;
            const isTab = item.href.includes("?tab=");
            const on = isTab ? false : active(item.href.split("?")[0]);
            return (
              <Link key={item.href} href={item.href} className={on ? "active" : ""} aria-current={on ? "page" : undefined} onClick={() => setMobileOpen(false)}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{t(`shell.${item.key}`)}</span>
                {item.key === "chat" && unreadTotal > 0 && <b className="drawer-badge">{unreadTotal > 99 ? "99+" : unreadTotal}</b>}
              </Link>
            );
          })}
        </nav>
        <div className="drawer-promo" aria-label="Honey IT Club">
          <strong><Crown size={18} /> Honey IT Club</strong>
          <span>{t("shell.promoText")}</span>
          <Globe2 className="drawer-promo-art" size={64} strokeWidth={1.2} aria-hidden="true" />
        </div>
        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>{t("shell.systemOnline")}</strong><small>{t("shell.realtime")}</small></div>
        </div>
        <div className="sidebar-profile">
          <Link href="/profile" className="profile-link">
            <span className="profile-link-avatar-wrap">
              <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} />
              <i className={`status-dot status-dot-${myStatus}`} aria-hidden="true" />
            </span>
            <span><strong><DisplayName firstName={user?.firstName} lastName={user?.lastName} nickname={user?.nickname} nameEmoji={user?.nameEmoji} /></strong><small>@{user?.username}</small></span>
          </Link>
          <div className="status-picker" ref={statusMenuRef}>
            <button className="icon-button" onClick={() => setStatusMenuOpen((value) => !value)} aria-label={t("shell.statusPicker")} title={t(`presence.${myStatus === "dnd" ? "dnd" : myStatus}`)} aria-expanded={statusMenuOpen}>
              <i className={`status-dot status-dot-${myStatus}`} aria-hidden="true" />
            </button>
            {statusMenuOpen && (
              <div className="status-menu" role="menu">
                {STATUS_OPTIONS.map((option) => (
                  <button key={option.value} onClick={() => chooseStatus(option.value)} role="menuitem">
                    <i className={`status-dot status-dot-${option.value}`} aria-hidden="true" />
                    <span>{t(`presence.${option.value}`)}</span>
                    {myStatus === option.value && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="icon-button" onClick={() => void logout()} aria-label={t("shell.logout")} title={t("shell.logout")}><LogOut size={18} /></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label={t("shell.closeMenu")} />}
      <div className="app-body">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label={t("shell.openMenu")}><Menu size={21} /></button>
          <div className="topbar-context"><Logo /><span className="topbar-divider" /><strong>{t(`shell.${nav.find((item) => active(item.href))?.key || "home"}`)}</strong><small>{group?.name}</small></div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? t("shell.themeToDark") : t("shell.themeToLight")} title={theme === "light" ? t("shell.themeDark") : t("shell.themeLight")}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</button>
            <div className="language-switcher" ref={languageMenuRef}>
              <button className="icon-button language-toggle" onClick={() => setLanguageOpen((value) => !value)} aria-label={t("shell.language")} title={t("shell.language")} aria-expanded={languageOpen}>
                <FlagIcon locale={locale} />
              </button>
              {languageOpen && (
                <div className="language-menu" role="menu">
                  {locales.map((value) => (
                    <button key={value} onClick={() => chooseLanguage(value)} role="menuitem">
                      <span><FlagIcon locale={value} />{localeMeta[value].label}</span>
                      {locale === value && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <NotificationsMenu />
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <nav className="desktop-dock reference-dock" aria-label={t("shell.mainNav")}>{dockItems}</nav>
      <nav className="mobile-nav reference-dock" aria-label={t("shell.mobileNav")}>{dockItems}</nav>
    </div>
  );
}
