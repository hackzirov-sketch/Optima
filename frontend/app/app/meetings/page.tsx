'use client';

import { useMemo, useState } from "react";
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Copy,
  FileVideo,
  Hand,
  Link2,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ActionButton, Modal, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { CLIP_ITEMS, MEETING_PARTICIPANTS, MEETING_ROOMS, SMART_TASKS } from "@/data/ecosystemData";

type MeetingRoom = (typeof MEETING_ROOMS)[number];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function meetingTone(status: string) {
  if (status === "Live") return "green";
  if (status === "Upcoming") return "indigo";
  return "slate";
}

function ParticipantTile({ participant, active }: { participant: (typeof MEETING_PARTICIPANTS)[number]; active?: boolean }) {
  return (
    <div
      className={cn(
        "group relative min-h-[150px] overflow-hidden rounded-[28px] border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        active && "ring-4 ring-indigo-100",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_90%_20%,rgba(59,130,246,0.16),transparent_28%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground ring-1 ring-[#E5E7EB] backdrop-blur">
            {participant.status}
          </span>
          <span className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-emerald-400" : "bg-slate-300")} />
        </div>
        <div className="grid place-items-center py-5">
          <div
            className="grid h-16 w-16 place-items-center rounded-[24px] text-lg font-black text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${participant.color}, #3B82F6)` }}
          >
            {initials(participant.name)}
          </div>
        </div>
        <div>
          <p className="truncate text-sm font-bold text-foreground">{participant.name}</p>
          <p className="truncate text-xs text-muted-foreground">{participant.role}</p>
        </div>
      </div>
    </div>
  );
}

function MeetingCard({
  meeting,
  active,
  onSelect,
}: {
  meeting: MeetingRoom;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[24px] border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md",
        active ? "border-indigo-200 ring-4 ring-indigo-100" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={meetingTone(meeting.status)}>{t(`app.meetings.status.${meeting.status.toLowerCase()}`, meeting.status)}</Pill>
            <span className="text-xs font-semibold text-muted-foreground">{meeting.type}</span>
          </div>
          <h3 className="mt-3 truncate text-base font-bold text-foreground">{meeting.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.meetings.hostedBy", { name: meeting.host })}</p>
        </div>
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Video className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 ring-1 ring-[#E5E7EB]">
          <Clock3 className="h-3.5 w-3.5" />
          {meeting.time}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 ring-1 ring-[#E5E7EB]">
          <Users className="h-3.5 w-3.5" />
          {t("app.meetings.peopleCount", { count: meeting.participants.length })}
        </span>
      </div>
    </button>
  );
}

export default function Page() {
  const { user, logout: onLogout } = useAuth();
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(MEETING_ROOMS[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeMeeting = useMemo(() => MEETING_ROOMS.find((meeting) => meeting.id === activeId) ?? MEETING_ROOMS[0], [activeId]);

  const liveParticipants = inCall ? MEETING_PARTICIPANTS : MEETING_PARTICIPANTS.slice(0, 4);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const joinMeeting = () => {
    setInCall(true);
    showToast(code.trim() ? t("app.meetings.toasts.joinedCode") : t("app.meetings.toasts.joined"));
  };

  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={t("app.meetings.eyebrow")}
          title={t("app.meetings.title")}
          description={t("app.meetings.description")}
        >
          <ActionButton onClick={joinMeeting}><Video className="h-4 w-4" /> {t("app.meetings.newMeeting")}</ActionButton>
          <ActionButton variant="secondary" onClick={() => setScheduleOpen(true)}><CalendarPlus className="h-4 w-4" /> {t("app.meetings.schedule")}</ActionButton>
        </PageHeader>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <SurfaceCard className="overflow-hidden p-0">
            <div className="relative overflow-hidden border-b border-border bg-[#0B1120] p-5 text-white">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(99,102,241,0.42),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(14,165,233,0.28),transparent_32%)]" />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">{inCall ? t("app.meetings.liveRoom") : t("app.meetings.readyRoom")}</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">{activeMeeting.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t("app.meetings.roomDesc")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-2xl bg-card/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/15">{activeMeeting.code}</span>
                  <button
                    type="button"
                    onClick={() => showToast(t("app.meetings.toasts.linkCopied"))}
                    className="inline-flex items-center gap-2 rounded-2xl bg-card/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/15 transition-colors hover:bg-card/15"
                  >
                    <Copy className="h-4 w-4" />
                    {t("app.meetings.copyLink")}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-muted p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {liveParticipants.map((participant, index) => (
                  <ParticipantTile key={participant.id} participant={participant} active={inCall && index === 0} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Pill tone={inCall ? "green" : "slate"}>{inCall ? t("app.meetings.inCall") : t("app.meetings.preview")}</Pill>
                <span className="text-xs text-muted-foreground">{t("app.meetings.secureDemo")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMicOn((current) => !current)}
                  className={cn("grid h-11 w-11 place-items-center rounded-2xl border transition-colors", micOn ? "border-border bg-muted text-foreground" : "border-rose-100 bg-rose-50 text-rose-600")}
                  aria-label={micOn ? t("app.meetings.muteMic") : t("app.meetings.unmuteMic")}
                >
                  {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOn((current) => !current)}
                  className={cn("grid h-11 w-11 place-items-center rounded-2xl border transition-colors", cameraOn ? "border-border bg-muted text-foreground" : "border-rose-100 bg-rose-50 text-rose-600")}
                  aria-label={cameraOn ? t("app.meetings.stopCamera") : t("app.meetings.startCamera")}
                >
                  {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setScreenOn((current) => !current)}
                  className={cn("grid h-11 w-11 place-items-center rounded-2xl border transition-colors", screenOn ? "border-indigo-100 bg-indigo-50 text-indigo-700" : "border-border bg-muted text-foreground")}
                  aria-label={t("app.meetings.shareScreen")}
                >
                  <MonitorUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setHandRaised((current) => !current)}
                  className={cn("grid h-11 w-11 place-items-center rounded-2xl border transition-colors", handRaised ? "border-amber-100 bg-amber-50 text-amber-700" : "border-border bg-muted text-foreground")}
                  aria-label={t("app.meetings.raiseHand")}
                >
                  <Hand className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setInCall(false)}
                  className="grid h-11 w-14 place-items-center rounded-2xl bg-rose-600 text-white shadow-sm shadow-rose-200 transition-colors hover:bg-rose-500"
                  aria-label={t("app.meetings.leave")}
                >
                  <Phone className="h-5 w-5 rotate-[135deg]" />
                </button>
              </div>
            </div>
          </SurfaceCard>

          <div className="space-y-5">
            <SurfaceCard>
              <SectionTitle icon={Link2} title={t("app.meetings.joinTitle")} description={t("app.meetings.joinDesc")} />
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted px-3 py-2 focus-within:border-indigo-300 focus-within:bg-card">
                <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t("app.meetings.codePlaceholder")}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-[#9CA3AF]"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton className="w-full" onClick={joinMeeting}>{t("app.meetings.join")}</ActionButton>
                <ActionButton variant="secondary" className="w-full" onClick={() => setCode(activeMeeting.code)}>{t("app.meetings.useDemoCode")}</ActionButton>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={Calendar} title={t("app.meetings.upcoming")} description={t("app.meetings.upcomingDesc")} />
              <div className="space-y-3">
                {MEETING_ROOMS.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} active={meeting.id === activeMeeting.id} onSelect={() => setActiveId(meeting.id)} />
                ))}
              </div>
            </SurfaceCard>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <SurfaceCard>
            <SectionTitle icon={ShieldCheck} title={t("app.meetings.trustTitle")} description={t("app.meetings.trustDesc")} />
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {["privateRooms", "waitingRoom", "hostControls"].map((key) => (
                <div key={key} className="flex items-center gap-3 rounded-2xl bg-muted p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-card text-indigo-600 shadow-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-foreground">{t(`app.meetings.trust.${key}.title`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`app.meetings.trust.${key}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Sparkles} title={t("app.meetings.agendaTitle")} description={t("app.meetings.agendaDesc")} />
            <div className="grid gap-3 md:grid-cols-3">
              {activeMeeting.agenda.map((item, index) => (
                <div key={item} className="rounded-[24px] border border-border bg-card p-4 shadow-sm">
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-indigo-50 text-sm font-black text-indigo-600">{index + 1}</span>
                  <p className="mt-4 text-sm font-bold text-foreground">{item}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("app.meetings.agendaMeta")}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle
            icon={CheckSquare}
            title={t("app.meetings.meetingToTasksTitle", "Meeting to tasks")}
            description={t("app.meetings.meetingToTasksDesc", "Convert agendas, notes, and recordings into action items, owners, clips, and follow-up Smart Tasks.")}
          />
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-3 md:grid-cols-3">
              {SMART_TASKS.slice(0, 3).map((task) => (
                <div key={task.id} className="rounded-[24px] border border-border bg-muted p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-card text-indigo-600 shadow-sm ring-1 ring-[#E5E7EB]">
                      <CheckSquare className="h-5 w-5" />
                    </span>
                    <Pill tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>{task.priority}</Pill>
                  </div>
                  <h3 className="mt-4 text-sm font-black text-foreground">{task.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{task.assignee} - due {task.dueDate}</p>
                  <ActionButton variant="secondary" className="mt-4 w-full" onClick={() => showToast("Action item assigned locally")}>
                    Assign from meeting
                  </ActionButton>
                </div>
              ))}
            </div>
            <div className="rounded-[26px] border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Recording and notes</p>
                  <h3 className="mt-2 font-black text-foreground">{CLIP_ITEMS[0].title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Summary card extracts decisions, blockers, owners, and linked task suggestions from the meeting room.
                  </p>
                </div>
                <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <FileVideo className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                {["Decision: keep launch scope focused", "Blocker: finish responsive QA", "Follow-up: share notes in Knowledge Hub"].map((item) => (
                  <div key={item} className="rounded-2xl bg-muted px-3 py-2 font-semibold text-foreground ring-1 ring-[#E5E7EB]">{item}</div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <Modal open={scheduleOpen} title={t("app.meetings.modalTitle")} description={t("app.meetings.modalDesc")} onClose={() => setScheduleOpen(false)}>
          <div className="space-y-3">
            <input className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.meetings.meetingName")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.meetings.meetingDate")} />
              <input className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.meetings.meetingTime")} />
            </div>
            <textarea className="min-h-24 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.meetings.meetingAgenda")} />
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setScheduleOpen(false)}>{t("app.common.cancel")}</ActionButton>
              <ActionButton onClick={() => { setScheduleOpen(false); showToast(t("app.meetings.toasts.scheduled")); }}><Plus className="h-4 w-4" /> {t("app.meetings.createDemoMeeting")}</ActionButton>
            </div>
          </div>
        </Modal>
      </PageShell>
      <Toast message={toast} />
    </>
  );
}
