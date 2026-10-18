import { BookOpen, Bookmark, BrainCircuit, CheckCircle2, ChevronLeft, Clock3, GraduationCap, Languages, Play, Search, Send, Sparkles, Target, Trophy, UsersRound } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";
import { useToast } from "../components/Toast";

type Subject = { id: string; name: string; description: string };
type Channel = { id: string; name: string; handle?: string; avatarUrl?: string; subjects: string[]; examTypes: string[]; trustLevel: string };
type Video = { id: string; youtubeVideoId: string; title: string; description?: string; thumbnailUrl?: string; durationSeconds: number; subject?: string; topic?: string; level?: string; channelName: string; progress: number; saved: boolean };
type Home = { subjects: Subject[]; trustedChannels: Channel[]; latest: Video[]; continueLearning: Video[]; saved: Video[] };

const subjectIcons = { ielts: Languages, cefr: BookOpen, mathematics: Target, sat: Trophy };
const formatDuration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function VideoCard({ video, onOpen }: { video: Video; onOpen: () => void }) {
  const { t } = useI18n();
  return <article className="education-video-card"><button className="education-thumbnail" onClick={onOpen} aria-label={t("education.openLessonAria", { title: video.title })}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <span><Play /></span>}<i>{formatDuration(video.durationSeconds)}</i><b><Play size={19} fill="currentColor" /></b></button><div className="education-card-copy"><small>{video.channelName}</small><h3>{video.title}</h3><div><span>{video.subject || t("education.lessonWord")}</span>{video.level && <span>{video.level}</span>}</div></div>{video.progress > 0 && <div className="education-progress"><i style={{ width: `${video.progress}%` }} /></div>}</article>;
}

