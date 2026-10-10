import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Play, Search, X, Youtube } from "lucide-react";
import { api } from "../lib/api";
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
export function YoutubePage() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<"youtube" | "catalog" | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VideoItem[]>([]);
  const [cursor, setCursor] = useState<{ page: number; token: string | null }>({ page: 1, token: null });
  const [next, setNext] = useState<{ page: number; token: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
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
      ? (query ? api.youtube.search(query, cursor.token ?? undefined) : api.youtube.popular(cursor.token ?? undefined)).then((result) => ({
        items: result.items.map((item) => ({ ...item, key: item.youtubeVideoId })),
        next: result.nextPageToken ? { page: cursor.page + 1, token: result.nextPageToken } : null,
      }))
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
    if (id) { setSelected({ id, title: "YouTube" }); return; }
    setQuery(draft.trim());
    setCursor({ page: 1, token: null });
  }

  const views = (count?: number | null) => count == null ? "" : t("youtube.views", { count: new Intl.NumberFormat(locale, { notation: "compact" }).format(count) });

  return <div className="page youtube-page">
    <header className="youtube-heading"><Youtube size={28} /><h1>YouTube</h1></header>
    <form className="youtube-search" onSubmit={submit}>
      <Search size={20} /><input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={t("youtube.search")} placeholder={t("youtube.search")} />
      {draft && <button type="button" className="icon-button" onClick={() => { setDraft(""); if (query) { setQuery(""); setCursor({ page: 1, token: null }); } }} aria-label={t("youtube.clear")}><X size={18} /></button>}
      <button className="icon-button" disabled={loading} aria-label={t("youtube.search")}><Search size={20} /></button>
    </form>
    <p className="youtube-catalog-label">{mode === "youtube" ? (query ? t("youtube.resultsFor", { query }) : t("youtube.popularUz")) : t("youtube.catalog")}</p>
    {selected && <section className="youtube-player"><header><h2>{selected.title}</h2><a href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("youtube.external")} title={t("youtube.external")}><ExternalLink size={20} /></a><button className="icon-button" onClick={() => setSelected(null)} aria-label={t("youtube.close")}><X size={20} /></button></header><iframe key={selected.id} src={`https://www.youtube-nocookie.com/embed/${selected.id}?rel=0&playsinline=1&autoplay=1`} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></section>}
    {error && <p role="alert">{error}</p>}
    <div className="youtube-grid">{items.map((item) => <button key={item.key} className="youtube-video" onClick={() => { setSelected({ id: item.youtubeVideoId, title: item.title }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
      <span className="youtube-thumbnail"><img src={`https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`} alt="" loading="lazy" /><Play size={24} />{item.durationSeconds > 0 && <small>{duration(item.durationSeconds)}</small>}</span>
      <strong>{item.title}</strong><span>{[item.channelName, views(item.views)].filter(Boolean).join(" · ")}</span>
    </button>)}</div>
    {loading && <div className="youtube-loading" role="status"><LoaderCircle className="spin" />{t("youtube.loading")}</div>}
    {!loading && !error && !items.length && <p className="youtube-empty">{t("youtube.empty")}</p>}
    {next && !error && !loading && <button className="button" onClick={() => setCursor(next)}>{t("youtube.more")}</button>}
  </div>;
}
