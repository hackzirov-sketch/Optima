import { CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Copy, Globe2, History, Keyboard, Link2, Lock, MoreVertical, Plus, Radio, Ticket, Trash2, Video } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button, Modal, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { MeetMenu } from "../components/meet/MeetPopover";
import { FreeTimeIllustration } from "../components/meet/MeetIllustrations";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import type { Meeting, MeetingVisibility } from "../types";
import { MESH_MAX_PARTICIPANTS, clampParticipants } from "../lib/meeting-limits";
import { clock, dayLabel, dayTitle, shortDate, weekdayShort } from "../lib/meetDates";

const VISIBILITY_OPTIONS: MeetingVisibility[] = ["public", "private", "invite_only"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** The shareable Google Meet–style link: /meet/abc-defg-hij */
function meetingLink(meeting: Pick<Meeting, "code">) {
  return `${window.location.origin}/meet/${meeting.code}`;
}

/**
 * Meet home, modelled on Google Meet's: one bar to join by code/link or start
 * something new, a week strip to move between days, and that day's meetings —
 * with whatever is live right now pinned above them regardless of date.
 */
export function MeetingsPage() {
  const { user, group } = useAuth();
  const { show } = useToast();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const [, navigate] = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"meetings" | "history">("meetings");
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [newOpen, setNewOpen] = useState<"bar" | "empty" | null>(null);
  const [creating, setCreating] = useState(false);
  /** Which "New" action the create dialog is for (null = closed). */
  const [createMode, setCreateMode] = useState<"instant" | "later" | "schedule" | null>(null);
  /** Participant ceiling of the media transport (8 peer-to-peer, more on the SFU). */
  const [maxAllowed, setMaxAllowed] = useState(MESH_MAX_PARTICIPANTS);
  const [laterMeeting, setLaterMeeting] = useState<Meeting | null>(null);
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<MeetingVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<"auto" | "request_approval">("auto");
  const newBarRef = useRef<HTMLButtonElement>(null);
  const newEmptyRef = useRef<HTMLButtonElement>(null);
  const datePicker = useRef<HTMLInputElement>(null);

  async function load() {
    if (!group) return;
    setLoading(true);
    try {
      setMeetings(await api.meetings.list(group.id));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetings.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [group?.id]);
  useEffect(() => {
    api.meetings.mediaConfig().then((config) => setMaxAllowed(config.maxParticipants || MESH_MAX_PARTICIPANTS)).catch(() => undefined);
  }, []);

  // /meetings?code=XYZ (shared links from older invites) prefills the bar.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (!fromUrl) return;
    setCode(fromUrl.trim().toUpperCase());
    window.history.replaceState({}, "", "/meetings");
  }, []);

  // Week strip: Monday-first except English, which (like Google) starts on Sunday.
  const week = useMemo(() => {
    const first = new Date(selectedDay);
    const offset = locale === "en" ? first.getDay() : (first.getDay() + 6) % 7;
    first.setDate(first.getDate() - offset);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [selectedDay, locale]);

  const todayKey = dayKey(new Date());
  // "Happening now" belongs to today (or to the day the call started) — not
  // to every day the week strip lands on.
  const live = useMemo(() => meetings
    .filter((meeting) => meeting.status === "live" && (dayKey(selectedDay) === todayKey || dayKey(new Date(meeting.startTime)) === dayKey(selectedDay)))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)), [meetings, selectedDay, todayKey]);
  const dayMeetings = useMemo(() => meetings
    .filter((meeting) => meeting.status !== "live" && meeting.status !== "ended" && meeting.status !== "cancelled" && dayKey(new Date(meeting.startTime)) === dayKey(selectedDay))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)), [meetings, selectedDay]);
  const history = useMemo(() => meetings
    .filter((meeting) => meeting.status === "ended" || meeting.status === "cancelled")
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)), [meetings]);

  function shiftWeek(direction: -1 | 1) {
    const next = new Date(selectedDay);
    next.setDate(next.getDate() + direction * 7);
    setSelectedDay(startOfDay(next));
  }

  /**
   * One dialog for all three "New" actions — Google Meet starts with no
   * questions, but a meeting here has an audience and a size, so they are
   * asked up front. Instant opens it, "later" hands back the link, schedule
   * puts it on the chosen day.
   */
  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || !createMode) return;
    const mode = createMode;
    const form = new FormData(event.currentTarget);
    setCreating(true);
    try {
      const meeting = await api.meetings.create(group.id, {
        title: String(form.get("title") || "").trim() || t("meet.instantTitle"),
        description: String(form.get("description") || "").trim() || undefined,
        startTime: mode === "schedule" ? new Date(String(form.get("startTime"))).toISOString() : new Date().toISOString(),
        maxParticipants: Math.min(maxAllowed, Math.max(2, Number(form.get("maxParticipants")) || maxAllowed)),
        scope: visibility,
        joinPolicy: visibility === "invite_only" || visibility === "private" ? undefined : joinPolicy,
      });
      setCreateMode(null);
      setVisibility("public");
      setJoinPolicy("auto");
      setMeetings((current) => [meeting, ...current]);
      if (mode === "instant") {
        navigate(`/meet/${meeting.code}`);
      } else if (mode === "later") {
        setCopied(false);
        setLaterMeeting(meeting);
      } else {
        setSelectedDay(startOfDay(new Date(meeting.startTime)));
        show(t("meetings.meetingCreated"));
      }
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetings.createFailed"), "error");
    } finally {
      setCreating(false);
    }
  }

  /** Accepts a bare code, an Optima meeting link, or a link carrying ?code=. */
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    const id = value.match(UUID)?.[0];
    if (id && /\/meetings\//.test(value)) {
      navigate(`/meetings/${id}`);
      return;
    }
    // .../meet/abc-defg-hij, ?code=..., or the bare code.
    let lookup = value.match(/\/meet\/([a-z0-9-]+)/i)?.[1] ?? value;
    try { lookup = new URL(value).searchParams.get("code") || lookup; } catch { /* not a URL */ }
    setJoining(true);
    try {
      const meeting = await api.meetings.resolveByCode(lookup.trim());
      navigate(`/meet/${meeting.code}`);
    } catch {
      show(t("meet.invalidCode"), "error");
    } finally {
      setJoining(false);
    }
  }

  async function copy(text: string, message = t("meet.copied")) {
    try {
      await navigator.clipboard.writeText(text);
      show(message);
      return true;
    } catch {
      show(t("meetings.shareFailed"), "error");
      return false;
    }
  }

  async function removeMeeting(meeting: Meeting) {
    if (!(await confirm({ title: t("common.delete"), description: t("meetings.deleteConfirm", { title: meeting.title }), confirmLabel: t("common.delete") }))) return;
    try {
      await api.meetings.remove(meeting.id);
      setMeetings((current) => current.filter((item) => item.id !== meeting.id));
      show(t("meetings.meetingDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetings.deleteFailed"), "error");
    }
  }

  const newItems = [
    { key: "later", label: t("meet.createLater"), icon: <Link2 size={20} />, onSelect: () => setCreateMode("later") },
    { key: "instant", label: t("meet.startInstant"), icon: <Plus size={20} />, onSelect: () => setCreateMode("instant") },
    { key: "schedule", label: t("meet.schedule"), icon: <CalendarPlus size={20} />, onSelect: () => setCreateMode("schedule") },
  ];

  const defaultStart = new Date(Date.now() + 30 * 60_000);
  defaultStart.setMinutes(Math.ceil(defaultStart.getMinutes() / 5) * 5, 0, 0);
  if (dayKey(selectedDay) !== todayKey && selectedDay > new Date()) defaultStart.setFullYear(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
  const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  const item = (meeting: Meeting) => (
    <MeetingRow key={meeting.id} meeting={meeting} locale={locale} canDelete={meeting.hostId === user?.id}
      onOpen={() => navigate(`/meet/${meeting.code}`)}
      onCopyLink={() => void copy(meetingLink(meeting), t("meetings.linkCopied"))}
      onCopyCode={() => void copy(meeting.code, t("meetings.codeCopied"))}
      onDelete={() => void removeMeeting(meeting)} />
  );

  return (
    <div className="meet-home">
      <header className="meet-home-bar">
        <div className="meet-brand"><span className="meet-logo" aria-hidden="true"><Video size={20} /></span><span>{t("meet.brand")}</span></div>
        <div className="meet-home-actions">
          <form className="meet-join" onSubmit={(event) => void join(event)}>
            <label className="meet-join-field">
              <Keyboard size={20} aria-hidden="true" />
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("meet.codePlaceholder")} aria-label={t("meet.codeAria")} autoComplete="off" spellCheck={false} />
              <button type="submit" className="meet-join-submit" disabled={!code.trim() || joining}>{t("meet.join")}</button>
            </label>
          </form>
          <span className="meet-anchor">
            <button ref={newBarRef} type="button" className="meet-new" aria-haspopup="menu" aria-expanded={newOpen === "bar"} disabled={creating} onClick={() => setNewOpen((open) => open === "bar" ? null : "bar")}>
              <Video size={20} aria-hidden="true" /> {t("meet.new")}
            </button>
            <MeetMenu open={newOpen === "bar"} onClose={() => setNewOpen(null)} triggerRef={newBarRef} items={newItems} placement="bottom" align="start" label={t("meet.newMenuLabel")} className="meet-menu-light" />
          </span>
        </div>
      </header>

      <div className="meet-home-body">
        <nav className="meet-rail" aria-label={t("meet.brand")}>
          <button type="button" className={tab === "meetings" ? "active" : ""} aria-current={tab === "meetings" ? "page" : undefined} onClick={() => setTab("meetings")}><span><CalendarDays size={22} /></span>{t("meet.tabMeetings")}</button>
          <button type="button" className={tab === "history" ? "active" : ""} aria-current={tab === "history" ? "page" : undefined} onClick={() => setTab("history")}><span><History size={22} /></span>{t("meet.tabHistory")}</button>
        </nav>

        <main className="meet-home-main">
          {tab === "meetings" ? <>
            <div className="meet-day-row">
              <h1>
                {dayTitle(selectedDay, locale)}
                <label className="meet-icon-button" title={t("meet.pickDate")}>
                  <CalendarDays size={22} aria-hidden="true" />
                  <input ref={datePicker} type="date" className="meet-date-input" aria-label={t("meet.pickDate")}
                    value={`${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, "0")}-${String(selectedDay.getDate()).padStart(2, "0")}`}
                    onClick={() => datePicker.current?.showPicker?.()}
                    onChange={(event) => { if (event.target.value) setSelectedDay(startOfDay(new Date(`${event.target.value}T00:00`))); }} />
                </label>
              </h1>
              <div className="meet-week" role="group" aria-label={t("meet.pickDate")}>
                <button type="button" className="meet-icon-button" onClick={() => shiftWeek(-1)} aria-label={t("meet.prevWeek")}><ChevronLeft size={22} /></button>
                {week.map((day) => {
                  const selected = dayKey(day) === dayKey(selectedDay);
                  return (
                    <button type="button" key={dayKey(day)} className={`meet-day ${selected ? "selected" : ""} ${dayKey(day) === todayKey ? "today" : ""}`} aria-pressed={selected} onClick={() => setSelectedDay(startOfDay(day))}
                      aria-label={dayLabel(day, locale)}>
                      <small>{weekdayShort(day, locale)}</small>
                      <strong>{day.getDate()}</strong>
                    </button>
                  );
                })}
                <button type="button" className="meet-icon-button" onClick={() => shiftWeek(1)} aria-label={t("meet.nextWeek")}><ChevronRight size={22} /></button>
              </div>
            </div>

            {loading ? <div className="meet-list">{[1, 2].map((index) => <Skeleton key={index} className="meet-row-skeleton" />)}</div> : <>
              {live.length > 0 && <section className="meet-section" aria-label={t("meet.liveNow")}><h2><Radio size={16} /> {t("meet.liveNow")}</h2><div className="meet-list">{live.map(item)}</div></section>}
              {dayMeetings.length > 0 ? <section className="meet-section"><div className="meet-list">{dayMeetings.map(item)}</div></section> : live.length === 0 && (
                <section className="meet-empty">
                  <FreeTimeIllustration />
                  <h2>{dayKey(selectedDay) === todayKey ? t("meet.emptyToday") : t("meet.emptyDay")}</h2>
                  <p>{t("meet.emptyDesc")}</p>
                  <span className="meet-anchor">
                    <button ref={newEmptyRef} type="button" className="meet-new meet-new-lg" aria-haspopup="menu" aria-expanded={newOpen === "empty"} disabled={creating} onClick={() => setNewOpen((open) => open === "empty" ? null : "empty")}>
                      <Video size={20} aria-hidden="true" /> {t("meet.new")}
                    </button>
                    <MeetMenu open={newOpen === "empty"} onClose={() => setNewOpen(null)} triggerRef={newEmptyRef} items={newItems} placement="bottom" align="start" label={t("meet.newMenuLabel")} className="meet-menu-light" />
                  </span>
                </section>
              )}
            </>}
          </> : (
            <section className="meet-section">
              <div className="meet-day-row"><h1>{t("meet.tabHistory")}</h1></div>
              {history.length ? <div className="meet-list">{history.map(item)}</div> : <div className="meet-empty"><FreeTimeIllustration /><h2>{t("meet.historyEmpty")}</h2></div>}
            </section>
          )}
        </main>
      </div>

      <Modal open={Boolean(laterMeeting)} onClose={() => setLaterMeeting(null)} title={t("meet.laterTitle")} description={t("meet.laterDesc")}>
        {laterMeeting && <div className="meet-link-box">
          <code>{meetingLink(laterMeeting).replace(/^https?:\/\//, "")}</code>
          <button type="button" className="meet-icon-button" onClick={() => void copy(meetingLink(laterMeeting)).then((ok) => ok && setCopied(true))} aria-label={t("meet.copyLink")} title={t("meet.copyLink")}>
            {copied ? <Check size={20} /> : <Copy size={20} />}
          </button>
        </div>}
      </Modal>

      <Modal open={createMode !== null} onClose={() => setCreateMode(null)}
        title={createMode === "schedule" ? t("meet.schedule") : createMode === "later" ? t("meet.createLater") : t("meet.startInstant")}
        description={t("meet.createDesc")} width="md">
        <form className="modal-form meet-create-form" onSubmit={(event) => void submitCreate(event)}>
          <label>{t("meetings.meetingNameLabel")}<input name="title" placeholder={t("meet.instantTitle")} maxLength={200} autoFocus /></label>
          <label>{t("meetings.shortNoteLabel")}<textarea name="description" placeholder={t("meetings.shortNotePlaceholder")} rows={2} /></label>
          <div className="meet-create-grid">
            {createMode === "schedule" && <label>{t("meetings.startTimeLabel")}<input name="startTime" type="datetime-local" defaultValue={localInput(defaultStart)} required /></label>}
            <label>{t("meetings.maxParticipantsLabel")}<input name="maxParticipants" type="number" min={2} max={maxAllowed} defaultValue={Math.min(maxAllowed, 25)} required /><small className="field-hint">{t("meet.maxHint", { max: maxAllowed })}</small></label>
          </div>
          <fieldset className="meet-visibility meet-visibility-cards">
            <legend>{t("meetings.visibilityLabel")}</legend>
            {VISIBILITY_OPTIONS.map((option) => (
              <label key={option} className={`tone-${option} ${visibility === option ? "selected" : ""}`}>
                <input type="radio" name="visibility" value={option} checked={visibility === option} onChange={() => setVisibility(option)} />
                <b className="meet-visibility-icon" aria-hidden="true">{option === "public" ? <Globe2 size={22} /> : option === "private" ? <Lock size={22} /> : <Ticket size={22} />}</b>
                <i className="meet-visibility-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></i>
                <span><strong>{({ group_only: t("meetings.visibilityWorkspace"), private: t("meetings.visibilityPrivate"), public: t("meetings.visibilityPublic"), invite_only: t("meetings.visibilityInviteOnly") })[option]}</strong>
                  <small>{({ group_only: t("meetings.visibilityWorkspaceHint"), private: t("meetings.visibilityPrivateHint"), public: t("meetings.visibilityPublicHint"), invite_only: t("meetings.visibilityInviteOnlyHint") })[option]}</small></span>
              </label>
            ))}
          </fieldset>
          {visibility !== "invite_only" && visibility !== "private" && (
            <label>{t("meetings.joinPolicyLabel")}
              <select value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as "auto" | "request_approval")}>
                <option value="auto">{t("meetings.joinPolicyAuto")}</option>
                <option value="request_approval">{t("meetings.joinPolicyApproval")}</option>
              </select>
            </label>
          )}
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setCreateMode(null)}>{t("meetings.cancel")}</Button>
            <Button type="submit" loading={creating} icon={createMode === "schedule" ? <CalendarPlus size={17} /> : createMode === "later" ? <Link2 size={17} /> : <Video size={17} />}>
              {createMode === "schedule" ? t("meet.scheduleAction") : createMode === "later" ? t("meet.createLinkAction") : t("meet.startAction")}
            </Button></div>
        </form>
      </Modal>
    </div>
  );
}

