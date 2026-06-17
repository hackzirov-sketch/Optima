'use client';

import { useCallback, useMemo, useState } from "react";
import {
  Bell,
  Calendar,
  CalendarPlus,
  CheckSquare,
  Clock3,
  Copy,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  Video,
  VideoOff,
  Hand,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton, Modal, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { MeetingCallView } from "@/components/meeting/MeetingCallView";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { useMembers } from "@/hooks/useMembers";
import { useMeetings } from "@/hooks/useMeetings";
import { useTasks } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useNotifications } from "@/hooks/useNotifications";
import type { ApiMeeting } from "@/lib/api";
import { meetingsApi } from "@/lib/api";

const USER_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];

function formatTime(isoString: string) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatDate(isoString: string) {
  try {
    const d = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function meetingStatus(meeting: ApiMeeting): 'live' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = new Date(meeting.startTime).getTime();
  const end = meeting.endTime ? new Date(meeting.endTime).getTime() : start + 3600000;
  if (meeting.isActive) return 'live';
  if (start > now) return 'upcoming';
  return 'past';
}

function MeetingCard({
  meeting,
  active,
  onSelect,
  onDelete,
  canDelete,
}: {
  meeting: ApiMeeting;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const status = meetingStatus(meeting);
  const tone = status === 'live' ? 'green' : status === 'upcoming' ? 'indigo' : 'slate';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-indigo-300 ring-2 ring-indigo-100 dark:ring-indigo-900/40" : "border-border hover:border-indigo-200 dark:hover:border-indigo-800",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={tone}>
              {status === 'live' ? '● Live' : status === 'upcoming' ? 'Upcoming' : 'Past'}
            </Pill>
            <span className="text-xs text-muted-foreground">{formatDate(meeting.startTime)}</span>
          </div>
          <h3 className="mt-2 truncate text-sm font-bold text-foreground">{meeting.title}</h3>
          {meeting.description && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{meeting.description}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {canDelete && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onDelete())}
              className="hidden rounded-xl p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-rose-600 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <Video className="h-4 w-4" />
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          {formatTime(meeting.startTime)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono font-medium text-muted-foreground">
          {meeting.code}
        </span>
      </div>
    </button>
  );
}

function TaskCalendarRow({ task }: { task: { id: string; title: string; status: string; dueDate?: string; priority?: string } }) {
  const dueLabel = task.dueDate ? formatDate(task.dueDate) : null;
  const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'done' : false;
  const priorityTone = task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'amber' : 'green';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-indigo-200 dark:hover:border-indigo-800">
      <div className={cn("h-2 w-2 flex-shrink-0 rounded-full", task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600')} />
      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", task.status === 'done' && 'line-through text-muted-foreground')}>
        {task.title}
      </span>
      <div className="flex flex-shrink-0 items-center gap-2">
        {task.priority && <Pill tone={priorityTone}>{task.priority}</Pill>}
        {dueLabel ? (
          <span className={cn("text-xs font-medium", isOverdue ? 'text-rose-600' : 'text-muted-foreground')}>
            {isOverdue ? '⚠ ' : ''}{dueLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No due date</span>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const { t } = useTranslation();
  const { activeWorkspace } = useWorkspace();
  const { backendUser } = useAuth();
  const { members } = useMembers(activeWorkspace?.id);
  const { meetings, loading: meetingsLoading, createMeeting, deleteMeeting } = useMeetings(activeWorkspace?.id);
  const { projects } = useProjects(activeWorkspace?.id);
  const { tasks } = useTasks(projects[0]?.id);
  const { notifications, unreadCount, markRead } = useNotifications();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joiningCode, setJoiningCode] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Schedule form state
  const [schedTitle, setSchedTitle] = useState("");
  const [schedDesc, setSchedDesc] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedDuration, setSchedDuration] = useState("60");
  const [schedAgenda, setSchedAgenda] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }, []);

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeId) ?? meetings[0] ?? null,
    [activeId, meetings],
  );

  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => meetingStatus(m) !== 'past').sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    ),
    [meetings],
  );

  const pastMeetings = useMemo(
    () => meetings.filter((m) => meetingStatus(m) === 'past').slice(0, 5),
    [meetings],
  );

  // Calendar: tasks with due dates this week
  const weekTasks = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    return tasks
      .filter((t) => {
        if (t.status === 'done') return false;
        if (!t.dueDate) return true; // Show tasks without due date too
        const d = new Date(t.dueDate);
        return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })
      .slice(0, 8);
  }, [tasks]);

  const selfMember = members.find((m) => m.userId === backendUser?.id);
  const callParticipants = useMemo(() => {
    const selfName = selfMember
      ? `${selfMember.user.firstName ?? ''} ${selfMember.user.lastName ?? ''}`.trim()
      : (backendUser?.email ?? 'You');
    const selfInitials = selfMember
      ? `${selfMember.user.firstName?.[0] ?? 'Y'}${selfMember.user.lastName?.[0] ?? ''}`.toUpperCase()
      : 'YO';
    const selfParticipant = {
      id: backendUser?.id ?? 'me',
      name: selfName,
      initials: selfInitials,
      color: '#6366F1',
      isHost: true,
      isSelf: true,
      isMuted: !micOn,
      cameraOff: !cameraOn,
    };
    const memberParticipants = members.slice(0, 3).map((m, i) => ({
      id: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      initials: `${m.user.firstName?.[0] ?? ''}${m.user.lastName?.[0] ?? ''}`.toUpperCase(),
      color: USER_COLORS[(i + 1) % USER_COLORS.length],
      isHost: false,
      isSelf: false,
      isMuted: false,
      cameraOff: false,
    }));
    return [selfParticipant, ...memberParticipants];
  }, [backendUser, members, micOn, cameraOn, selfMember]);

  const handleJoinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoiningCode(true);
    try {
      const res = await meetingsApi.joinByCode(code);
      setActiveId(res.data.id);
      setInCall(true);
      showToast(`Joined: ${res.data.title}`);
    } catch {
      showToast("Meeting not found or expired");
    } finally {
      setJoiningCode(false);
    }
  };

  const handleSchedule = async () => {
    if (!schedTitle.trim() || !schedDate || !schedTime) return;
    setSaving(true);
    try {
      const startTime = new Date(`${schedDate}T${schedTime}`).toISOString();
      const endISO = new Date(
        new Date(`${schedDate}T${schedTime}`).getTime() + parseInt(schedDuration) * 60000,
      ).toISOString();
      await createMeeting({
        title: schedTitle.trim(),
        description: schedDesc.trim() || undefined,
        startTime,
        endTime: endISO,
        agenda: schedAgenda.trim() || undefined,
      });
      setScheduleOpen(false);
      setSchedTitle(""); setSchedDesc(""); setSchedDate(""); setSchedTime(""); setSchedAgenda("");
      showToast("Meeting scheduled");
    } catch {
      showToast("Failed to schedule meeting");
    } finally {
      setSaving(false);
    }
  };

  if (inCall && activeMeeting) {
    return (
      <MeetingCallView
        title={activeMeeting.title}
        participants={callParticipants}
        onLeave={() => setInCall(false)}
      />
    );
  }

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={t("app.meetings.eyebrow")}
          title={t("app.meetings.title")}
          description={t("app.meetings.description")}
        >
          <ActionButton onClick={() => { setInCall(true); showToast("Meeting started"); }}>
            <Video className="h-4 w-4" /> {t("app.meetings.newMeeting")}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> {t("app.meetings.schedule")}
          </ActionButton>
          {/* Notification bell */}
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </PageHeader>

        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          {/* Left: active meeting room */}
          <SurfaceCard className="overflow-hidden p-0">
            <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 p-5 text-white">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(99,102,241,0.4),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(14,165,233,0.25),transparent_32%)]" />
              {meetingsLoading ? (
                <div className="relative flex items-center gap-2 text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading meetings…
                </div>
              ) : activeMeeting ? (
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Pill tone={meetingStatus(activeMeeting) === 'live' ? 'green' : 'indigo'}>
                        {meetingStatus(activeMeeting) === 'live' ? '● Live' : 'Ready'}
                      </Pill>
                      <span className="text-xs font-medium text-slate-400">{formatDate(activeMeeting.startTime)} · {formatTime(activeMeeting.startTime)}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-black tracking-tight md:text-2xl">{activeMeeting.title}</h2>
                    {activeMeeting.description && (
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{activeMeeting.description}</p>
                    )}
                    {activeMeeting.agenda && (
                      <p className="mt-2 text-xs text-slate-400">Agenda: {activeMeeting.agenda}</p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <span className="rounded-xl bg-white/10 px-3 py-1.5 font-mono text-xs font-bold text-white ring-1 ring-white/15">
                      {activeMeeting.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(activeMeeting.code); showToast("Code copied"); }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <h2 className="text-lg font-black text-white">No meetings yet</h2>
                  <p className="mt-1 text-sm text-slate-300">Schedule your first meeting above.</p>
                </div>
              )}
            </div>

            {/* Participants grid */}
            <div className="bg-muted/50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Workspace members ({members.length})
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                {members.slice(0, 6).map((member, i) => (
                  <div key={member.id} className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="pointer-events-none absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_0%_0%,rgba(99,102,241,0.08),transparent_60%)]" />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{member.role}</span>
                        <span className="h-2 w-2 rounded-full bg-green-400" />
                      </div>
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <div
                          className="grid h-12 w-12 place-items-center rounded-2xl text-sm font-black text-white"
                          style={{ background: `linear-gradient(135deg, ${USER_COLORS[i % USER_COLORS.length]}, ${USER_COLORS[(i + 2) % USER_COLORS.length]})` }}
                        >
                          {`${member.user.firstName?.[0] ?? ''}${member.user.lastName?.[0] ?? ''}`.toUpperCase()}
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-foreground">{member.user.firstName} {member.user.lastName}</p>
                          <p className="text-xs text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="col-span-full py-6 text-center text-sm text-muted-foreground">
                    No workspace members yet.
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3 border-t border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Pill tone="slate">{inCall ? 'In call' : 'Preview'}</Pill>
                <span className="text-xs text-muted-foreground">End-to-end encrypted</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMicOn((v) => !v)}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl border transition-colors",
                    micOn ? "border-border bg-muted text-foreground hover:border-indigo-300" : "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40",
                  )}
                >
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOn((v) => !v)}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl border transition-colors",
                    cameraOn ? "border-border bg-muted text-foreground hover:border-indigo-300" : "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40",
                  )}
                >
                  {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setScreenOn((v) => !v)}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl border transition-colors",
                    screenOn ? "border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/40" : "border-border bg-muted text-foreground hover:border-indigo-300",
                  )}
                >
                  <MonitorUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setHandRaised((v) => !v)}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl border transition-colors",
                    handRaised ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40" : "border-border bg-muted text-foreground hover:border-indigo-300",
                  )}
                >
                  <Hand className="h-4 w-4" />
                </button>
                <ActionButton onClick={() => setInCall(true)} className="h-10 px-4">
                  <Video className="h-4 w-4" /> Join
                </ActionButton>
                <button
                  type="button"
                  onClick={() => setInCall(false)}
                  className="grid h-10 w-12 place-items-center rounded-xl bg-rose-600 text-white transition-colors hover:bg-rose-500"
                >
                  <Phone className="h-4 w-4 rotate-[135deg]" />
                </button>
              </div>
            </div>
          </SurfaceCard>

          {/* Right: join + upcoming */}
          <div className="flex flex-col gap-5">
            <SurfaceCard>
              <SectionTitle icon={Search} title="Join meeting" description="Enter a meeting code to join instantly." />
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5 focus-within:border-indigo-300 focus-within:bg-card dark:focus-within:bg-gray-900">
                <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                  placeholder="Enter meeting code…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {joinCode && (
                  <button type="button" onClick={() => setJoinCode("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ActionButton className="mt-3 w-full" onClick={handleJoinByCode} disabled={!joinCode.trim() || joiningCode}>
                {joiningCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                Join
              </ActionButton>
            </SurfaceCard>

            <SurfaceCard className="flex-1 overflow-hidden">
              <SectionTitle icon={Calendar} title="Upcoming meetings" description="Meetings scheduled for your workspace." />
              {meetingsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : upcomingMeetings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  No upcoming meetings. Schedule one above.
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingMeetings.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      active={m.id === activeMeeting?.id}
                      onSelect={() => setActiveId(m.id)}
                      onDelete={() => deleteMeeting(m.id)}
                      canDelete={m.hostId === backendUser?.id}
                    />
                  ))}
                </div>
              )}
              {pastMeetings.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Past meetings ({pastMeetings.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {pastMeetings.map((m) => (
                      <MeetingCard
                        key={m.id}
                        meeting={m}
                        active={false}
                        onSelect={() => setActiveId(m.id)}
                        onDelete={() => deleteMeeting(m.id)}
                        canDelete={m.hostId === backendUser?.id}
                      />
                    ))}
                  </div>
                </details>
              )}
            </SurfaceCard>
          </div>
        </div>

        {/* Calendar view - tasks with due dates */}
        <SurfaceCard>
          <div className="flex items-start justify-between gap-4">
            <SectionTitle
              icon={Calendar}
              title="Calendar view"
              description="Tasks ordered by due date."
            />
            <Pill tone="indigo">{weekTasks.filter((t) => t.dueDate).length} scheduled</Pill>
          </div>
          {weekTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No tasks found. Create tasks in the Projects page.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {weekTasks.map((task) => (
                <TaskCalendarRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* Meeting to tasks */}
        <SurfaceCard>
          <SectionTitle
            icon={CheckSquare}
            title="Meeting → Tasks"
            description="Convert meeting action items to workspace tasks."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Total meetings", value: meetings.length, tone: "indigo" as const },
              { label: "Live now", value: meetings.filter((m) => meetingStatus(m) === 'live').length, tone: "green" as const },
              { label: "Upcoming", value: upcomingMeetings.filter((m) => meetingStatus(m) !== 'live').length, tone: "blue" as const },
            ].map(({ label, value, tone }) => (
              <div key={label} className="rounded-2xl bg-muted p-4 ring-1 ring-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-black text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        {/* Schedule meeting modal */}
        <Modal
          open={scheduleOpen}
          title={t("app.meetings.modalTitle")}
          description="Schedule a meeting for your workspace."
          onClose={() => setScheduleOpen(false)}
        >
          <div className="space-y-3">
            <input
              value={schedTitle}
              onChange={(e) => setSchedTitle(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              placeholder="Meeting title *"
              autoFocus
            />
            <textarea
              value={schedDesc}
              onChange={(e) => setSchedDesc(e.target.value)}
              className="min-h-16 w-full resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              placeholder="Description (optional)"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Date *</label>
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Time *</label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration</label>
              <select
                value={schedDuration}
                onChange={(e) => setSchedDuration(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </select>
            </div>
            <textarea
              value={schedAgenda}
              onChange={(e) => setSchedAgenda(e.target.value)}
              className="min-h-16 w-full resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-400 dark:bg-gray-800"
              placeholder="Agenda (optional)"
            />
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</ActionButton>
              <ActionButton
                onClick={handleSchedule}
                disabled={saving || !schedTitle.trim() || !schedDate || !schedTime}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Schedule
              </ActionButton>
            </div>
          </div>
        </Modal>

        {/* Notifications panel */}
        <Modal
          open={notifOpen}
          title="Notifications"
          description="Your recent workspace notifications."
          onClose={() => setNotifOpen(false)}
        >
          <div className="space-y-2">
            {notifications.slice(0, 15).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No notifications</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={cn(
                    "w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted",
                    !n.isRead && "bg-indigo-50 dark:bg-indigo-950/30",
                  )}
                >
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </Modal>
      </PageShell>
      <Toast message={toast} />
    </>
  );
}
