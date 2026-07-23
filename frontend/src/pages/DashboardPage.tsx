import { ArrowUpRight, BookOpen, CalendarClock, GraduationCap, MessageCircle, Plus, Target, Trash2, UsersRound, Video } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { PageHeader, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ChatRoom, Meeting, WorkspaceMember } from "../types";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Xayrli tong";
  if (hour < 18) return "Xayrli kun";
  return "Xayrli kech";
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function DashboardPage() {
  const { user, workspace } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [education, setEducation] = useState<{ subjects: Array<{ subject: string; opened: number; completed: number; progress: number; watchSeconds: number }>; opened: number; completed: number; watchSeconds: number; saved: number; completionRate: number }>({ subjects: [], opened: 0, completed: 0, watchSeconds: 0, saved: 0, completionRate: 0 });

  useEffect(() => {
    if (!workspace) return;
    setLoading(true);
    Promise.all([api.chat.rooms(workspace.id), api.meetings.list(workspace.id), api.workspaces.members(workspace.id)])
      .then(([nextRooms, nextMeetings, nextMembers]) => {
        setRooms(nextRooms);
        setMeetings(nextMeetings);
        setMembers(nextMembers);
      })
      .finally(() => setLoading(false));
  }, [workspace]);

  useEffect(() => { api.education.dashboard().then(setEducation).catch(() => undefined); }, []);

  const upcoming = useMemo(() => meetings.filter((meeting) => meeting.status === "scheduled" || meeting.status === "live").sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)).slice(0, 3), [meetings]);
  const unread = rooms.reduce((sum, room) => sum + room.unreadCount, 0);

  async function removeMeeting(id: string) {
    if (!window.confirm("Meetingni o‘chirishni tasdiqlaysizmi?")) return;
    await api.meetings.remove(id);
    setMeetings((current) => current.filter((meeting) => meeting.id !== id));
  }

  async function removeRoom(id: string) {
    if (!window.confirm("Guruh va undagi xabarlarni o‘chirishni tasdiqlaysizmi?")) return;
    await api.chat.deleteRoom(id);
    setRooms((current) => current.filter((room) => room.id !== id));
  }

  return (
    <div className="page dashboard-page">
      <PageHeader eyebrow={workspace?.name} title={`${greeting()}, ${user?.firstName}`} description="Jamoangizdagi muhim holatlar bir qarashda." action={<Link href="/meetings" className="button button-primary"><Plus size={17} /> Meeting yaratish</Link>} />
      <section className="metric-grid" aria-label="Workspace statistikasi">
        <article className="metric-card"><span className="metric-icon"><UsersRound size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : members.length}</strong><small>Jamoa a’zolari</small></div></article>
        <article className="metric-card"><span className="metric-icon"><MessageCircle size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : rooms.length}</strong><small>Faol suhbatlar</small></div></article>
        <article className="metric-card"><span className="metric-icon"><CalendarClock size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : upcoming.length}</strong><small>Yaqin meetinglar</small></div></article>
        <article className="metric-card metric-card-accent"><span className="metric-icon"><ArrowUpRight size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : unread}</strong><small>O‘qilmagan xabar</small></div></article>
      </section>

      <section className="education-dashboard" aria-label="Education progressi">
        <header className="panel-header"><div><span>OPTIMA EDUCATION</span><h2>O‘rganish progressi</h2><p>Tanlangan yo‘nalishlar bo‘yicha natijalaringiz</p></div><Link href="/education">Darslarga o‘tish <ArrowUpRight size={15} /></Link></header>
        <div className="education-dashboard-grid">
          <article className="education-donut-card"><div className="education-donut" style={{ "--progress": `${education.completionRate * 3.6}deg` } as React.CSSProperties}><div><strong>{education.completionRate}%</strong><small>yakunlandi</small></div></div><div className="education-donut-copy"><span><Target /> Umumiy natija</span><h3>{education.completed} ta dars tugallangan</h3><p>{education.opened ? `${education.opened} ta ochilgan darsdan` : "Birinchi darsingizni boshlang"}</p><div><span><BookOpen /> {education.saved} saqlangan</span><span><GraduationCap /> {Math.round(education.watchSeconds / 60)} daqiqa</span></div></div></article>
          <article className="education-bars-card"><header><strong>Fanlar kesimida</strong><small>O‘rtacha progress</small></header>{education.subjects.length ? <div className="education-chart-bars">{education.subjects.map((item) => <div key={item.subject}><span><b>{({ ielts: "IELTS", cefr: "CEFR", mathematics: "Matematika", sat: "SAT" } as Record<string,string>)[item.subject] || item.subject}</b><small>{item.progress}%</small></span><i><b style={{ width: `${Math.min(100, item.progress)}%` }} /></i></div>)}</div> : <div className="education-chart-empty"><GraduationCap /><div><strong>Progress hali boshlanmagan</strong><small>Education’dan fan tanlab, birinchi darsni oching.</small></div></div>}</article>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <header className="panel-header"><div><h2>Yaqin meetinglar</h2><p>Rejalashtirilgan suhbatlar</p></div><Link href="/meetings">Barchasi <ArrowUpRight size={15} /></Link></header>
          <div className="list-stack">
            {loading && [1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-row" />)}
            {!loading && upcoming.length === 0 && <div className="compact-empty"><Video size={21} /><span><strong>Meeting yo‘q</strong><small>Birinchi meetingni rejalashtiring.</small></span></div>}
            {upcoming.map((meeting) => (
              <div className="dashboard-list-row" key={meeting.id}>
              <Link href={`/meetings/${meeting.id}`} className="meeting-row">
                <span className={`meeting-status status-${meeting.status}`} />
                <span className="row-main"><strong>{meeting.title}</strong><small>{shortDate(meeting.startTime)} · {meeting.participantCount} qatnashchi</small></span>
                <ArrowUpRight size={16} />
              </Link>
              {meeting.hostId === user?.id && <button className="row-delete-button" onClick={() => void removeMeeting(meeting.id)} aria-label={`${meeting.title} meetingini o‘chirish`} title="Meetingni o‘chirish"><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <header className="panel-header"><div><h2>So‘nggi chatlar</h2><p>Jamoa suhbatlari</p></div><Link href="/chat">Chatga o‘tish <ArrowUpRight size={15} /></Link></header>
          <div className="list-stack">
            {loading && [1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-row" />)}
            {!loading && rooms.length === 0 && <div className="compact-empty"><MessageCircle size={21} /><span><strong>Chat yo‘q</strong><small>Yangi guruh yoki shaxsiy chat oching.</small></span></div>}
            {rooms.slice(0, 4).map((room) => (
              <div className="dashboard-list-row" key={room.id}>
              <Link href={`/chat?room=${room.id}`} className="chat-row">
                <span className="room-avatar">{room.type === "direct" ? "@" : "#"}</span>
                <span className="row-main"><strong>{room.name || (room.type === "direct" ? "Shaxsiy suhbat" : "Yangi guruh")}</strong><small>{room.lastMessage?.content || "Hali xabar yo‘q"}</small></span>
                {room.unreadCount > 0 && <span className="unread-badge">{room.unreadCount}</span>}
              </Link>
              {!room.isSystem && room.type !== "direct" && room.createdById === user?.id && <button className="row-delete-button" onClick={() => void removeRoom(room.id)} aria-label={`${room.name || "Guruh"}ni o‘chirish`} title="Guruhni o‘chirish"><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