function MeetingRow({ meeting, locale, canDelete, onOpen, onCopyLink, onCopyCode, onDelete }: {
  meeting: Meeting; locale: string; canDelete: boolean;
  onOpen: () => void; onCopyLink: () => void; onCopyCode: () => void; onDelete: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const start = new Date(meeting.startTime);
  const ended = meeting.status === "ended" || meeting.status === "cancelled";
  return (
    <article className={`meet-row ${meeting.status === "live" ? "live" : ""}`}>
      <time dateTime={meeting.startTime}>
        <strong>{clock(start, locale)}</strong>
        {ended && <small>{shortDate(start, locale)}</small>}
      </time>
      <button type="button" className="meet-row-main" onClick={onOpen}>
        <strong>{meeting.title}</strong>
        <small>{meeting.code} · {t("meet.participantsShort", { count: meeting.participantCount })}</small>
      </button>
      {!ended && <button type="button" className="meet-row-join" onClick={onOpen}>{t("meet.join")}</button>}
      <span className="meet-anchor">
        <button ref={trigger} type="button" className="meet-icon-button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t("meet.itemMenu")} onClick={() => setMenuOpen((open) => !open)}><MoreVertical size={20} /></button>
        <MeetMenu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={trigger} placement="bottom" align="end" label={t("meet.itemMenu")} className="meet-menu-light" items={[
          { key: "link", label: t("meet.copyLink"), icon: <Link2 size={18} />, onSelect: onCopyLink },
          { key: "code", label: t("meet.copyCode"), icon: <Copy size={18} />, onSelect: onCopyCode },
          ...(canDelete ? [{ key: "delete", label: t("meet.delete"), icon: <Trash2 size={18} />, danger: true, onSelect: onDelete }] : []),
        ]} />
      </span>
    </article>
  );
}
