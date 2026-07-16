import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, MessageCircle, Moon, Settings, Sun, UserRound, Video, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { Avatar, Logo } from "./ui";

const nav = [
  { href: "/", label: "Bosh sahifa", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/meetings", label: "Meeting", icon: Video },
  { href: "/profile", label: "Profil", icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [routeLoading, setRouteLoading] = useState(false);
  const [mobilePulse, setMobilePulse] = useState<string | null>(null);
  const routeTimers = useRef<number[]>([]);
  const { user, workspace, workspaces, selectWorkspace, logout } = useAuth();
  const active = (href: string) => href === "/" ? location === "/" : location.startsWith(href);

  useEffect(() => () => routeTimers.current.forEach(window.clearTimeout), []);

  function openSection(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (active(href) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    routeTimers.current.forEach(window.clearTimeout);
    setMobileOpen(false);
    setRouteLoading(true);
    if (window.innerWidth <= 820) setMobilePulse(href);
    routeTimers.current = [
      window.setTimeout(() => navigate(href), 260),
      window.setTimeout(() => setMobilePulse(null), 380),
      window.setTimeout(() => setRouteLoading(false), 520),
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
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Menyuni yopish"><X size={20} /></button>
        </div>
        <div className="workspace-switcher">
          <button className="workspace-button" onClick={() => setWorkspaceOpen((value) => !value)} aria-expanded={workspaceOpen}>
            <span className="workspace-avatar">{workspace?.name?.[0]?.toUpperCase() || "O"}</span>
            <span><small>Workspace</small><strong>{workspace?.name || "Optima"}</strong></span>
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
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>Tizim ishlayapti</strong><small>Real-time ulangan</small></div>
        </div>
        <div className="sidebar-profile">
          <Link href="/profile" className="profile-link">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} />
            <span><strong>{user?.firstName} {user?.lastName}</strong><small>@{user?.username}</small></span>
          </Link>
          <button className="icon-button" onClick={() => void logout()} aria-label="Chiqish" title="Chiqish"><LogOut size={18} /></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Menyuni yopish" />}
      <div className="app-body">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label="Menyuni ochish"><Menu size={21} /></button>
          <div className="topbar-context"><Logo /><span className="topbar-divider" /><strong>{nav.find((item) => active(item.href))?.label || "Optima"}</strong><small>{workspace?.name}</small></div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? "Dark theme’ga o‘tish" : "Light theme’ga o‘tish"} title={theme === "light" ? "Dark theme" : "Light theme"}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</button>
            <button className="icon-button" aria-label="Bildirishnomalar" title="Bildirishnomalar"><Bell size={19} /></button>
            <Link href="/profile" className="icon-button" aria-label="Sozlamalar" title="Sozlamalar"><Settings size={19} /></Link>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <nav className="desktop-dock" aria-label="Asosiy navigatsiya">
        {nav.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={(event) => openSection(event, item.href)} className={active(item.href) ? "active" : ""} data-label={item.label} aria-label={item.label}><Icon size={21} strokeWidth={1.9} /></Link>;
        })}
      </nav>
      <nav className="mobile-nav" aria-label="Mobil navigatsiya">
        {nav.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={(event) => openSection(event, item.href)} className={`${active(item.href) ? "active" : ""} ${mobilePulse === item.href ? "tap-pulse" : ""}`}><Icon size={20} /><span>{item.label}</span></Link>;
        })}
      </nav>
      {routeLoading && <div className="route-loader" role="status" aria-label="Sahifa ochilmoqda"><div className="route-loader-mark" aria-hidden="true"><i /><i /><i /></div><strong>OPTIMA</strong></div>}
    </div>
  );
}