function EducationSection({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) { return <section className="education-section"><header><div><span>{eyebrow}</span><h2>{title}</h2></div></header>{children}</section>; }

function Catalog() {
  const { t } = useI18n();
  const [, navigate] = useLocation(); const [home, setHome] = useState<Home | null>(null); const [subject, setSubject] = useState(() => localStorage.getItem("optima-education-subject") || ""); const [choosing, setChoosing] = useState(() => !localStorage.getItem("optima-education-subject")); const [query, setQuery] = useState(""); const [videos, setVideos] = useState<Video[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [listBusy, setListBusy] = useState(true);
  const [listError, setListError] = useState("");
  const [retry, setRetry] = useState(0);
  const listScope = useRef("");
  useEffect(() => { api.education.home().then((value) => { setHome(value); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!home) return;
    const scope = JSON.stringify([subject, query]);
    const changed = listScope.current !== scope;
    if (changed) { listScope.current = scope; setVideos([]); setHasMore(false); setPage(1); }
    const requestedPage = changed ? 1 : page;
    let cancelled = false;
    setListBusy(true); setListError("");
    const timer = window.setTimeout(() => {
      void api.education.videos({ subject: subject === "all" ? undefined : subject, q: query || undefined, page: requestedPage })
        .then(result => { if (!cancelled) { setVideos(current => requestedPage === 1 ? result.items : [...current, ...result.items.filter(item => !current.some(existing => existing.id === item.id))]); setHasMore(result.hasMore); } })
        .catch(cause => { if (!cancelled) setListError(cause instanceof Error ? cause.message : t("education.errorTitle")); })
        .finally(() => { if (!cancelled) setListBusy(false); });
    }, 280);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [home, query, subject, page, retry, t]);
  if (loading) return <div className="education-loading"><Sparkles className="education-spark" /><strong>{t("education.loadingTitle")}</strong><span>{t("education.loadingDesc")}</span></div>;
  if (error || !home) return <div className="education-state"><GraduationCap /><h2>{t("education.errorTitle")}</h2><p>{error || t("education.serverDisconnected")}</p><button onClick={() => location.reload()}>{t("education.retry")}</button></div>;
  const chooseSubject = (id: string) => { localStorage.setItem("optima-education-subject", id); setSubject(id); setChoosing(false); setQuery(""); };
  if (choosing || !subject) return <div className="education-page"><section className="education-picker"><div className="education-picker-copy"><span><Sparkles /> {t("education.pickerEyebrow")}</span><h1>{t("education.pickerTitle")}</h1><p>{t("education.pickerDescription")}</p></div><div className="education-picker-grid">{home.subjects.map((item, index) => { const Icon = subjectIcons[item.id as keyof typeof subjectIcons] || BookOpen; return <button key={item.id} onClick={() => chooseSubject(item.id)} style={{ "--subject-index": index } as React.CSSProperties}><span><Icon /></span><div><small>{t("education.direction", { index: String(index + 1).padStart(2, "0") })}</small><h2>{item.name}</h2><p>{item.description}</p></div><Play /></button>; })}</div><small className="education-picker-note">{t("education.pickerNote")}</small></section></div>;
  const currentSubject = home.subjects.find((item) => item.id === subject);
  const matchingTeachers = home.trustedChannels.filter((channel) => channel.subjects.includes(subject));
  return <div className="education-page"><section className="education-hero education-hero-focused"><div><span><Sparkles size={15} /> {currentSubject?.name.toUpperCase()}</span><h1>{currentSubject?.name}</h1><p>{currentSubject?.description}</p></div><div className="education-hero-stat"><BrainCircuit /><strong>{t("education.aiMentor")}</strong><span>{t("education.mentorSubtitle")}</span></div></section><div className="education-toolbar"><label><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("education.searchPlaceholder", { subject: currentSubject?.name || t("education.lessonWord") })} /></label><div className="education-subjects">{home.subjects.map((item) => { const Icon = subjectIcons[item.id as keyof typeof subjectIcons] || BookOpen; return <button key={item.id} className={subject === item.id ? "active" : ""} onClick={() => chooseSubject(item.id)}><Icon /> {item.name}</button>; })}<button className="education-change-subject" onClick={() => setChoosing(true)}>{t("education.changeSubject")}</button></div></div>{home.continueLearning.filter((v) => v.subject === subject).length > 0 && <EducationSection title={t("education.continueLearning")} eyebrow={t("education.yourProgress")}><div className="education-video-grid compact">{home.continueLearning.filter((v) => v.subject === subject).map((v) => <VideoCard key={v.id} video={v} onOpen={() => navigate(`/education/lesson/${v.id}`)} />)}</div></EducationSection>}<EducationSection title={query ? t("education.searchResultsFor", { query }) : t("education.subjectLessons", { subject: currentSubject?.name || "" })} eyebrow={t("education.approvedLessons")}>{listError && <div role="alert"><p>{listError}</p><button className="button" onClick={() => setRetry(current => current + 1)}>{t("education.retry")}</button></div>}{listBusy && <p role="status">{t("education.loadingTitle")}</p>}{videos.length ? <div className="education-video-grid">{videos.map((v) => <VideoCard key={v.id} video={v} onOpen={() => navigate(`/education/lesson/${v.id}`)} />)}</div> : !listBusy && !listError && <div className="education-empty"><BookOpen /><h3>{t("education.emptyLessonsTitle", { subject: currentSubject?.name || "" })}</h3><p>{t("education.emptyLessonsDesc")}</p></div>}{hasMore && !listError && <button className="button education-more" disabled={listBusy} onClick={() => setPage(current => current + 1)}>{t("youtube.more")}</button>}</EducationSection><EducationSection title={t("education.teachersOf", { subject: currentSubject?.name || "" })} eyebrow={t("education.trustedTeachers")}><div className="education-teachers">{matchingTeachers.map((channel) => <article key={channel.id}><div className="teacher-avatar">{channel.avatarUrl ? <img src={channel.avatarUrl} alt="" /> : channel.name[0]}</div><div><span className="verified-label"><CheckCircle2 /> {channel.trustLevel}</span><h3>{channel.name}</h3><p>{channel.examTypes.join(" · ") || channel.subjects.join(" · ")}</p></div><UsersRound /></article>)}</div></EducationSection></div>;
}

function Lesson({ id }: { id: string }) {
  const { t } = useI18n();
  const { show } = useToast();
  const [, navigate] = useLocation(); const [video, setVideo] = useState<(Video & { lessonOutline?: string; lastPositionSeconds: number; completed: boolean; related: Video[] }) | null>(null); const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const notePending = useRef(false);
  const mentorPending = useRef(false);
  const generation = useRef(0);
  const savePending = useRef(false);
  const completePending = useRef(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [completing, setCompleting] = useState(false);
  useEffect(() => {
    const started = ++generation.current;
    setVideo(null); setError(""); setNote(""); setQuestion(""); setAnswer(""); setBusy(false); setSavingNote(false);
    notePending.current = false; mentorPending.current = false;
    savePending.current = false; completePending.current = false;
    setSavingLesson(false); setCompleting(false);
    api.education.video(id).then(result => { if (started === generation.current) setVideo(result); }).catch((e: Error) => { if (started === generation.current) setError(e.message); });
    return () => { generation.current++; };
  }, [id]);
  const embed = useMemo(() => video ? `https://www.youtube.com/embed/${encodeURIComponent(video.youtubeVideoId)}?rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : "", [video]);
  const prompts = [t("education.promptSimple"), t("education.promptExample"), t("education.promptQuiz"), t("education.promptSummary")];
  async function updateLesson(action: "save" | "complete") {
    if (!video) return;
    const pending = action === "save" ? savePending : completePending;
    if (pending.current) return;
    const started = generation.current;
    pending.current = true;
    const setPending = action === "save" ? setSavingLesson : setCompleting;
    setPending(true);
    try {
      if (action === "save") {
        const result = await (video.saved ? api.education.unsave(id) : api.education.save(id));
        if (started === generation.current) setVideo(current => current ? { ...current, saved: result.saved } : current);
      } else {
        await api.education.complete(id);
        if (started === generation.current) setVideo(current => current ? { ...current, completed: true, progress: 100 } : current);
      }
    } catch (cause) {
      if (started === generation.current) show(cause instanceof Error ? cause.message : t("education.errorTitle"), "error");
    } finally { if (started === generation.current) { pending.current = false; setPending(false); } }
  }
  async function ask() {
    if (!question.trim() || mentorPending.current) return;
    const sent = question;
    const started = generation.current;
    mentorPending.current = true; setBusy(true);
    try {
      const result = await api.education.mentor(id, sent);
      if (started !== generation.current) return;
      setAnswer(result.reply);
      setQuestion(current => current === sent ? "" : current);
    } catch (e) {
      if (started === generation.current) setAnswer(e instanceof Error ? e.message : t("education.mentorNotResponding"));
    } finally { if (started === generation.current) { mentorPending.current = false; setBusy(false); } }
  }
  async function saveNote() {
    if (!note.trim() || notePending.current) return;
    const sent = note;
    const started = generation.current;
    notePending.current = true; setSavingNote(true);
    try {
      await api.education.addNote(id, sent);
      if (started === generation.current) setNote(current => current === sent ? "" : current);
    } catch (e) {
      if (started === generation.current) show(e instanceof Error ? e.message : t("education.noteSaveFailed"), "error");
    } finally { if (started === generation.current) { notePending.current = false; setSavingNote(false); } }
  }
  if (error) return <div className="education-state"><BookOpen /><h2>{t("education.lessonNotFound")}</h2><p>{error}</p><button onClick={() => navigate("/education")}>{t("education.backToCatalog")}</button></div>; if (!video) return <div className="education-loading"><Sparkles className="education-spark" /><strong>{t("education.lessonOpening")}</strong></div>;
  return <div className="lesson-page">
    <header className="lesson-top">
      <button onClick={() => navigate("/education")}><ChevronLeft /> {t("education.catalog")}</button>
      <div><small>{video.channelName}</small><strong>{video.title}</strong></div>
      <button className={video.saved ? "active" : ""} disabled={savingLesson} aria-busy={savingLesson || undefined} onClick={() => void updateLesson("save")}><Bookmark fill={video.saved ? "currentColor" : "none"} /><span>{video.saved ? t("education.saved") : t("education.saveLesson")}</span></button>
    </header>
    <div className="lesson-layout"><main>
      <div className="lesson-player"><iframe src={embed} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
      <div className="lesson-info">
        <div><span>{video.subject}</span>{video.level && <span>{video.level}</span>}<span><Clock3 /> {formatDuration(video.durationSeconds)}</span></div>
        <h1>{video.title}</h1><p>{video.description || t("education.lessonDescriptionMissing")}</p>
        <button className="lesson-complete" onClick={() => void updateLesson("complete")} disabled={video.completed || completing} aria-busy={completing || undefined}><CheckCircle2 /> {video.completed ? t("education.lessonCompleted") : t("education.markCompleted")}</button>
      </div>
      <section className="lesson-notes">
        <h2>{t("education.personalNote")}</h2><p>{t("education.personalNoteDesc")}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label={t("education.personalNote")} placeholder={t("education.notePlaceholder")} />
        <button disabled={savingNote || !note.trim()} aria-busy={savingNote || undefined} onClick={() => void saveNote()}>{t("education.saveNote")}</button>
      </section>
    </main><aside className="mentor-panel">
      <header><span><BrainCircuit /></span><div><strong>{t("education.aiMentor")}</strong><small>{t("education.mentorSubtitle")}</small></div></header>
      <div className="mentor-prompts">{prompts.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div>
      <div className="mentor-answer">{answer ? <p>{answer}</p> : <div><Sparkles /><h3>{t("education.askAboutLesson")}</h3><p>{t("education.mentorHint")}</p></div>}</div>
      <div className="mentor-input">
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} aria-label={t("education.questionPlaceholder")} placeholder={t("education.questionPlaceholder")} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } }} />
        <button onClick={() => void ask()} disabled={busy || !question.trim()} aria-busy={busy || undefined} aria-label={t("education.sendQuestionAria")}><Send /></button>
      </div>
    </aside></div>
  </div>;
}

export function EducationPage() { const match = window.location.pathname.match(/^\/education\/lesson\/([^/]+)$/); return match ? <Lesson id={decodeURIComponent(match[1])} /> : <Catalog />; }
