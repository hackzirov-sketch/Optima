import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Heart, Link2, LoaderCircle, Play, Search, X, Youtube } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { api, type MediaPage } from "../lib/api";
import { useToast } from "../components/Toast";
import { YoutubeDescription } from "../components/YoutubeDescription";
import { useI18n } from "../lib/i18n/i18n";

type VideoItem = { key: string; youtubeVideoId: string; title: string; channelName: string; durationSeconds: number; views?: number | null };

function videoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? url.pathname.split("/")[1] : ["youtube.com", "m.youtube.com"].includes(host) ? url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Topic chips: one tap runs the search. `""` is the popular feed. */
const TOPICS: Array<{ key: string; query: string; emoji: string }> = [
  { key: "topicForYou", query: "", emoji: "✨" },
  { key: "topicEducation", query: "ta'lim darslari", emoji: "🎓" },
  { key: "topicCoding", query: "dasturlash darslari", emoji: "💻" },
  { key: "topicEnglish", query: "ingliz tili darslari", emoji: "🗣️" },
  { key: "topicScience", query: "science explained", emoji: "🔬" },
  { key: "topicBusiness", query: "biznes darslari", emoji: "📈" },
];

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * YouTube inside Optima: the whole of YouTube when the server has an API key
 * (popular in Uzbekistan until you search), the curated education catalogue
 * otherwise. Videos play here, in the privacy-enhanced embed.
 */
/**
 * Seconds this video really played (Spend Time). The embedded player reports
 * its state over postMessage once we say we're listening; only "playing"
 * seconds with the tab visible count. A player that never reports (blocked
 * messaging) falls back to visible time. Sent every 30s and on leaving.
 */
function useWatchTime(slug: string | null, frame: React.RefObject<HTMLIFrameElement | null>) {
  useEffect(() => {
    if (!slug) return;
    let state: number | null = null; // YouTube: 1 playing, 2 paused, 0 ended, 3 buffering
    let pending = 0;
    const flush = () => { if (pending > 0) { const seconds = pending; pending = 0; void api.media.watch(slug, seconds).catch(() => undefined); } };
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const next = data?.info?.playerState ?? (data?.event === "onStateChange" ? data.info : undefined);
        if (typeof next === "number") state = next;
      } catch { /* not ours */ }
    };
    window.addEventListener("message", onMessage);
    const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: slug, channel: "widget" }), "*");
    const hello = window.setInterval(listen, 1000);
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (state === 1 || state === null) pending++;
      if (pending >= 30) flush();
    }, 1000);
    const stopHello = window.setTimeout(() => window.clearInterval(hello), 15_000);
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(hello); window.clearInterval(tick); window.clearTimeout(stopHello);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [slug, frame]);
}

