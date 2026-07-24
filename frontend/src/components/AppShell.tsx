import { Bell, BookOpen, Check, ChevronDown, GraduationCap, Languages, LayoutDashboard, LogOut, Menu, MessageCircle, Moon, Settings, Sun, UserRound, Video, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { Avatar, Logo } from "./ui";

type Locale = "uz" | "ru" | "en" | "tr";
type TextKey = "home" | "chat" | "meetings" | "library" | "education" | "profile" | "systemOnline" | "realtime" | "workspace" | "logout" | "settings" | "notifications" | "language" | "openMenu" | "closeMenu" | "loading";

const localeOptions: { value: Locale; short: string; label: string }[] = [
  { value: "uz", short: "UZ", label: "O‘zbekcha" },
  { value: "ru", short: "RU", label: "Русский" },
  { value: "en", short: "EN", label: "English" },
  { value: "tr", short: "TR", label: "Türkçe" },
];

const shellText: Record<Locale, Record<TextKey, string>> = {
  uz: { home: "Bosh sahifa", chat: "Chat", meetings: "Meeting", library: "Kutubxona", education: "Ta’lim", profile: "Profil", systemOnline: "Tizim ishlayapti", realtime: "Real-time ulangan", workspace: "Workspace", logout: "Chiqish", settings: "Sozlamalar", notifications: "Bildirishnomalar", language: "Tilni o‘zgartirish", openMenu: "Menyuni ochish", closeMenu: "Menyuni yopish", loading: "Sahifa ochilmoqda" },
  ru: { home: "Главная", chat: "Чаты", meetings: "Встречи", library: "Библиотека", education: "Обучение", profile: "Профиль", systemOnline: "Система работает", realtime: "Подключено", workspace: "Пространство", logout: "Выйти", settings: "Настройки", notifications: "Уведомления", language: "Изменить язык", openMenu: "Открыть меню", closeMenu: "Закрыть меню", loading: "Страница загружается" },
  en: { home: "Home", chat: "Chat", meetings: "Meetings", library: "Library", education: "Education", profile: "Profile", systemOnline: "System online", realtime: "Real-time connected", workspace: "Workspace", logout: "Log out", settings: "Settings", notifications: "Notifications", language: "Change language", openMenu: "Open menu", closeMenu: "Close menu", loading: "Loading page" },
  tr: { home: "Ana sayfa", chat: "Sohbet", meetings: "Toplantılar", library: "Kütüphane", education: "Eğitim", profile: "Profil", systemOnline: "Sistem çalışıyor", realtime: "Gerçek zamanlı bağlı", workspace: "Çalışma alanı", logout: "Çıkış", settings: "Ayarlar", notifications: "Bildirimler", language: "Dili değiştir", openMenu: "Menüyü aç", closeMenu: "Menüyü kapat", loading: "Sayfa açılıyor" },
};

const nav: { href: string; key: TextKey; icon: typeof LayoutDashboard }[] = [
  { href: "/", key: "home", icon: LayoutDashboard },
  { href: "/chat", key: "chat", icon: MessageCircle },
  { href: "/meetings", key: "meetings", icon: Video },
  { href: "/library", key: "library", icon: BookOpen },
  { href: "/education", key: "education", icon: GraduationCap },
  { href: "/profile", key: "profile", icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [routeLoading, setRouteLoading] = useState(false);
  const [mobilePulse, setMobilePulse] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem("optima-language");
    return localeOptions.some((item) => item.value === saved) ? saved as Locale : "uz";
  });
  const [languageOpen, setLanguageOpen] = useState(false);
  const routeTimers = useRef<number[]>([]);
  const { user, workspace, workspaces, selectWorkspace, logout } = useAuth();
  const active = (href: string) => href === "/" ? location === "/" : location.startsWith(href);
  const text = shellText[locale];

  useEffect(() => () => routeTimers.current.forEach(window.clearTimeout), []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  function chooseLanguage(next: Locale) {
    localStorage.setItem("optima-language", next);
    setLocale(next);
    setLanguageOpen(false);
  }

  function openSection(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (active(href) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    routeTimers.current.forEach(window.clearTimeout);
    setMobileOpen(false);
    setRouteLoading(true);
    const mobile = window.innerWidth <= 820;
    const leavingLibrary = location.startsWith("/library");
    if (mobile) setMobilePulse(href);
    routeTimers.current = [
      window.setTimeout(() => navigate(href), leavingLibrary ? 80 : mobile ? 620 : 260),
      window.setTimeout(() => setMobilePulse(null), leavingLibrary ? 180 : mobile ? 680 : 380),
      window.setTimeout(() => setRouteLoading(false), leavingLibrary ? 260 : mobile ? 820 : 520),
    ];
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
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label={text.closeMenu}><X size={20} /></button>
        </div>
        <div className="workspace-switcher">
          <button className="workspace-button" onClick={() => setWorkspaceOpen((value) => !value)} aria-expanded={workspaceOpen}>
            <span className="workspace-avatar">{workspace?.name?.[0]?.toUpperCase() || "O"}</span>
            <span><small>{text.workspace}</small><strong>{workspace?.name || "Optima"}</strong></span>
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
        <nav className="main-nav" aria-label="Asosiy navigatsiya">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={active(item.href) ? "active" : ""} onClick={() => setMobileOpen(false)}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{text[item.key]}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>{text.systemOnline}</strong><small>{text.realtime}</small></div>
        </div>
        <div className="sidebar-profile">
          <Link href="/profile" className="profile-link">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} />
            <span><strong>{user?.firstName} {user?.lastName}</strong><small>@{user?.username}</small></span>
          </Link>
          <button className="icon-button" onClick={() => void logout()} aria-label={text.logout} title={text.logout}><LogOut size={18} /></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label={text.closeMenu} />}
      <div className="app-body">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label={text.openMenu}><Menu size={21} /></button>
          <div className="topbar-context"><Logo /><span className="topbar-divider" /><strong>{text[nav.find((item) => active(item.href))?.key || "home"]}</strong><small>{workspace?.name}</small></div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? "Dark theme’ga o‘tish" : "Light theme’ga o‘tish"} title={theme === "light" ? "Dark theme" : "Light theme"}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</button>
            <div className="language-switcher">
              <button className="icon-button" onClick={() => setLanguageOpen((value) => !value)} aria-label={text.language} title={text.language} aria-expanded={languageOpen}>
                <Languages size={19} />
                <span className="language-code">{locale.toUpperCase()}</span>
              </button>
              {languageOpen && (
                <div className="language-menu" role="menu">
                  {localeOptions.map((option) => (
                    <button key={option.value} onClick={() => chooseLanguage(option.value)} role="menuitem">
                      <span><strong>{option.short}</strong>{option.label}</span>
                      {locale === option.value && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="icon-button topbar-notifications" aria-label={text.notifications} title={text.notifications}><Bell size={19} /></button>
            <Link href="/profile" className="icon-button" aria-label={text.settings} title={text.settings}><Settings size={19} /></Link>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <nav className="desktop-dock" aria-label="Asosiy navigatsiya">
        {nav.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={(event) => openSection(event, item.href)} className={active(item.href) ? "active" : ""} data-label={text[item.key]} aria-label={text[item.key]}><Icon size={21} strokeWidth={1.9} /></Link>;
        })}
      </nav>
      <nav className="mobile-nav" aria-label="Mobil navigatsiya">
        {nav.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={(event) => openSection(event, item.href)} className={`${active(item.href) ? "active" : ""} ${mobilePulse === item.href ? "tap-pulse" : ""}`}><Icon size={20} /><span>{text[item.key]}</span></Link>;
        })}
      </nav>
      {routeLoading && <div className="route-loader" role="status" aria-label={text.loading}><div className="route-loader-mark" aria-hidden="true"><i /><i /><i /></div><strong>OPTIMA</strong></div>}
    </div>
  );
}
