import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./admin.css";

/**
 * Optima admin — a separate site (https://api.honeymedia.uz/admin/) on the
 * API's own host, so the cookie of an admin signed in to Optima comes along.
 * Every call is checked by the server (SUPER_ADMIN_USER_IDS); this page only
 * shows what the API allows.
 */
const API = "/api/v1";
const OPTIMA = "https://optima.honeymedia.uz";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-UPZ-Client": "web", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || body?.message || `HTTP ${response.status}`), { status: response.status });
  return (body?.data ?? body) as T;
}

type Me = { id: string; firstName: string; lastName: string; username: string | null; email: string; isSuperAdmin?: boolean };
type Overview = {
  onlineNow: number;
  users: { total: number; blocked: number; newToday: number; activeToday: number };
  rooms: { groups: number; channels: number; direct: number; blocked: number };
  meetings: { live: number; inCalls: number };
  requests: { chat: number; meeting: number };
  ai: { messagesToday: number };
};
type User = { id: string; firstName: string; lastName: string; username: string | null; email: string; lastSeen: string | null; createdAt: string; blockedAt: string | null; blockedReason: string | null; online: boolean; superAdmin: boolean };
type Room = { id: string; name: string | null; type: string; scope: string; slug: string | null; memberCount: number; pendingRequests: number; blockedAt: string | null; blockedReason: string | null; ownerFirstName: string | null; ownerLastName: string | null; createdAt: string };
type Requests = {
  chat: Array<{ id: string; createdAt: string; roomName: string | null; firstName: string; lastName: string; username: string | null }>;
  meeting: Array<{ id: string; createdAt: string; meetingTitle: string; code: string; firstName: string; lastName: string }>;
};
type Meeting = { id: string; title: string; code: string; scope: string; startTime: string; hostFirstName: string; hostLastName: string; participants: number };
type Audit = { id: string; action: string; targetType: string; targetName: string | null; targetId: string | null; createdAt: string; actorFirstName: string | null; actorLastName: string | null; details: { reason?: string } };

const TABS = [
  ["overview", "Umumiy"],
  ["users", "Foydalanuvchilar"],
  ["rooms", "Guruh va kanallar"],
  ["requests", "So‘rovlar"],
  ["meetings", "Jonli meetinglar"],
  ["audit", "Amallar tarixi"],
  ["routes", "API va route’lar"],
] as const;

/** Optima's own pages (the web app), linked from the routes tab. */
const APP_ROUTES: Array<[string, string]> = [
  ["/chat", "Chat (shaxsiy, guruh, kanal, bot)"],
  ["/chat?tab=group", "Guruhlar"],
  ["/chat?tab=channel", "Kanallar"],
  ["/meetings", "Meetinglar (ro‘yxat, yaratish, tarix)"],
  ["/meet/<kod>", "Meeting xonasi (kod bo‘yicha)"],
  ["/ai", "Optima AI (suhbatlar, xotira)"],
  ["/youtube", "YouTube (tanlangan videolar)"],
  ["/library", "Kutubxona"],
  ["/education", "Ta’lim"],
  ["/statistics", "Statistika"],
  ["/profile", "Profil va sozlamalar"],
  ["/profile/<username>", "Foydalanuvchi profili"],
  ["/u/<username>", "Shaxsiy chat"],
  ["/g/<username>", "Guruh"],
  ["/ch/<username>", "Kanal"],
  ["/join/chat/<kod>", "Taklif havolasi"],
  ["/admin", "Admin (ilova ichida)"],
];
type Session = { id: string; deviceName: string | null; ipAddress: string | null; userAgent: string | null; createdAt: string; lastUsedAt: string | null };
type Tab = (typeof TABS)[number][0];

