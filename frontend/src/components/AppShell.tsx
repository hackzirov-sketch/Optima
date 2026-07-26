import { Bell, BookOpen, Check, ChevronDown, GraduationCap, LayoutDashboard, LogOut, Menu, MessageCircle, Moon, Sun, UserRound, Video, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { locales, localeMeta, useI18n, type Locale } from "../lib/i18n/i18n";
import { Avatar, Logo } from "./ui";
import { FlagIcon } from "./FlagIcon";

type TextKey = "home" | "chat" | "meetings" | "library" | "education" | "profile";

const nav: { href: string; key: TextKey; icon: typeof LayoutDashboard }[] = [
  { href: "/", key: "home", icon: LayoutDashboard },
  { href: "/chat", key: "chat", icon: MessageCircle },
  { href: "/meetings", key: "meetings", icon: Video },
  { href: "/library", key: "library", icon: BookOpen },
  { href: "/education", key: "education", icon: GraduationCap },
  { href: "/profile", key: "profile", icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const { locale, setLocale, t } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const { user, workspace, workspaces, selectWorkspace, logout } = useAuth();
  const active = (href: string) => href === "/" ? location === "/" : location.startsWith(href);

  function chooseLanguage(next: Locale) {
    setLocale(next);
    setLanguageOpen(false);
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("optima-theme", next);
    setTheme(next);
  }

  return (
    <div className={`app-shell ${location.startsWith("/chat") ? "app-shell-chat" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label={t("shell.closeMenu")}><X size={20} /></button>
        </div>
        <div className="workspace-switcher">
          <button className="workspace-button" onClick={() => setWorkspaceOpen((value) => !value)} aria-expanded={workspaceOpen}>
            <span className="workspace-avatar">{workspace?.name?.[0]?.toUpperCase() || "O"}</span>
            <span><small>{t("shell.workspace")}</small><strong>{workspace?.name || "Optima"}</strong></span>
            <ChevronDown size={16} />
          </button>
          {workspaceOpen && (
            <div className="workspace-menu">
              {workspaces.map((item) => (
                <button key={item.id} onClick={() => { selectWorkspace(item); setWorkspaceOpen(false); }} className={item.id === workspace?.id ? "selected" : ""}>
                  <span className="workspace-avatar workspace-avatar-sm">{item.name[0]?.toUpperCase()}</span>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="main-nav" aria-label={t("shell.mainNav")}>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={active(item.href) ? "active" : ""} onClick={() => setMobileOpen(false)}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{t(`shell.${item.key}`)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>{t("shell.systemOnline")}</strong><small>{t("shell.realtime")}</small></div>
        </div>
        <div className="sidebar-profile">
          <Link href="/profile" className="profile-link">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} />
            <span><strong>{user?.firstName} {user?.lastName}</strong><small>@{user?.username}</small></span>
          </Link>
          <button className="icon-button" onClick={() => void logout()} aria-label={t("shell.logout")} title={t("shell.logout")}><LogOut size={18} /></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label={t("shell.closeMenu")} />}
      <div className="app-body">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label={t("shell.openMenu")}><Menu size={21} /></button>
          <div className="topbar-context"><Logo /><span className="topbar-divider" /><strong>{t(`shell.${nav.find((item) => active(item.href))?.key || "home"}`)}</strong><small>{workspace?.name}</small></div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? t("shell.themeToDark") : t("shell.themeToLight")} title={theme === "light" ? t("shell.themeDark") : t("shell.themeLight")}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</button>
            <div className="language-switcher">
              <button className="icon-button language-toggle" onClick={() => setLanguageOpen((value) => !value)} aria-label={t("shell.language")} title={t("shell.language")} aria-expanded={languageOpen}>
                <FlagIcon locale={locale} />
                <span className="language-code">{localeMeta[locale].short}</span>
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
            <button className="icon-button topbar-notifications" aria-label={t("shell.notifications")} title={t("shell.notifications")}><Bell size={19} /></button>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <nav className="desktop-dock" aria-label={t("shell.mainNav")}>
        <span className="dock-indicator" style={{ transform: `translateX(${nav.findIndex((item) => active(item.href)) * 50}px)`, opacity: nav.some((item) => active(item.href)) ? 1 : 0 }} aria-hidden="true" />
        {nav.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={active(item.href) ? "active" : ""} data-label={t(`shell.${item.key}`)} aria-label={t(`shell.${item.key}`)}><Icon size={21} strokeWidth={1.9} /></Link>;
        })}
      </nav>
      <nav className="mobile-nav" aria-label={t("shell.mobileNav")}>
        {nav.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={active(item.href) ? "active" : ""}><Icon size={20} /><span>{t(`shell.${item.key}`)}</span></Link>;
        })}
      </nav>
    </div>
  );
}
