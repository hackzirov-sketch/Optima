import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Play, Search, X, Youtube } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";

type VideoItem = { id: string; youtubeVideoId: string; title: string; channelName: string; durationSeconds: number };
function videoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? url.pathname.split("/")[1] : ["youtube.com", "m.youtube.com"].includes(host) ? url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export function YoutubePage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true); setError("");
    api.education.videos({ q: query, page }).then(result => {
      if (sequence !== request.current) return;
      const valid = (result.items as VideoItem[]).filter(item => /^[A-Za-z0-9_-]{11}$/.test(item.youtubeVideoId));
      setItems(current => page === 1 ? valid : [...current, ...valid]); setMore(result.hasMore);
    }).catch(cause => { if (sequence === request.current) setError(cause instanceof Error ? cause.message : "Error"); }).finally(() => { if (sequence === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [query, page]);
  return <div className="page youtube-page">
    <header className="youtube-heading"><Youtube size={28} /><h1>YouTube</h1></header>
    <form className="youtube-search" onSubmit={event => { event.preventDefault(); const id = videoId(draft.trim()); if (id) setSelected({ id, title: "YouTube" }); else { setPage(1); setQuery(draft.trim()); } }}>
      <Search size={20} /><input value={draft} onChange={event => setDraft(event.target.value)} aria-label={t("youtube.search")} placeholder={t("youtube.search")} /><button className="icon-button" disabled={loading} aria-label={t("youtube.search")}><Search size={20} /></button>
    </form>
    <p className="youtube-catalog-label">{t("youtube.catalog")}</p>
    {selected && <section className="youtube-player"><header><h2>{selected.title}</h2><a href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("youtube.external")} title={t("youtube.external")}><ExternalLink size={20} /></a><button className="icon-button" onClick={() => setSelected(null)} aria-label={t("youtube.close")}><X size={20} /></button></header><iframe key={selected.id} src={`https://www.youtube-nocookie.com/embed/${selected.id}?rel=0&playsinline=1`} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></section>}
    {error && <p role="alert">{error}</p>}
    <div className="youtube-grid">{items.map(item => <button key={item.id} className="youtube-video" onClick={() => setSelected({ id: item.youtubeVideoId, title: item.title })}><span className="youtube-thumbnail"><img src={`https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`} alt="" loading="lazy" /><Play size={24} />{item.durationSeconds > 0 && <small>{Math.floor(item.durationSeconds / 60)}:{String(item.durationSeconds % 60).padStart(2, "0")}</small>}</span><strong>{item.title}</strong><span>{item.channelName}</span></button>)}</div>
    {loading && <div className="youtube-loading" role="status"><LoaderCircle className="spin" />{t("youtube.loading")}</div>}
    {!loading && !error && !items.length && <p className="youtube-empty">{t("youtube.empty")}</p>}
    {more && !error && <button className="button" disabled={loading} onClick={() => setPage(current => current + 1)}>{t("youtube.more")}</button>}
  </div>;
}
