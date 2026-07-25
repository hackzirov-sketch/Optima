import { ArrowRight, CalendarDays, ChevronDown, ChevronUp, Clock3, Copy, Link2, Plus, Radio, Search, Trash2, UsersRound, Video } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button, EmptyState, Modal, PageHeader, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import type { Meeting } from "../types";

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };

export function MeetingsPage() {
  const { user, workspace } = useAuth();
  const { show } = useToast();
  const { t, locale } = useI18n();
  const [, navigate] = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  function dateTime(value: string) {
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function statusLabel(status: Meeting["status"]) {
    return ({ scheduled: t("meetings.statusScheduled"), live: t("meetings.statusLive"), ended: t("meetings.statusEnded"), cancelled: t("meetings.statusCancelled") })[status];
  }

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
        await navigator.share({ title: meeting.title, text: t("meetings.shareTextTemplate", { code: meeting.code }), url });
      } else {
        await navigator.clipboard.writeText(url);
        show(t("meetings.linkCopied"));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      show(t("meetings.shareFailed"), "error");
    }
  }

  async function load() {
    if (!workspace) return;
    setLoading(true);
    try {
      setMeetings(await api.meetings.list(workspace.id));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetings.loadFailed"), "error");
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
    try {
      const meeting = await api.meetings.create(workspace.id, {
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim() || undefined,
        startTime: start.toISOString(),
        maxParticipants: Number(form.get("maxParticipants") || 20),
      });
      setCreateOpen(false);
      await load();
      show(t("meetings.meetingCreated"));
      navigate(`/meetings/${meeting.id}`);
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetings.createFailed"), "error");
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
      show(error instanceof Error ? error.message : t("meetings.codeNotFound"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeMeeting(meeting: Meeting) {
    if (!window.confirm(t("meetings.deleteConfirm", { title: meeting.title }))) return;
    try {
      await api.meetings.remove(meeting.id);
      setMeetings((current) => current.filter((item) => item.id !== meeting.id));
      show(t("meetings.meetingDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetings.deleteFailed"), "error");
    }
  }

  const defaultStart = new Date(Date.now() + 30 * 60_000);
  defaultStart.setMinutes(Math.ceil(defaultStart.getMinutes() / 5) * 5, 0, 0);

  return (
    <div className="page meetings-page">
      <PageHeader eyebrow={workspace?.name} title={t("meetings.pageTitle")} description={t("meetings.pageDescription")} action={<div className="button-row"><Button variant="secondary" onClick={() => setJoinOpen(true)} icon={<Search size={17} />}>{t("meetings.joinByCode")}</Button><Button onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>{t("meetings.createMeeting")}</Button></div>} />

      {loading ? <div className="meeting-card-grid">{[1, 2, 3].map((item) => <Skeleton key={item} className="skeleton-card" />)}</div> : active.length === 0 ? (
        <section className="panel meeting-empty-panel"><EmptyState icon={<Video size={28} />} title={t("meetings.emptyTitle")} description={t("meetings.emptyDescription")} action={<Button onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>{t("meetings.createMeeting")}</Button>} /></section>
      ) : (
        <section className="meeting-card-grid">
          {active.map((meeting) => (
            <article className={`meeting-card ${meeting.status === "live" ? "meeting-live" : ""}`} key={meeting.id}>
              <header><span className={`status-pill status-${meeting.status}`}>{meeting.status === "live" && <Radio size={13} />} {statusLabel(meeting.status)}</span><div className="meeting-card-tools"><button className="icon-button icon-button-sm" onClick={() => { void navigator.clipboard.writeText(meeting.code); show(t("meetings.codeCopied")); }} aria-label={t("meetings.copyCodeAria")}><Copy size={15} /></button><button className="icon-button icon-button-sm" onClick={() => void shareMeeting(meeting)} aria-label={t("meetings.shareAria")}><Link2 size={15} /></button>{meeting.hostId === user?.id && <button className="icon-button icon-button-sm icon-button-danger" onClick={() => void removeMeeting(meeting)} aria-label={t("meetings.deleteAria")}><Trash2 size={15} /></button>}</div></header>
              <div className="meeting-card-body"><h2>{meeting.title}</h2><p>{meeting.description || t("meetings.defaultDescription")}</p></div>
              <dl><div><dt><CalendarDays size={16} /> {t("meetings.time")}</dt><dd>{dateTime(meeting.startTime)}</dd></div><div><dt><UsersRound size={16} /> {t("meetings.participants")}</dt><dd>{meeting.participantCount} / {meeting.maxParticipants}</dd></div></dl>
              <footer><code>{meeting.code}</code><Button onClick={() => navigate(`/meetings/${meeting.id}`)} icon={<ArrowRight size={17} />}>{meeting.status === "live" ? t("meetings.joinNow") : t("meetings.openMeeting")}</Button></footer>
            </article>
          ))}
        </section>
      )}

      {history.length > 0 && <section className="meeting-history-wrap"><button className="history-toggle" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}><span><strong>{t("meetings.historyTitle")}</strong><small>{t("meetings.historyCount", { count: history.length })}</small></span>{historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{historyOpen && <div className="panel meeting-history"><div className="history-table">{history.map((meeting) => <button key={meeting.id} onClick={() => navigate(`/meetings/${meeting.id}`)}><span className={`meeting-status status-${meeting.status}`} /><span><strong>{meeting.title}</strong><small>{dateTime(meeting.startTime)}</small></span><span>{t("meetings.participantCount", { count: meeting.participantCount })}</span><ArrowRight size={16} /></button>)}</div></div>}</section>}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("meetings.newMeetingTitle")} description={t("meetings.newMeetingDesc")} width="md">
        <form className="modal-form" onSubmit={create}>
          <label>{t("meetings.meetingNameLabel")}<input name="title" placeholder={t("meetings.meetingNamePlaceholder")} maxLength={200} autoFocus required /></label>
          <label>{t("meetings.shortNoteLabel")}<textarea name="description" placeholder={t("meetings.shortNotePlaceholder")} rows={3} /></label>
          <label>{t("meetings.startTimeLabel")}<input name="startTime" type="datetime-local" defaultValue={defaultStart.toISOString().slice(0, 16)} required /></label>
          <p className="field-hint"><Clock3 size={15} /> {t("meetings.durationHint")}</p>
          <label>{t("meetings.maxParticipantsLabel")}<input name="maxParticipants" type="number" min={2} max={500} defaultValue={20} /></label>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>{t("meetings.cancel")}</Button><Button type="submit" loading={saving} icon={<Video size={17} />}>{t("meetings.create")}</Button></div>
        </form>
      </Modal>

      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title={t("meetings.joinModalTitle")} description={t("meetings.joinModalDesc")}>
        <form className="modal-form join-code-form" onSubmit={joinByCode}>
          <label>{t("meetings.meetingCodeLabel")}<input className="code-input code-input-small" name="code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="OPTIMA-ABC-1234" autoComplete="off" autoFocus required /></label>
          <p className="field-hint"><Clock3 size={15} /> {t("meetings.codeCaseHint")}</p>
          <Button type="submit" loading={saving} icon={<ArrowRight size={17} />}>{t("meetings.openMeeting")}</Button>
        </form>
      </Modal>
    </div>
  );
}