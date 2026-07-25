import { ArrowLeft, Bookmark, BookOpen, ChevronLeft, ChevronRight, Heart, LoaderCircle, Minus, Moon, Plus, Search, Share2, Sun, Type, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";

type GutendexBook = { id: number; title: string; authors: Array<{ name: string }>; summaries?: string[]; subjects: string[]; bookshelves: string[]; languages: string[]; copyright: boolean | null; formats: Record<string,string>; download_count: number };
type BookPage = { count: number; next: string | null; previous: string | null; results: GutendexBook[] };
type ReaderTheme = "light" | "sepia" | "dark";

const categories = ["popular", "fiction", "history", "science", "children", "philosophy", "poetry"] as const;
type Category = typeof categories[number];
const categoryLabelKeys: Record<Category, string> = { popular: "categoryPopular", fiction: "categoryFiction", history: "categoryHistory", science: "categoryScience", children: "categoryChildren", philosophy: "categoryPhilosophy", poetry: "categoryPoetry" };
const topics: Partial<Record<Category, string>> = { fiction: "fiction", history: "history", science: "science", children: "children", philosophy: "philosophy", poetry: "poetry" };
const savedIds = () => JSON.parse(localStorage.getItem("optima-library-saved") || "[]") as number[];

export function LibraryPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<Category>("popular");
  const [page, setPage] = useState<BookPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GutendexBook | null>(null);
  const [readerBook, setReaderBook] = useState<GutendexBook | null>(null);
  const [readerText, setReaderText] = useState("");
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("sepia");
  const [fontSize, setFontSize] = useState(18);
  const [saved, setSaved] = useState<number[]>(savedIds);

  function author(book: GutendexBook) { return book.authors.map((item) => item.name).join(", ") || t("library.unknownAuthor"); }
  function cover(book: GutendexBook) { return book.formats["image/jpeg"] || ""; }
  function readingUrl(book: GutendexBook) { return book.formats["text/plain; charset=utf-8"] || book.formats["text/plain; charset=us-ascii"] || book.formats["text/html"] || ""; }

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    else if (topics[category]) params.set("topic", topics[category]!);
    params.set("copyright", "false");
    setLoading(true);
    fetch(`https://gutendex.com/books/?${params}`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<BookPage>; }).then(setPage).catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) setPage(null); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debounced, category]);

  const featured = useMemo(() => page?.results[0] || null, [page]);
  function toggleSaved(id: number) { setSaved((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; localStorage.setItem("optima-library-saved", JSON.stringify(next)); return next; }); }
  async function openReader(book: GutendexBook) {
    const url = readingUrl(book); if (!url) { setSelected(book); return; }
    setReaderBook(book); setReaderText(""); setReaderLoading(true);
    try { const result = await api.library.read(url); const raw = result.content; const text = result.contentType.includes("html") || raw.trimStart().startsWith("<") ? new DOMParser().parseFromString(raw, "text/html").body.innerText : raw; setReaderText(text.replace(/\n{4,}/g, "\n\n\n")); }
    catch { setReaderText(t("library.readFailed")); }
    finally { setReaderLoading(false); }
  }

  if (readerBook) return <div className={`book-reader reader-${readerTheme}`}><header><button onClick={() => setReaderBook(null)} aria-label={t("library.backToLibraryAria")}><ArrowLeft /></button><div><strong>{readerBook.title}</strong><small>{author(readerBook)}</small></div><div className="reader-tools"><button onClick={() => setFontSize((value) => Math.max(14,value-1))}><Minus /></button><span><Type /> {fontSize}</span><button onClick={() => setFontSize((value) => Math.min(28,value+1))}><Plus /></button><button onClick={() => setReaderTheme(readerTheme === "light" ? "sepia" : readerTheme === "sepia" ? "dark" : "light")}>{readerTheme === "dark" ? <Moon /> : <Sun />}</button><button onClick={() => toggleSaved(readerBook.id)} className={saved.includes(readerBook.id) ? "active" : ""}><Bookmark /></button></div></header><div className="reader-progress"><i /></div><main style={{ fontSize }}>{readerLoading ? <LoaderCircle className="spin" /> : <pre>{readerText}</pre>}</main></div>;

  return <div className="library-page">
    <header className="library-heading"><div><span>OPTIMA LIBRARY</span><h1>{t("library.pageTitle")}</h1><p>{t("library.pageDescription")}</p></div><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("library.searchPlaceholder")} />{query && <button onClick={() => setQuery("")}><X /></button>}</label></header>
    <nav className="library-categories">{categories.map((item) => <button key={item} onClick={() => { setQuery(""); setCategory(item); }} className={category === item && !debounced ? "active" : ""}>{t(`library.${categoryLabelKeys[item]}`)}</button>)}</nav>
    {featured && !debounced && <section className="library-featured"><div><span>{t("library.todayPick")}</span><h2>{featured.title}</h2><p>{featured.summaries?.[0] || featured.subjects.slice(0,3).join(" · ")}</p><small>{author(featured)} · {featured.languages.join(", ").toUpperCase()}</small><div><button className="primary" onClick={() => void openReader(featured)}><BookOpen /> {t("library.startReading")}</button><button onClick={() => toggleSaved(featured.id)}><Bookmark /> {t("library.save")}</button></div></div>{cover(featured) && <img src={cover(featured)} alt={featured.title} />}</section>}
    <section className="library-section"><header><div><span>{debounced ? t("library.searchResults") : t(`library.${categoryLabelKeys[category]}`).toUpperCase()}</span><h2>{debounced ? t("library.searchResultsFor", { query: debounced }) : t("library.openShelfBooks")}</h2></div><small>{page?.count ? t("library.bookCount", { count: page.count.toLocaleString() }) : ""}</small></header>
      {loading ? <div className="library-loading"><LoaderCircle className="spin" /><span>{t("library.loadingBooks")}</span></div> : !page ? <div className="library-empty">{t("library.sourceUnreachable")}</div> : <div className="book-grid">{page.results.map((book) => <article className="book-card" key={book.id}><button className="book-cover" onClick={() => setSelected(book)}>{cover(book) ? <img loading="lazy" src={cover(book)} alt={book.title} /> : <span><BookOpen /></span>}<i>{book.languages[0]?.toUpperCase()}</i></button><div><h3>{book.title}</h3><p>{author(book)}</p><small>{t("library.readTimes", { count: book.download_count.toLocaleString() })}</small><div><button onClick={() => void openReader(book)} disabled={!readingUrl(book)}><BookOpen /> {t("library.read")}</button><button onClick={() => toggleSaved(book.id)} className={saved.includes(book.id) ? "active" : ""} aria-label={t("library.saveAria")}><Heart /></button></div></div></article>)}</div>}
      {page && <div className="library-pagination"><button disabled={!page.previous} onClick={() => page.previous && fetch(page.previous).then((r) => r.json()).then(setPage)}><ChevronLeft /> {t("library.previous")}</button><button disabled={!page.next} onClick={() => page.next && fetch(page.next).then((r) => r.json()).then(setPage)}>{t("library.next")} <ChevronRight /></button></div>}
    </section>
    {selected && <div className="book-detail-backdrop" onClick={() => setSelected(null)}><aside onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelected(null)}><X /></button>{cover(selected) && <img src={cover(selected)} alt={selected.title} />}<span>{t("library.publicDomain")}</span><h2>{selected.title}</h2><p className="author">{author(selected)}</p><p>{selected.summaries?.[0] || t("library.defaultSummary")}</p><div className="subject-list">{selected.subjects.slice(0,5).map((subject) => <small key={subject}>{subject}</small>)}</div><div className="detail-actions"><button onClick={() => void openReader(selected)} disabled={!readingUrl(selected)}><BookOpen /> {t("library.readOnline")}</button><button onClick={() => toggleSaved(selected.id)}><Bookmark /></button><button onClick={() => void navigator.share?.({ title:selected.title, url:window.location.href })}><Share2 /></button></div></aside></div>}
  </div>;
}