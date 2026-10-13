import { Activity, Ban, Bot, CalendarClock, LoaderCircle, LogIn, Megaphone, Radio, RefreshCw, Search, ShieldCheck, Undo2, UserPlus, Users, UsersRound, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, type AdminAuditEntry, type AdminChatRequest, type AdminMeeting, type AdminMeetingRequest, type AdminOverview, type AdminRoom, type AdminUser } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { Avatar } from "../components/ui";
import { useToast } from "../components/Toast";

type Tab = "overview" | "users" | "rooms" | "requests" | "meetings" | "audit";

/**
 * Optima's admin panel (super admins only — the server checks every call).
 * Blocking never deletes: accounts and groups/channels are switched off and
 * can be switched back on; every action lands in the audit log.
 */
export function AdminPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { show } = useToast();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<{ total: number; items: AdminUser[] } | null>(null);
  const [rooms, setRooms] = useState<{ total: number; items: AdminRoom[] } | null>(null);
  const [requests, setRequests] = useState<{ chat: AdminChatRequest[]; meeting: AdminMeetingRequest[] } | null>(null);
  const [meetings, setMeetings] = useState<AdminMeeting[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [roomType, setRoomType] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  const load = useCallback(() => {
    const fail = (error: unknown) => show(error instanceof Error ? error.message : "Error", "error");
    if (tab === "overview") api.admin.overview().then(setOverview).catch(fail);
    if (tab === "users") api.admin.users(query, filter, page).then(setUsers).catch(fail);
    if (tab === "rooms") api.admin.rooms(query, roomType, filter, page).then(setRooms).catch(fail);
    if (tab === "requests") api.admin.requests().then(setRequests).catch(fail);
    if (tab === "meetings") api.admin.meetings().then(setMeetings).catch(fail);
    if (tab === "audit") api.admin.audit(page).then(setAudit).catch(fail);
  }, [tab, query, filter, roomType, page, show]);

  useEffect(() => {
    const timer = window.setTimeout(load, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);
  // The overview keeps itself current.
  useEffect(() => {
    if (tab !== "overview") return;
    const timer = window.setInterval(() => api.admin.overview().then(setOverview).catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [tab]);

  if (!user?.isSuperAdmin) return <div className="page admin-page"><p className="admin-empty"><ShieldCheck size={22} />403</p></div>;

  async function act(key: string, work: () => Promise<unknown>) {
    setBusy(key);
    try { await work(); show(t("admin.done")); load(); } catch (error) { show(error instanceof Error ? error.message : "Error", "error"); } finally { setBusy(null); }
  }
  const askReason = () => {
    const reason = window.prompt(t("admin.blockReason"));
    return reason === null ? null : reason.trim();
  };

  const tabs: Array<[Tab, string, typeof Activity]> = [
    ["overview", t("admin.tabOverview"), Activity],
    ["users", t("admin.tabUsers"), Users],
    ["rooms", t("admin.tabRooms"), UsersRound],
    ["requests", t("admin.tabRequests"), UserPlus],
    ["meetings", t("admin.tabMeetings"), Video],
    ["audit", t("admin.tabAudit"), CalendarClock],
  ];
  const switchTab = (next: Tab) => { setTab(next); setQuery(""); setFilter(""); setRoomType(""); setPage(1); };
  const total = tab === "users" ? users?.total ?? 0 : tab === "rooms" ? rooms?.total ?? 0 : 0;

  return <div className="page admin-page">
    <header className="admin-head">
      <span className="admin-head-icon"><ShieldCheck size={24} /></span>
      <div><h1>{t("admin.title")}</h1><p>{t("admin.subtitle")}</p></div>
      <button type="button" className="admin-refresh" onClick={load} aria-label="Refresh"><RefreshCw size={18} /></button>
    </header>
    <nav className="admin-tabs" role="tablist">
      {tabs.map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => switchTab(id)}><Icon size={17} />{label}</button>)}
    </nav>

    {(tab === "users" || tab === "rooms") && <div className="admin-toolbar">
      <label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("admin.search")} /></label>
      <div className="admin-chips">
        {[["", t("admin.filterAll")], ...(tab === "users" ? [["online", t("admin.filterOnline")]] : []), ["blocked", t("admin.filterBlocked")]].map(([value, label]) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}
        {tab === "rooms" && [["group", t("admin.groups")], ["channel", t("admin.channels")]].map(([value, label]) => <button key={`t${value}`} type="button" className={`type ${roomType === value ? "active" : ""}`} onClick={() => { setRoomType((current) => current === value ? "" : value); setPage(1); }}>{label}</button>)}
      </div>
    </div>}

    {tab === "overview" && (overview ? <div className="admin-stats">
      <article className="accent"><span><Radio size={18} />{t("admin.onlineNow")}</span><strong>{overview.onlineNow}</strong></article>
      <article><span><Users size={18} />{t("admin.usersTotal")}</span><strong>{overview.users.total}</strong><small>{t("admin.activeToday")}: {overview.users.activeToday} · {t("admin.newToday")}: {overview.users.newToday}</small></article>
      <article><span><UsersRound size={18} />{t("admin.groups")}</span><strong>{overview.rooms.groups}</strong></article>
      <article><span><Megaphone size={18} />{t("admin.channels")}</span><strong>{overview.rooms.channels}</strong></article>
      <article><span><Video size={18} />{t("admin.liveMeetings")}</span><strong>{overview.meetings.live}</strong><small>{t("admin.inCalls")}: {overview.meetings.inCalls}</small></article>
      <article><span><UserPlus size={18} />{t("admin.pendingRequests")}</span><strong>{overview.requests.chat + overview.requests.meeting}</strong></article>
      <article><span><Bot size={18} />{t("admin.aiToday")}</span><strong>{overview.ai.messagesToday}</strong></article>
      <article className="danger"><span><Ban size={18} />{t("admin.blocked")}</span><strong>{overview.users.blocked + overview.rooms.blocked}</strong><small>{t("admin.usersTotal")}: {overview.users.blocked} · {t("admin.groups")}/{t("admin.channels")}: {overview.rooms.blocked}</small></article>
    </div> : <div className="admin-empty"><LoaderCircle className="spin" size={22} /></div>)}

    {tab === "users" && (users ? <div className="admin-list">
      {users.items.length === 0 && <p className="admin-empty">{t("admin.empty")}</p>}
      {users.items.map((item) => <article key={item.id} className={item.blockedAt ? "is-blocked" : ""}>
        <span className="admin-avatar"><Avatar firstName={item.firstName} lastName={item.lastName} url={item.avatarUrl} size="sm" />{item.online && <i />}</span>
        <span className="admin-main"><strong>{item.firstName} {item.lastName}{item.superAdmin && <em>{t("admin.you")}</em>}</strong><small>{item.username ? `@${item.username} · ` : ""}{item.email}</small><small>{item.online ? t("admin.filterOnline") : t("admin.lastSeen", { when: when(item.lastSeen) })}{item.blockedAt ? ` · ${t("admin.blocked")} ${when(item.blockedAt)}${item.blockedReason ? ` — ${item.blockedReason}` : ""}` : ""}</small></span>
        {!item.superAdmin && (item.blockedAt
          ? <button type="button" className="admin-btn" disabled={busy === item.id} onClick={() => void act(item.id, () => api.admin.unblockUser(item.id))}><Undo2 size={16} />{t("admin.unblock")}</button>
          : <button type="button" className="admin-btn danger" disabled={busy === item.id} onClick={() => { const reason = askReason(); if (reason !== null) void act(item.id, () => api.admin.blockUser(item.id, reason || undefined)); }}><Ban size={16} />{t("admin.block")}</button>)}
      </article>)}
    </div> : <div className="admin-empty"><LoaderCircle className="spin" size={22} /></div>)}

    {tab === "rooms" && (rooms ? <div className="admin-list">
      {rooms.items.length === 0 && <p className="admin-empty">{t("admin.empty")}</p>}
      {rooms.items.map((room) => <article key={room.id} className={room.blockedAt ? "is-blocked" : ""}>
        <span className="admin-room-icon">{room.type === "channel" ? <Megaphone size={18} /> : <UsersRound size={18} />}</span>
        <span className="admin-main"><strong>{room.name || "—"}<em className="scope">{room.scope}</em></strong><small>{t("admin.members", { count: room.memberCount })}{room.ownerFirstName ? ` · ${room.ownerFirstName} ${room.ownerLastName ?? ""}` : ""}{room.pendingRequests ? ` · ${t("admin.pendingRequests")}: ${room.pendingRequests}` : ""}</small>{room.blockedAt && <small>{t("admin.blocked")} {when(room.blockedAt)}{room.blockedReason ? ` — ${room.blockedReason}` : ""}</small>}</span>
        <span className="admin-actions">
          <button type="button" className="admin-btn" disabled={busy === `j${room.id}`} onClick={() => void act(`j${room.id}`, async () => { await api.admin.joinRoom(room.id); navigate(`/chat?room=${room.id}`); })}><LogIn size={16} />{t("admin.join")}</button>
          {room.blockedAt
            ? <button type="button" className="admin-btn" disabled={busy === room.id} onClick={() => void act(room.id, () => api.admin.unblockRoom(room.id))}><Undo2 size={16} />{t("admin.unblock")}</button>
            : <button type="button" className="admin-btn danger" disabled={busy === room.id} onClick={() => { const reason = askReason(); if (reason !== null) void act(room.id, () => api.admin.blockRoom(room.id, reason || undefined)); }}><Ban size={16} />{t("admin.block")}</button>}
        </span>
      </article>)}
    </div> : <div className="admin-empty"><LoaderCircle className="spin" size={22} /></div>)}

    {tab === "requests" && (requests ? <div className="admin-columns">
      <section><h2><UsersRound size={18} />{t("admin.chatRequests")} <b>{requests.chat.length}</b></h2>
        <div className="admin-list compact">{requests.chat.length === 0 && <p className="admin-empty">{t("admin.empty")}</p>}
          {requests.chat.map((item) => <article key={item.id}><span className="admin-main"><strong>{item.firstName} {item.lastName}</strong><small>→ {item.roomName} · {when(item.createdAt)}</small></span></article>)}</div></section>
      <section><h2><Video size={18} />{t("admin.meetingRequests")} <b>{requests.meeting.length}</b></h2>
        <div className="admin-list compact">{requests.meeting.length === 0 && <p className="admin-empty">{t("admin.empty")}</p>}
          {requests.meeting.map((item) => <article key={item.id}><span className="admin-main"><strong>{item.firstName} {item.lastName}</strong><small>→ {item.meetingTitle} ({item.code}) · {when(item.createdAt)}</small></span><button type="button" className="admin-btn" onClick={() => navigate(`/meet/${item.code}`)}><LogIn size={16} />{t("admin.join")}</button></article>)}</div></section>
    </div> : <div className="admin-empty"><LoaderCircle className="spin" size={22} /></div>)}

    {tab === "meetings" && (meetings ? <div className="admin-list">
      {meetings.length === 0 && <p className="admin-empty">{t("admin.empty")}</p>}
      {meetings.map((item) => <article key={item.id}>
        <span className="admin-room-icon live"><Video size={18} /></span>
        <span className="admin-main"><strong>{item.title}<em className="scope">{item.code}</em></strong><small>{item.hostFirstName} {item.hostLastName} · {t("admin.participants", { count: item.participants })} · {when(item.startTime)}</small></span>
        <button type="button" className="admin-btn" onClick={() => navigate(`/meet/${item.code}`)}><LogIn size={16} />{t("admin.join")}</button>
      </article>)}
    </div> : <div className="admin-empty"><LoaderCircle className="spin" size={22} /></div>)}

    {tab === "audit" && (audit ? <div className="admin-list compact">
      {audit.length === 0 && <p className="admin-empty">{t("admin.empty")}</p>}
      {audit.map((item) => <article key={item.id}>
        <span className={`admin-room-icon ${item.action.endsWith("block") && !item.action.endsWith("unblock") ? "danger" : ""}`}>{item.action.includes("join") ? <LogIn size={16} /> : item.action.includes("unblock") ? <Undo2 size={16} /> : <Ban size={16} />}</span>
        <span className="admin-main"><strong>{item.action} · {item.targetName ?? item.targetId}</strong><small>{item.actorFirstName} {item.actorLastName} · {when(item.createdAt)}{item.details?.reason ? ` — ${item.details.reason}` : ""}</small></span>
      </article>)}
    </div> : <div className="admin-empty"><LoaderCircle className="spin" size={22} /></div>)}

    {(tab === "users" || tab === "rooms" || tab === "audit") && <div className="admin-pager">
      <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("admin.prev")}</button>
      <span>{page}{total ? ` / ${Math.max(1, Math.ceil(total / 20))}` : ""}</span>
      <button type="button" disabled={tab === "audit" ? (audit?.length ?? 0) < 20 : page * 20 >= total} onClick={() => setPage((value) => value + 1)}>{t("admin.next")}</button>
    </div>}
  </div>;
}