const pad = (n: number) => String(n).padStart(2, "0");
const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function App() {
  const [me, setMe] = useState<Me | null | "anon" | "forbidden">(null);
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<{ total: number; items: User[] } | null>(null);
  const [rooms, setRooms] = useState<{ total: number; items: Room[] } | null>(null);
  const [requests, setRequests] = useState<Requests | null>(null);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [routes, setRoutes] = useState<Array<{ method: string; path: string }> | null>(null);
  const [sessionsFor, setSessionsFor] = useState<{ user: User; items: Session[] | null } | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    call<Me>("/users/me")
      .then((user) => setMe(user.isSuperAdmin ? user : "forbidden"))
      .catch((caught: { status?: number }) => setMe(caught.status === 401 ? "anon" : "forbidden"));
  }, []);

  const load = useCallback(() => {
    setError("");
    const fail = (caught: Error) => setError(caught.message);
    const query = new URLSearchParams({ q, filter, type, page: String(page) });
    if (tab === "overview") call<Overview>("/admin/overview").then(setOverview).catch(fail);
    if (tab === "users") call<{ total: number; items: User[] }>(`/admin/users?${query}`).then(setUsers).catch(fail);
    if (tab === "rooms") call<{ total: number; items: Room[] }>(`/admin/rooms?${query}`).then(setRooms).catch(fail);
    if (tab === "requests") call<Requests>("/admin/requests").then(setRequests).catch(fail);
    if (tab === "meetings") call<Meeting[]>("/admin/meetings").then(setMeetings).catch(fail);
    if (tab === "audit") call<Audit[]>(`/admin/audit?page=${page}`).then(setAudit).catch(fail);
    if (tab === "routes" && !routes) call<{ total: number; routes: Array<{ method: string; path: string }> }>("/admin/routes").then((result) => setRoutes(result.routes)).catch(fail);
  }, [tab, q, filter, type, page, routes]);

  useEffect(() => {
    if (typeof me !== "object" || !me) return;
    const timer = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [me, load, q]);

  useEffect(() => {
    if (typeof me !== "object" || !me || tab !== "overview") return;
    const timer = window.setInterval(() => call<Overview>("/admin/overview").then(setOverview).catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [me, tab]);

  function switchTab(next: Tab) {
    setTab(next); setQ(""); setFilter(""); setType(""); setPage(1);
    history.replaceState(null, "", `?tab=${next}`);
  }

  async function act(label: string, work: () => Promise<unknown>) {
    try { await work(); setNotice(label); window.setTimeout(() => setNotice(""), 2500); load(); } catch (caught) { setError((caught as Error).message); }
  }
  const block = (kind: "users" | "rooms", id: string) => {
    const reason = window.prompt("Bloklash sababi (ixtiyoriy):");
    if (reason === null) return;
    void act("Bloklandi", () => call(`/admin/${kind}/${id}/block`, { method: "POST", body: JSON.stringify({ reason: reason.trim() || undefined }) }));
  };
  const unblock = (kind: "users" | "rooms", id: string) => void act("Blokdan chiqarildi", () => call(`/admin/${kind}/${id}/unblock`, { method: "POST" }));
  const showSessions = (user: User) => {
    setSessionsFor({ user, items: null });
    call<Session[]>(`/admin/users/${user.id}/sessions`).then((items) => setSessionsFor({ user, items })).catch((caught) => setError((caught as Error).message));
  };
  const signOutEverywhere = (user: User) => {
    if (!window.confirm(`${user.firstName} ${user.lastName} — barcha qurilmalardan chiqarilsinmi?`)) return;
    void act("Barcha qurilmalardan chiqarildi", async () => { await call(`/admin/users/${user.id}/sessions/revoke`, { method: "POST" }); setSessionsFor(null); });
  };
  const endMeeting = (meeting: Meeting) => {
    if (!window.confirm(`“${meeting.title}” hamma uchun tugatilsinmi?`)) return;
    void act("Meeting tugatildi", () => call(`/meetings/${meeting.id}/end`, { method: "POST" }));
  };
  const joinRoom = (id: string) => void act("Qo‘shildingiz — Optima’da ochilmoqda", async () => {
    await call(`/admin/rooms/${id}/join`, { method: "POST" });
    window.open(`${OPTIMA}/chat?room=${id}`, "_blank", "noopener");
  });

  if (me === null) return <div className="center">Yuklanmoqda…</div>;
  if (me === "anon") return <div className="center"><h1>Optima Admin</h1><p>Avval Optima’ga kiring, keyin shu sahifani yangilang.</p><a className="button" href={OPTIMA}>Optima’ga kirish</a></div>;
  if (me === "forbidden") return <div className="center"><h1>403</h1><p>Bu sahifa faqat Optima adminlari uchun.</p><a className="button" href={OPTIMA}>Optima’ga qaytish</a></div>;

  const total = tab === "users" ? users?.total ?? 0 : tab === "rooms" ? rooms?.total ?? 0 : 0;
  return <div className="app">
    <header className="top">
      <strong>Optima Admin</strong>
      <span className="me">{me.firstName} {me.lastName} · {me.email}</span>
      <a href={OPTIMA}>Optima’ga o‘tish ↗</a>
    </header>
    <nav className="tabs">{TABS.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => switchTab(id)}>{label}</button>)}<button className="refresh" onClick={load}>↻ Yangilash</button></nav>
    {error && <p className="error">{error}</p>}
    {notice && <p className="notice">{notice}</p>}

    {(tab === "users" || tab === "rooms") && <div className="toolbar">
      <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Qidirish (ism, username, email, nom)…" />
      <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
        <option value="">Hammasi</option>
        {tab === "users" && <option value="online">Onlayn</option>}
        <option value="blocked">Bloklangan</option>
      </select>
      {tab === "rooms" && <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
        <option value="">Guruh + kanal</option><option value="group">Guruhlar</option><option value="channel">Kanallar</option>
      </select>}
      <span className="count">{total} ta</span>
    </div>}

    {tab === "overview" && overview && <div className="cards">
      <div className="card green"><small>Hozir onlayn</small><b>{overview.onlineNow}</b></div>
      <div className="card"><small>Foydalanuvchilar</small><b>{overview.users.total}</b><span>bugun faol {overview.users.activeToday} · yangi {overview.users.newToday}</span></div>
      <div className="card"><small>Guruhlar</small><b>{overview.rooms.groups}</b></div>
      <div className="card"><small>Kanallar</small><b>{overview.rooms.channels}</b></div>
      <div className="card"><small>Shaxsiy chatlar</small><b>{overview.rooms.direct}</b></div>
      <div className="card"><small>Jonli meetinglar</small><b>{overview.meetings.live}</b><span>qo‘ng‘iroqda {overview.meetings.inCalls} kishi</span></div>
      <div className="card"><small>Kutilayotgan so‘rovlar</small><b>{overview.requests.chat + overview.requests.meeting}</b><span>chat {overview.requests.chat} · meet {overview.requests.meeting}</span></div>
      <div className="card"><small>AI so‘rovlari (bugun)</small><b>{overview.ai.messagesToday}</b></div>
      <div className="card red"><small>Bloklangan</small><b>{overview.users.blocked + overview.rooms.blocked}</b><span>akkaunt {overview.users.blocked} · guruh/kanal {overview.rooms.blocked}</span></div>
    </div>}

    {tab === "users" && users && <table>
      <thead><tr><th>Foydalanuvchi</th><th>Email</th><th>Oxirgi faollik</th><th>Holat</th><th /></tr></thead>
      <tbody>{users.items.map((user) => <tr key={user.id} className={user.blockedAt ? "blocked" : ""}>
        <td><b>{user.firstName} {user.lastName}</b>{user.superAdmin && <em className="tag">admin</em>}<br /><small>{user.username ? `@${user.username}` : user.id}</small></td>
        <td>{user.email}</td>
        <td>{user.online ? <span className="online">● onlayn</span> : when(user.lastSeen)}</td>
        <td>{user.blockedAt ? <span className="red">Bloklangan {when(user.blockedAt)}{user.blockedReason ? ` — ${user.blockedReason}` : ""}</span> : "Faol"}</td>
        <td className="actions"><button onClick={() => showSessions(user)}>Sessiyalar</button>{!user.superAdmin && (user.blockedAt ? <button onClick={() => unblock("users", user.id)}>Blokdan chiqarish</button> : <button className="danger" onClick={() => block("users", user.id)}>Bloklash</button>)}</td>
      </tr>)}</tbody>
    </table>}

    {tab === "rooms" && rooms && <table>
      <thead><tr><th>Nomi</th><th>Turi</th><th>A’zolar</th><th>Egasi</th><th>Holat</th><th /></tr></thead>
      <tbody>{rooms.items.map((room) => <tr key={room.id} className={room.blockedAt ? "blocked" : ""}>
        <td><b>{room.name || "—"}</b><br /><small>{room.slug ? `@${room.slug}` : room.id}</small></td>
        <td>{room.type === "channel" ? "Kanal" : "Guruh"} · {room.scope}</td>
        <td>{room.memberCount}{room.pendingRequests ? <small> (+{room.pendingRequests} so‘rov)</small> : null}</td>
        <td>{room.ownerFirstName} {room.ownerLastName}</td>
        <td>{room.blockedAt ? <span className="red">Bloklangan {when(room.blockedAt)}{room.blockedReason ? ` — ${room.blockedReason}` : ""}</span> : "Faol"}</td>
        <td className="actions"><button onClick={() => joinRoom(room.id)}>Kirish</button>{room.blockedAt ? <button onClick={() => unblock("rooms", room.id)}>Blokdan chiqarish</button> : <button className="danger" onClick={() => block("rooms", room.id)}>Bloklash</button>}</td>
      </tr>)}</tbody>
    </table>}

    {tab === "requests" && requests && <div className="split">
      <section><h2>Guruh/kanalga qo‘shilish so‘rovlari ({requests.chat.length})</h2>
        <table><tbody>{requests.chat.map((item) => <tr key={item.id}><td><b>{item.firstName} {item.lastName}</b>{item.username ? <small> @{item.username}</small> : null}</td><td>→ {item.roomName}</td><td>{when(item.createdAt)}</td></tr>)}</tbody></table>
        {!requests.chat.length && <p className="muted">So‘rov yo‘q</p>}</section>
      <section><h2>Meeting lobby so‘rovlari ({requests.meeting.length})</h2>
        <table><tbody>{requests.meeting.map((item) => <tr key={item.id}><td><b>{item.firstName} {item.lastName}</b></td><td>→ {item.meetingTitle} <small>{item.code}</small></td><td>{when(item.createdAt)}</td><td className="actions"><a className="button small" href={`${OPTIMA}/meet/${item.code}`} target="_blank" rel="noopener">Kirish</a></td></tr>)}</tbody></table>
        {!requests.meeting.length && <p className="muted">So‘rov yo‘q</p>}</section>
    </div>}

    {tab === "meetings" && meetings && <table>
      <thead><tr><th>Meeting</th><th>Host</th><th>Ishtirokchilar</th><th>Boshlangan</th><th /></tr></thead>
      <tbody>{meetings.map((item) => <tr key={item.id}><td><b>{item.title}</b><br /><small>{item.code} · {item.scope}</small></td><td>{item.hostFirstName} {item.hostLastName}</td><td>{item.participants}</td><td>{when(item.startTime)}</td><td className="actions"><a className="button small" href={`${OPTIMA}/meet/${item.code}`} target="_blank" rel="noopener">Kirish</a><button className="danger" onClick={() => endMeeting(item)}>Tugatish</button></td></tr>)}</tbody>
    </table>}
    {tab === "meetings" && meetings && !meetings.length && <p className="muted">Hozir jonli meeting yo‘q</p>}

    {tab === "audit" && audit && <table>
      <thead><tr><th>Vaqt</th><th>Admin</th><th>Amal</th><th>Kimga/nimaga</th><th>Sabab</th></tr></thead>
      <tbody>{audit.map((item) => <tr key={item.id}><td>{when(item.createdAt)}</td><td>{item.actorFirstName} {item.actorLastName}</td><td><code>{item.action}</code></td><td>{item.targetName ?? item.targetId} <small>({item.targetType})</small></td><td>{item.details?.reason ?? ""}</td></tr>)}</tbody>
    </table>}

    {tab === "routes" && <div className="split">
      <section>
        <h2>Optima sahifalari ({APP_ROUTES.length})</h2>
        <table><tbody>{APP_ROUTES.map(([path, label]) => <tr key={path}><td><code>{path}</code></td><td>{label}</td><td className="actions">{!path.includes("<") && <a className="button small" href={OPTIMA + path} target="_blank" rel="noopener">Ochish</a>}</td></tr>)}</tbody></table>
      </section>
      <section>
        <h2>Backend API ({routes ? routes.filter((route) => !q || route.path.includes(q) || route.method.includes(q.toUpperCase())).length : "…"})</h2>
        <input className="route-search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Filtr: admin, meetings, POST…" />
        <table><tbody>{(routes ?? []).filter((route) => !q || route.path.includes(q) || route.method.includes(q.toUpperCase())).map((route) => <tr key={route.method + route.path} className={route.path.includes("/admin") ? "admin-route" : ""}><td><span className={`method m-${route.method}`}>{route.method}</span></td><td><code>{route.path}</code></td></tr>)}</tbody></table>
      </section>
    </div>}

    {sessionsFor && <div className="dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && setSessionsFor(null)}>
      <div className="dialog">
        <h2>{sessionsFor.user.firstName} {sessionsFor.user.lastName} — sessiyalar</h2>
        {sessionsFor.items === null ? <p className="muted">Yuklanmoqda…</p> : sessionsFor.items.length === 0 ? <p className="muted">Faol sessiya yo‘q</p> :
          <table><tbody>{sessionsFor.items.map((item) => <tr key={item.id}><td><b>{item.deviceName || (item.userAgent ?? "").slice(0, 60) || "Qurilma"}</b><br /><small>{item.ipAddress ?? "IP noma’lum"}</small></td><td>{when(item.lastUsedAt ?? item.createdAt)}</td></tr>)}</tbody></table>}
        <div className="dialog-actions">
          {!sessionsFor.user.superAdmin && <button className="danger" onClick={() => signOutEverywhere(sessionsFor.user)}>Barcha qurilmalardan chiqarish</button>}
          <button onClick={() => setSessionsFor(null)}>Yopish</button>
        </div>
      </div>
    </div>}

    {(tab === "users" || tab === "rooms" || tab === "audit") && <div className="pager">
      <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Oldingi</button>
      <span>{page}{total ? ` / ${Math.max(1, Math.ceil(total / 50))}` : ""}</span>
      <button disabled={tab === "audit" ? (audit?.length ?? 0) < 50 : page * 50 >= total} onClick={() => setPage((value) => value + 1)}>Keyingi →</button>
    </div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
