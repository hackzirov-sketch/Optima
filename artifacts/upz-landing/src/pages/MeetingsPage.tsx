import { useMemo, useState } from "react";
import { Calendar, CalendarPlus, CheckCircle2, Copy, Link2, Mic, MicOff, MonitorUp, Phone, Plus, Search, Users, Video, VideoOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, Modal, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { MEETING_PARTICIPANTS, MEETING_ROOMS } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function MeetingsPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(MEETING_ROOMS[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const activeMeeting = useMemo(() => MEETING_ROOMS.find((meeting) => meeting.id === activeId) ?? MEETING_ROOMS[0], [activeId]);
  const participants = inCall ? MEETING_PARTICIPANTS.slice(0, 6) : MEETING_PARTICIPANTS.slice(0, 4);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const joinMeeting = () => {
    setInCall(true);
    showToast(code.trim() ? t("app.meetings.toasts.joinedCode") : t("app.meetings.toasts.joined"));
  };

  return (
    <AppLayout user={user} title={t("app.nav.meetings")} onLogout={onLogout}>
      <PageShell>
        <PageHeader eyebrow={t("app.meetings.eyebrow")} title={t("app.meetings.title")} description={t("app.meetings.description")}>
          <ActionButton onClick={joinMeeting}><Video className="h-4 w-4" /> {t("app.meetings.newMeeting")}</ActionButton>
          <ActionButton variant="secondary" onClick={() => setScheduleOpen(true)}><CalendarPlus className="h-4 w-4" /> {t("app.meetings.schedule")}</ActionButton>
        </PageHeader>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <main className="space-y-5">
            <SurfaceCard className="p-0">
              <div className="border-b border-[#E5E7EB] bg-[#111827] p-5 text-white">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <Pill tone={inCall ? "green" : "slate"}>{inCall ? t("app.meetings.inCall") : t("app.meetings.preview")}</Pill>
                    <h2 className="mt-3 text-2xl font-black">{activeMeeting.title}</h2>
                    <p className="mt-2 text-sm text-slate-300">{activeMeeting.host} • {activeMeeting.time}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast(t("app.meetings.toasts.linkCopied"))}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold"
                  >
                    <Copy className="h-4 w-4" />
                    {activeMeeting.code}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 bg-[#F7FAFC] p-4 sm:grid-cols-2 lg:grid-cols-3">
                {participants.map((participant, index) => (
                  <div key={participant.id} className={cn("rounded-2xl border border-[#E5E7EB] bg-white p-4", inCall && index === 0 && "ring-2 ring-indigo-200")}>
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white">
                        {initials(participant.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#111827]">{participant.name}</p>
                        <p className="truncate text-xs text-[#6B7280]">{participant.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-[#E5E7EB] bg-white p-4 md:flex-row md:items-center md:justify-between">
                <span className="text-xs text-[#6B7280]">{t("app.meetings.secureDemo")}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setMicOn((current) => !current)} className={cn("grid h-11 w-11 place-items-center rounded-xl border", micOn ? "border-[#E5E7EB] bg-[#F7FAFC]" : "border-rose-100 bg-rose-50 text-rose-600")}>
                    {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>
                  <button type="button" onClick={() => setCameraOn((current) => !current)} className={cn("grid h-11 w-11 place-items-center rounded-xl border", cameraOn ? "border-[#E5E7EB] bg-[#F7FAFC]" : "border-rose-100 bg-rose-50 text-rose-600")}>
                    {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </button>
                  <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border border-[#E5E7EB] bg-[#F7FAFC]">
                    <MonitorUp className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => setInCall(false)} className="grid h-11 w-14 place-items-center rounded-xl bg-rose-600 text-white">
                    <Phone className="h-5 w-5 rotate-[135deg]" />
                  </button>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={Calendar} title={t("app.meetings.upcoming")} description={t("app.meetings.upcomingDesc")} />
              <div className="grid gap-3 md:grid-cols-2">
                {MEETING_ROOMS.map((meeting) => (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => setActiveId(meeting.id)}
                    className={cn("rounded-2xl border p-4 text-left", meeting.id === activeMeeting.id ? "border-indigo-200 bg-indigo-50" : "border-[#E5E7EB] bg-white")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate font-bold text-[#111827]">{meeting.title}</h3>
                      <Pill tone={meeting.status === "Live" ? "green" : meeting.status === "Upcoming" ? "indigo" : "slate"}>{meeting.status}</Pill>
                    </div>
                    <p className="mt-2 text-sm text-[#6B7280]">{meeting.host} • {meeting.time}</p>
                  </button>
                ))}
              </div>
            </SurfaceCard>
          </main>

          <aside className="space-y-5">
            <SurfaceCard>
              <SectionTitle icon={Link2} title={t("app.meetings.joinTitle")} description={t("app.meetings.joinDesc")} />
              <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-2">
                <Search className="h-4 w-4 text-[#6B7280]" />
                <input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("app.meetings.codePlaceholder")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton className="w-full" onClick={joinMeeting}>{t("app.meetings.join")}</ActionButton>
                <ActionButton variant="secondary" className="w-full" onClick={() => setCode(activeMeeting.code)}>{t("app.meetings.useDemoCode")}</ActionButton>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={CheckCircle2} title={t("app.meetings.agendaTitle")} description={t("app.meetings.agendaDesc")} />
              <div className="space-y-2">
                {activeMeeting.agenda.map((item, index) => (
                  <div key={item} className="rounded-xl bg-[#F7FAFC] px-3 py-2 text-sm font-semibold text-[#111827]">
                    {index + 1}. {item}
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={Users} title={t("app.meetings.trustTitle")} description={t("app.meetings.trustDesc")} />
              <div className="space-y-2 text-sm text-[#6B7280]">
                <p>{t("app.meetings.trust.privateRooms.title")}</p>
                <p>{t("app.meetings.trust.waitingRoom.title")}</p>
                <p>{t("app.meetings.trust.hostControls.title")}</p>
              </div>
            </SurfaceCard>
          </aside>
        </div>

        <Modal open={scheduleOpen} title={t("app.meetings.modalTitle")} description={t("app.meetings.modalDesc")} onClose={() => setScheduleOpen(false)}>
          <div className="space-y-3">
            <input className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.meetings.meetingName")} />
            <textarea className="min-h-24 w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:border-indigo-300" placeholder={t("app.meetings.meetingAgenda")} />
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton variant="secondary" onClick={() => setScheduleOpen(false)}>{t("app.common.cancel")}</ActionButton>
              <ActionButton onClick={() => { setScheduleOpen(false); showToast(t("app.meetings.toasts.scheduled")); }}><Plus className="h-4 w-4" /> {t("app.meetings.createDemoMeeting")}</ActionButton>
            </div>
          </div>
        </Modal>
      </PageShell>
      <Toast message={toast} />
    </AppLayout>
  );
}
