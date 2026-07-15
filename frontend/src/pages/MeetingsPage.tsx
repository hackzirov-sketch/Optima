import { ArrowRight, CalendarDays, ChevronDown, ChevronUp, Clock3, Copy, Link2, Plus, Radio, Search, UsersRound, Video } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button, EmptyState, Modal, PageHeader, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Meeting } from "../types";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(status: Meeting["status"]) {
  return ({ scheduled: "Rejalashtirilgan", live: "Jonli", ended: "Yakunlangan", cancelled: "Bekor qilingan" })[status];
}

export function MeetingsPage() {
  const { workspace } = useAuth();
  const { show } = useToast();
  const [, navigate] = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    setJoinCode(code.trim().toUpperCase());
    setJoinOpen(true);
    window.history.replaceState({}, "", "/meetings");
  }, []);

  async function shareMeeting(meeting: Meeting) {
    const url = `${window.location.origin}/meetings/${meeting.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: meeting.title, text: `OPTIMA meeting kodi: ${meeting.code}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        show("Meeting havolasi nusxalandi");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      show("Havolani ulashib bo‘lmadi", "error");
    }
  }

  async function load() {
    if (!workspace) return;
    setLoading(true);
    try {
      setMeetings(await api.meetings.list(workspace.id));
    } catch (error) {
      show(error instanceof Error ? error.message : "Meetinglar yuklanmadi", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [workspace?.id]);

  const active = useMemo(() => meetings.filter((meeting) => meeting.status === "live" || meeting.status === "scheduled").sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;
    return +new Date(a.startTime) - +new Date(b.startTime);
  }).slice(0, 4), [meetings]);
  const history = useMemo(() => meetings.filter((meeting) => meeting.status === "ended" || meeting.status === "cancelled").slice(0, 6), [meetings]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const start = new Date(String(form.get("startTime")));
    const duration = Number(form.get("duration") || 45);
    try {
      const meeting = await api.meetings.create(workspace.id, {
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim() || undefined,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + duration * 60_000).toISOString(),
        maxParticipants: Number(form.get("maxParticipants") || 20),
      });
      setCreateOpen(false);
      await load();
      show("Meeting yaratildi");
      navigate(`/meetings/${meeting.id}`);
    } catch (error) {
      show(error instanceof Error ? error.message : "Meeting yaratilmadi", "error");
    } finally {
      setSaving(false);
    }
  }

  async function joinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const meeting = await api.meetings.joinByCode(String(form.get("code") || "").trim().toUpperCase());
      setJoinOpen(false);
      navigate(`/meetings/${meeting.id}`);
    } catch (error) {
      show(error instanceof Error ? error.message : "Kod bo‘yicha meeting topilmadi", "error");
    } finally {
      setSaving(false);
    }
  }

  const defaultStart = new Date(Date.now() + 30 * 60_000);
  defaultStart.setMinutes(Math.ceil(defaultStart.getMinutes() / 5) * 5, 0, 0);

  return (
    <div className="page meetings-page">
      <PageHeader eyebrow={workspace?.name} title="Meetinglar" description="Rejalashtiring, kod bilan qo‘shiling va jamoa bilan video suhbat qiling." action={<div className="button-row"><Button variant="secondary" onClick={() => setJoinOpen(true)} icon={<Search size={17} />}>Kod bilan kirish</Button><Button onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>Meeting yaratish</Button></div>} />

      {loading ? <div className="meeting-card-grid">{[1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-card" />)}</div> : active.length === 0 ? (
        <section className="panel meeting-empty-panel"><EmptyState icon={<Video size={28} />} title="Hozircha meeting yo‘q" description="Jamoangiz uchun birinchi video meetingni rejalashtiring." action={<Button onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>Meeting yaratish</Button>} /></section>
      ) : (
        <section className="meeting-card-grid">
          {active.map((meeting) => (
            <article className={`meeting-card ${meeting.status === "live" ? "meeting-live" : ""}`} key={meeting.id}>
              <header><span className={`status-pill status-${meeting.status}`}>{meeting.status === "live" && <Radio size={13} />} {statusLabel(meeting.status)}</span><div className="meeting-card-tools"><button className="icon-button icon-button-sm" onClick={() => { void navigator.clipboard.writeText(meeting.code); show("Meeting kodi nusxalandi"); }} aria-label="Kodni nusxalash"><Copy size={15} /></button><button className="icon-button icon-button-sm" onClick={() => void shareMeeting(meeting)} aria-label="Meeting havolasini ulashish"><Link2 size={15} /></button></div></header>
              <div className="meeting-card-body"><h2>{meeting.title}</h2><p>{meeting.description || "Jamoa video suhbati"}</p></div>
              <dl><div><dt><CalendarDays size={16} /> Vaqt</dt><dd>{dateTime(meeting.startTime)}</dd></div><div><dt><UsersRound size={16} /> Qatnashchilar</dt><dd>{meeting.participantCount} / {meeting.maxParticipants}</dd></div></dl>
              <footer><code>{meeting.code}</code><Button onClick={() => navigate(`/meetings/${meeting.id}`)} icon={<ArrowRight size={17} />}>{meeting.status === "live" ? "Hozir qo‘shilish" : "Meetingni ochish"}</Button></footer>
            </article>
          ))}
        </section>
      )}

      {history.length > 0 && <section className="meeting-history-wrap"><button className="history-toggle" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}><span><strong>Meeting tarixi</strong><small>{history.length} ta yakunlangan meeting</small></span>{historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{historyOpen && <div className="panel meeting-history"><div className="history-table">{history.map((meeting) => <button key={meeting.id} onClick={() => navigate(`/meetings/${meeting.id}`)}><span className={`meeting-status status-${meeting.status}`} /><span><strong>{meeting.title}</strong><small>{dateTime(meeting.startTime)}</small></span><span>{meeting.participantCount} qatnashchi</span><ArrowRight size={16} /></button>)}</div></div>}</section>}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Yangi meeting" description="Vaqt va kirish darajasini belgilang." width="md">
        <form className="modal-form" onSubmit={create}>
          <label>Meeting nomi<input name="title" placeholder="Haftalik product sync" maxLength={200} autoFocus required /></label>
          <label>Qisqa izoh<textarea name="description" placeholder="Nimalarni muhokama qilamiz?" rows={3} /></label>
          <div className="form-grid-2"><label>Boshlanish vaqti<input name="startTime" type="datetime-local" defaultValue={defaultStart.toISOString().slice(0, 16)} required /></label><label>Davomiyligi<select name="duration" defaultValue="45"><option value="15">15 daqiqa</option><option value="30">30 daqiqa</option><option value="45">45 daqiqa</option><option value="60">1 soat</option></select></label></div>
          <label>Maksimal qatnashchi<input name="maxParticipants" type="number" min={2} max={500} defaultValue={20} /></label>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Bekor qilish</Button><Button type="submit" loading={saving} icon={<Video size={17} />}>Yaratish</Button></div>
        </form>
      </Modal>

      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Meetingga qo‘shilish" description="Host yuborgan meeting kodini kiriting.">
        <form className="modal-form join-code-form" onSubmit={joinByCode}>
          <label>Meeting kodi<input className="code-input code-input-small" name="code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="OPTIMA-ABC-1234" autoComplete="off" autoFocus required /></label>
          <p className="field-hint"><Clock3 size={15} /> Kod katta-kichik harflarga bog‘liq emas.</p>
          <Button type="submit" loading={saving} icon={<ArrowRight size={17} />}>Meetingni ochish</Button>
        </form>
      </Modal>
    </div>
  );
}