export function YoutubePage() {
  const { t, locale } = useI18n();
  const { show } = useToast();
  const { slug } = useParams<{ slug?: string }>();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"youtube" | "catalog" | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VideoItem[]>([]);
  const [cursor, setCursor] = useState<{ page: number; token: string | null }>({ page: 1, token: null });
  const [next, setNext] = useState<{ page: number; token: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The open video is our own record (/youtube/:slug) — it carries live views and likes.
  const [media, setMedia] = useState<MediaPage | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const openingGeneration = useRef(0);
  const openingPending = useRef(false);
  useEffect(() => {
    setOpening(null); openingPending.current = false;
    return () => { openingGeneration.current++; openingPending.current = false; };
  }, [slug, query]);
  const [copied, setCopied] = useState(false);
  const counted = useRef<string | null>(null);
  const selected = slug && media?.slug === slug
    ? { id: media.externalId, title: media.title, channelName: media.subtitle ?? undefined, views: media.meta.youtubeViews ?? null }
    : null;
  const closeVideo = () => navigate("/youtube");
  const player = useRef<HTMLIFrameElement>(null);
  useWatchTime(selected ? slug ?? null : null, player);

  // The route decides what's open: load the record behind a slug we don't have yet.
  useEffect(() => {
    if (!slug) { setMedia(null); return; }
    if (media?.slug === slug) return;
    let cancelled = false;
    api.media.get(slug).then((page) => { if (!cancelled) setMedia(page); }).catch(() => { if (!cancelled) navigate("/youtube", { replace: true }); });
    return () => { cancelled = true; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // One view per opening (the server also ignores repeats within a minute).
  useEffect(() => {
    if (!slug || counted.current === slug) return;
    counted.current = slug;
    api.media.view(slug).then(({ views }) => setMedia((current) => current?.slug === slug ? { ...current, views, myViews: current.myViews + 1 } : current)).catch(() => undefined);
  }, [slug]);
  useEffect(() => { if (!slug) counted.current = null; }, [slug]);
  const request = useRef(0);

  useEffect(() => {
    api.youtube.status().then((status) => setMode(status.enabled ? "youtube" : "catalog")).catch(() => setMode("catalog"));
  }, []);

  useEffect(() => {
    if (!mode) return;
    const sequence = ++request.current;
    const first = cursor.page === 1;
    setLoading(true);
    setError("");
    const load = mode === "youtube"
      ? (query
        ? api.youtube.search(query, cursor.token ?? undefined).then((result) => ({
          items: result.items.map((item) => ({ ...item, key: item.youtubeVideoId })),
          next: result.nextPageToken ? { page: cursor.page + 1, token: result.nextPageToken } : null,
        }))
        // No query: "For you" — vetted and ranked for this person on the server.
        : api.youtube.feed(cursor.page).then((result) => ({
          items: result.items.map((item) => ({ ...item, key: item.youtubeVideoId })),
          next: result.hasMore ? { page: cursor.page + 1, token: null } : null,
        })))
      : api.education.videos({ q: query, page: cursor.page }).then((result) => ({
        items: (result.items as Array<VideoItem & { id: string }>).filter((item) => /^[A-Za-z0-9_-]{11}$/.test(item.youtubeVideoId)).map((item) => ({ ...item, key: item.id })),
        next: result.hasMore ? { page: cursor.page + 1, token: null } : null,
      }));
    load.then((result) => {
      if (sequence !== request.current) return;
      setItems((current) => first ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.key === item.key))]);
      setNext(result.next);
    }).catch((cause) => {
      if (sequence !== request.current) return;
      // Quota or outage on the YouTube side: keep the page useful with the catalogue.
      if (mode === "youtube") { setMode("catalog"); return; }
      setError(cause instanceof Error ? cause.message : t("youtube.loadFailed"));
    }).finally(() => { if (sequence === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [mode, query, cursor, t]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const id = videoId(draft.trim());
    if (id) { void openVideo(id); return; }
    if (slug) closeVideo();
    setQuery(draft.trim());
    setCursor({ page: 1, token: null });
  }

  async function openVideo(youtubeId: string) {
    if (openingPending.current) return;
    const generation = openingGeneration.current;
    openingPending.current = true;
    setOpening(youtubeId);
    try {
      const page = await api.media.youtube(youtubeId);
      if (generation !== openingGeneration.current) return;
      setMedia(page);
      setCopied(false);
      navigate(`/youtube/${page.slug}`);
    } catch (cause) {
      if (generation === openingGeneration.current) show(cause instanceof Error ? cause.message : t("youtube.loadFailed"), "error");
    } finally {
      if (generation === openingGeneration.current) { openingPending.current = false; setOpening(null); }
    }
  }

  const watch = (item: VideoItem) => void openVideo(item.youtubeVideoId);

  async function toggleLike() {
    if (!media) return;
    const on = !media.liked;
    setMedia({ ...media, liked: on, likes: Math.max(0, media.likes + (on ? 1 : -1)) });
    try {
      const result = on ? await api.media.like(media.slug) : await api.media.unlike(media.slug);
      setMedia((current) => current?.slug === media.slug ? { ...current, ...result } : current);
    } catch {
      setMedia((current) => current?.slug === media.slug ? { ...current, liked: !on, likes: media.likes } : current);
    }
  }

  // Opening a video brings the player to the top of the screen, so the title
  // and actions under it fit above the dock.
  useEffect(() => {
    if (selected) window.requestAnimationFrame(() => document.querySelector(".yt-watch")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyLink(id: string) {
    try { await navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${id}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked — nothing to do */ }
  }

  function pickTopic(topic: (typeof TOPICS)[number]) {
    if (slug) closeVideo();
    setDraft(topic.query);
    setQuery(topic.query);
    setCursor({ page: 1, token: null });
  }

  const views = (count?: number | null) => count == null ? "" : t("youtube.views", { count: new Intl.NumberFormat(locale, { notation: "compact" }).format(count) });

  return <div className="page youtube-page">
    <header className="youtube-heading"><span className="yt-badge"><Youtube size={26} /></span><div><h1>YouTube</h1><p>{t("youtube.subtitle")}</p></div></header>
    <form className="youtube-search" onSubmit={submit}>
      <Search size={20} /><input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={t("youtube.search")} placeholder={t("youtube.search")} />
      {draft && <button type="button" className="icon-button" onClick={() => { setDraft(""); if (query) { setQuery(""); setCursor({ page: 1, token: null }); } }} aria-label={t("youtube.clear")}><X size={18} /></button>}
      <button className="icon-button" disabled={loading} aria-label={t("youtube.search")}><Search size={20} /></button>
    </form>
    {!selected && <nav className="yt-topics" aria-label={t("youtube.topics")}>{TOPICS.map((topic) => <button key={topic.key} type="button" className={query === topic.query ? "active" : ""} aria-pressed={query === topic.query} onClick={() => pickTopic(topic)}><span aria-hidden="true">{topic.emoji}</span>{t(`youtube.${topic.key}`)}</button>)}</nav>}
    {!selected && <p className="youtube-catalog-label">{mode === "youtube" ? (query ? t("youtube.resultsFor", { query }) : t("youtube.forYou")) : t("youtube.catalog")}</p>}
    {selected ? <div className="yt-watch">
      <section className="yt-watch-main">
        <div className="yt-player-frame"><iframe ref={player} key={selected.id} src={`https://www.youtube-nocookie.com/embed/${selected.id}?rel=0&playsinline=1&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
        <div className="yt-watch-info">
        <h2 className="yt-watch-title">{selected.title}</h2>
        <div className="yt-watch-meta">
          <span className="yt-channel"><b aria-hidden="true">{(selected.channelName || "Y").trim().charAt(0).toUpperCase()}</b><span><strong>{selected.channelName || "YouTube"}</strong><small>{[selected.views != null ? views(selected.views) : "", media ? t("youtube.optimaViews", { count: new Intl.NumberFormat(locale, { notation: "compact" }).format(media.views) }) : ""].filter(Boolean).join(" · ")}</small></span></span>
          <div className="yt-watch-actions">
            <button type="button" className="yt-pill" onClick={closeVideo}><ArrowLeft size={17} />{t("youtube.back")}</button>
            <button type="button" className={`yt-pill yt-like ${media?.liked ? "is-liked" : ""}`} onClick={() => void toggleLike()} aria-pressed={Boolean(media?.liked)} aria-label={t("youtube.like")}><Heart size={17} />{media?.likes ? new Intl.NumberFormat(locale, { notation: "compact" }).format(media.likes) : t("youtube.like")}</button>
            <a className="yt-pill yt-pill-primary" href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />{t("youtube.openOnYoutube")}</a>
            <button type="button" className={`yt-pill ${copied ? "yt-pill-done" : ""}`} onClick={() => void copyLink(selected.id)}>{copied ? <Check size={17} /> : <Link2 size={17} />}{copied ? t("youtube.linkCopied") : t("youtube.copyLink")}</button>
          </div>
        </div>
        <YoutubeDescription videoId={selected.id} onSearch={(text) => { closeVideo(); setDraft(text); setQuery(text); setCursor({ page: 1, token: null }); }} />
        </div>
      </section>
      <aside className="yt-up-next" aria-label={t("youtube.upNext")}>
        <h3>{t("youtube.upNext")}</h3>
        {items.filter((item) => item.youtubeVideoId !== selected.id).map((item) => <button key={item.key} type="button" className="yt-next" onClick={() => watch(item)}>
          <span className="yt-next-thumb"><img src={`https://i.ytimg.com/vi/${item.youtubeVideoId}/mqdefault.jpg`} alt="" loading="lazy" />{item.durationSeconds > 0 && <small>{duration(item.durationSeconds)}</small>}</span>
          <span className="yt-next-text"><strong>{item.title}</strong><small>{item.channelName}</small>{item.views != null && <small>{views(item.views)}</small>}</span>
        </button>)}
        {next && !error && !loading && <button className="button yt-more" onClick={() => setCursor(next)}>{t("youtube.more")}</button>}
      </aside>
    </div> : <>
    {error && <p role="alert">{error}</p>}
    <div className="youtube-grid">{items.map((item) => <button key={item.key} className={`youtube-video ${opening === item.youtubeVideoId ? "is-opening" : ""}`} onClick={() => watch(item)} disabled={Boolean(opening)}>
      <span className="youtube-thumbnail"><img src={`https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`} alt="" loading="lazy" /><Play size={24} />{item.durationSeconds > 0 && <small>{duration(item.durationSeconds)}</small>}</span>
      <strong>{item.title}</strong><span>{[item.channelName, views(item.views)].filter(Boolean).join(" · ")}</span>
    </button>)}</div>
    </>}
    {loading && <div className="youtube-loading" role="status"><LoaderCircle className="spin" />{t("youtube.loading")}</div>}
    {!loading && !error && !items.length && <p className="youtube-empty">{t("youtube.empty")}</p>}
    {next && !error && !loading && !selected && <button className="button yt-more-main" onClick={() => setCursor(next)}>{t("youtube.more")}</button>}
  </div>;
}
