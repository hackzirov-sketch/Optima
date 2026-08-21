import { ArrowUpRight, BookOpen, CalendarClock, GraduationCap, MessageCircle, Plus, Target, Trash2, UsersRound, Video } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { PageHeader, Skeleton } from "../components/ui";
import { StarfieldBackground } from "../components/StarfieldBackground";
import { useConfirm } from "../components/ConfirmDialog";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import type { ChatRoom, Meeting, WorkspaceMember } from "../types";

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };
const subjectKeys: Record<string, string> = { ielts: "ielts", cefr: "cefr", mathematics: "mathematics", sat: "sat" };

export function DashboardPage() {
  const { user, workspace } = useAuth();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [education, setEducation] = useState<{ subjects: Array<{ subject: string; opened: number; completed: number; progress: number; watchSeconds: number }>; opened: number; completed: number; watchSeconds: number; saved: number; completionRate: number }>({ subjects: [], opened: 0, completed: 0, watchSeconds: 0, saved: 0, completionRate: 0 });

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard.greetingMorning");
    if (hour < 18) return t("dashboard.greetingDay");
    return t("dashboard.greetingEvening");
  }

  function shortDate(value: string) {
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  useEffect(() => {
    if (!workspace) return;
    setLoading(true);
    Promise.all([api.chat.rooms(), api.meetings.list(workspace.id), api.workspaces.members(workspace.id)])
      .then(([nextRooms, nextMeetings, nextMembers]) => {
        setRooms(nextRooms);
        setMeetings(nextMeetings);
        setMembers(nextMembers);
      })
      .finally(() => setLoading(false));
  }, [workspace]);

  useEffect(() => { api.education.dashboard().then(setEducation).catch(() => undefined); }, []);

  const upcoming = useMemo(() => meetings.filter((meeting) => meeting.status === "scheduled" || meeting.status === "live" || meeting.status === "inactive").sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)).slice(0, 3), [meetings]);
  const unread = rooms.reduce((sum, room) => sum + room.unreadCount, 0);

  async function removeMeeting(id: string) {
    if (!(await confirm({
      title: t("common.delete"),
      description: t("dashboard.deleteMeetingConfirm"),
      confirmLabel: t("common.delete")
    }))) return;
    await api.meetings.remove(id);
    setMeetings((current) => current.filter((meeting) => meeting.id !== id));
  }

  async function removeRoom(id: string) {
    if (!(await confirm({
      title: t("chat.deleteGroup"),
      description: t("dashboard.deleteGroupConfirm"),
      confirmLabel: t("common.delete")
    }))) return;
    await api.chat.deleteRoom(id);
    setRooms((current) => current.filter((room) => room.id !== id));
  }

  return (
    <div className="page dashboard-page">
      <StarfieldBackground />
      <PageHeader eyebrow={workspace?.name} title={t("dashboard.greetingWithName", { greeting: greeting(), name: user?.firstName || "" })} description={t("dashboard.description")} action={<Link href="/meetings" className="button button-primary"><Plus size={17} /> {t("dashboard.createMeeting")}</Link>} />
      <section className="metric-grid" aria-label={t("dashboard.statsAria")}>
        <article className="metric-card"><span className="metric-icon"><UsersRound size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : members.length}</strong><small>{t("dashboard.teamMembers")}</small></div></article>
        <article className="metric-card"><span className="metric-icon"><MessageCircle size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : rooms.length}</strong><small>{t("dashboard.activeChats")}</small></div></article>
        <article className="metric-card"><span className="metric-icon"><CalendarClock size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : upcoming.length}</strong><small>{t("dashboard.upcomingMeetings")}</small></div></article>
        <article className="metric-card metric-card-accent"><span className="metric-icon"><ArrowUpRight size={20} /></span><div><strong>{loading ? <Skeleton className="skeleton-number" /> : unread}</strong><small>{t("dashboard.unreadMessages")}</small></div></article>
      </section>

      <section className="education-dashboard" aria-label={t("dashboard.educationAria")}>
        <header className="panel-header"><div><span>{t("dashboard.educationEyebrow")}</span><h2>{t("dashboard.educationTitle")}</h2><p>{t("dashboard.educationDescription")}</p></div><Link href="/education">{t("dashboard.goToLessons")} <ArrowUpRight size={15} /></Link></header>
        <div className="education-dashboard-grid">
          <article className="education-donut-card"><div className="education-donut" style={{ "--progress": `${education.completionRate * 3.6}deg` } as React.CSSProperties}><div><strong>{education.completionRate}%</strong><small>{t("dashboard.completedLabel")}</small></div></div><div className="education-donut-copy"><span><Target /> {t("dashboard.overallResult")}</span><h3>{t("dashboard.lessonsCompleted", { count: education.completed })}</h3><p>{education.opened ? t("dashboard.lessonsFromOpened", { count: education.opened }) : t("dashboard.startFirstLesson")}</p><div><span><BookOpen /> {t("dashboard.savedCount", { count: education.saved })}</span><span><GraduationCap /> {t("dashboard.minutesCount", { count: Math.round(education.watchSeconds / 60) })}</span></div></div></article>
          <article className="education-bars-card"><header><strong>{t("dashboard.bySubjects")}</strong><small>{t("dashboard.avgProgress")}</small></header>{education.subjects.length ? <div className="education-chart-bars">{education.subjects.map((item) => <div key={item.subject}><span><b>{subjectKeys[item.subject] ? t(`common.subjects.${subjectKeys[item.subject]}`) : item.subject}</b><small>{item.progress}%</small></span><i><b style={{ width: `${Math.min(100, item.progress)}%` }} /></i></div>)}</div> : <div className="education-chart-empty"><GraduationCap /><div><strong>{t("dashboard.progressNotStarted")}</strong><small>{t("dashboard.progressNotStartedDesc")}</small></div></div>}</article>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <header className="panel-header"><div><h2>{t("dashboard.upcomingMeetingsTitle")}</h2><p>{t("dashboard.scheduledConversations")}</p></div><Link href="/meetings">{t("dashboard.all")} <ArrowUpRight size={15} /></Link></header>
          <div className="list-stack">
            {loading && [1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-row" />)}
            {!loading && upcoming.length === 0 && <div className="compact-empty"><Video size={21} /><span><strong>{t("dashboard.noMeetings")}</strong><small>{t("dashboard.planFirstMeeting")}</small></span></div>}
            {upcoming.map((meeting) => (
              <div className="dashboard-list-row" key={meeting.id}>
              <Link href={`/meetings/${meeting.id}`} className="meeting-row">
                <span className={`meeting-status status-${meeting.status}`} />
                <span className="row-main"><strong>{meeting.title}</strong><small>{shortDate(meeting.startTime)} · {t("dashboard.participantCount", { count: meeting.participantCount })}</small></span>
                <ArrowUpRight size={16} />
              </Link>
              {meeting.hostId === user?.id && <button className="row-delete-button" onClick={() => void removeMeeting(meeting.id)} aria-label={t("dashboard.deleteMeetingAria", { title: meeting.title })} title={t("dashboard.deleteMeetingTitle")}><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <header className="panel-header"><div><h2>{t("dashboard.recentChats")}</h2><p>{t("dashboard.teamConversations")}</p></div><Link href="/chat">{t("dashboard.goToChat")} <ArrowUpRight size={15} /></Link></header>
          <div className="list-stack">
            {loading && [1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-row" />)}
            {!loading && rooms.length === 0 && <div className="compact-empty"><MessageCircle size={21} /><span><strong>{t("dashboard.noChats")}</strong><small>{t("dashboard.openNewChat")}</small></span></div>}
            {rooms.slice(0, 4).map((room) => (
              <div className="dashboard-list-row" key={room.id}>
              <Link href={`/chat?room=${room.id}`} className="chat-row">
                <span className="room-avatar">{room.type === "direct" ? "@" : "#"}</span>
                <span className="row-main"><strong>{room.name || (room.type === "direct" ? t("dashboard.personalChat") : t("dashboard.newGroup"))}</strong><small>{room.lastMessage?.content || t("dashboard.noMessagesYet")}</small></span>
                {room.unreadCount > 0 && <span className="unread-badge">{room.unreadCount}</span>}
              </Link>
              {!room.isSystem && room.type !== "direct" && room.createdById === user?.id && <button className="row-delete-button" onClick={() => void removeRoom(room.id)} aria-label={t("dashboard.deleteGroupAria", { name: room.name || t("dashboard.newGroup") })} title={t("dashboard.deleteGroupTitle")}><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
