import { ArrowLeft, Bookmark, BookOpen, Check, ExternalLink, Eye, Heart, LoaderCircle, Minus, Moon, Plus, Search, Star, Sun, Trash2, Type, X } from "lucide-react";
import { cdnImage } from "../lib/cdn";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../components/ui";
import { BookReader } from "../components/BookReader";
import { useToast } from "../components/Toast";
import { useLocation, useParams } from "wouter";
import { api, type LibraryBook, type LibraryReviews, type ReadingProgress } from "../lib/api";
import { useI18n } from "../lib/i18n/i18n";
import { useOutsideClose } from "../lib/useOutsideClose";

type ReaderTheme = "light" | "sepia" | "dark";
type Lang = "uz" | "en" | "ru" | "tr";
const languages: Array<[Lang, string]> = [["uz", "O‘zbekcha"], ["en", "English"], ["ru", "Русский"], ["tr", "Türkçe"]];
const subjects = ["all", "fiction", "history", "science", "children", "poetry", "philosophy", "religion"] as const;
type Subject = typeof subjects[number];

function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (value: number) => void; size?: number }) {
  return (
    <span className={`book-stars ${onChange ? "editable" : ""}`} role={onChange ? "radiogroup" : "img"} aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => onChange
        ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`} onClick={() => onChange(n)}><Star size={size} className={n <= value ? "on" : ""} /></button>
        : <Star key={n} size={size} className={n <= Math.round(value) ? "on" : ""} />)}
    </span>
  );
}

/** This device's last reading position for a book (written on every page turn). */
function localPosition(slug: string): { position: number; at: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem(`optima-read:${slug}`) ?? "null");
    return value && typeof value.position === "number" && typeof value.at === "number" ? value : null;
  } catch {
    return null;
  }
}

export function LibraryPage() {
  const { t, locale } = useI18n();
  const { show } = useToast();
  const [lang, setLang] = useState<Lang>(() => (["uz", "en", "ru", "tr"].includes(locale) ? locale as Lang : "uz"));
  const [subject, setSubject] = useState<Subject>("all");
  // Only books that open in Optima's own reader — never a link out to another site.
  const readableOnly = true;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // The open book follows the route (/library/:slug): our own record, with views.
  const { slug, mode } = useParams<{ slug?: string; mode?: string }>();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<LibraryBook | null>(null);
  const [bookSlug, setBookSlug] = useState<string | null>(null);
  const [bookViews, setBookViews] = useState<number | null>(null);
  const counted = useRef<string | null>(null);
  // Reading position: shown as "continue reading", saved every 2 minutes and on leaving.
  const [bookProgress, setBookProgress] = useState<ReadingProgress | null>(null);
  const [readerStart, setReaderStart] = useState<number | null>(null);
  const position = useRef<{ slug: string; progress: ReadingProgress; saved: number } | null>(null);
  const fromStart = useRef(false);
  const [reviews, setReviews] = useState<LibraryReviews | null>(null);
  const [myRating, setMyRating] = useState(0);
  const [myText, setMyText] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [reader, setReader] = useState<LibraryBook | null>(null);
  const [readerText, setReaderText] = useState("");
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerFailed, setReaderFailed] = useState(false);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("sepia");
  const [fontSize, setFontSize] = useState(18);
  // Saves and likes live on the server (they follow the reader across devices).
  const [saved, setSaved] = useState<string[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [shelf, setShelf] = useState<"browse" | "saved" | "reading" | "finished">("browse");
  const [savedBooks, setSavedBooks] = useState<LibraryBook[]>([]);
  // Books with a reading position: "Reading" (< 98%) and "Finished".
  const [readingList, setReadingList] = useState<Array<{ slug: string; book: LibraryBook; position: number }>>([]);
  const request = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const closePanel = useCallback(() => navigate("/library"), [navigate]);
  useOutsideClose(panelRef, Boolean(selected) && !reader, closePanel);

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 400); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [lang, subject, debounced, readableOnly]);

  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setFailed(false);
    api.library.search({ q: debounced, lang, subject, page, readable: readableOnly })
      .then((result) => {
        if (sequence !== request.current) return;
        const items = readableOnly ? result.items.filter((book) => book.readable) : result.items;
        setBooks((current) => page === 1 ? items : [...current, ...items.filter((book) => !current.some((item) => item.key === book.key))]);
        setTotal(result.total);
        setHasMore(result.hasMore);
      })
      .catch(() => { if (sequence === request.current) { setFailed(true); if (page === 1) setBooks([]); } })
      .finally(() => { if (sequence === request.current) setLoading(false); });
  }, [lang, subject, debounced, page, readableOnly]);

  useEffect(() => {
    if (!selected) return;
    setReviews(null);
    setMyRating(0);
    setMyText("");
    api.library.reviews(selected.key).then((result) => {
      setReviews(result);
      const mine = result.items.find((item) => item.mine);
      if (mine) { setMyRating(mine.rating); setMyText(mine.body); }
    }).catch(() => setReviews({ count: 0, average: null, items: [] }));
  }, [selected]);

  useEffect(() => {
    api.library.marks().then((marks) => { setSaved(marks.saved); setLiked(marks.liked); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (shelf === "saved") api.library.saved().then(setSavedBooks).catch(() => setSavedBooks([]));
  }, [shelf, saved.length]);
  // The reading shelves (and their counts); refreshed whenever a reader closes.
  useEffect(() => {
    if (mode === "read") return;
    api.library.reading().then((rows) => setReadingList(rows.map((row) => ({ slug: row.slug, book: row.book, position: Math.max(row.position, localPosition(row.slug)?.position ?? 0) })))).catch(() => undefined);
  }, [mode]);
  const finishedAt = 0.98;
  const readingBooks = readingList.filter((item) => item.position < finishedAt);
  const finishedBooks = readingList.filter((item) => item.position >= finishedAt);
  const shelfBooks = shelf === "saved" ? savedBooks : shelf === "reading" ? readingBooks.map((item) => item.book) : shelf === "finished" ? finishedBooks.map((item) => item.book) : books;
  const progressOf = (key: string) => readingList.find((item) => item.book.key === key)?.position ?? null;

  // Route → open book. A slug we haven't opened in this tab is loaded from the server.
  useEffect(() => {
    if (!slug) { setSelected(null); setBookSlug(null); setBookViews(null); counted.current = null; return; }
    if (bookSlug === slug && selected) return;
    let cancelled = false;
    api.media.get(slug).then((page) => {
      if (cancelled) return;
      if (page.provider !== "library" || !page.meta.book) { navigate("/library", { replace: true }); return; }
      setSelected(page.meta.book);
      setBookSlug(page.slug);
      setBookViews(page.views);
      setBookProgress(page.progress);
    }).catch(() => { if (!cancelled) navigate("/library", { replace: true }); });
    return () => { cancelled = true; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug || counted.current === slug) return;
    counted.current = slug;
    api.media.view(slug).then(({ views }) => setBookViews(views)).catch(() => undefined);
  }, [slug]);

  /** Card → the book's own page: registered once, then a normal route. */
  async function openBook(book: LibraryBook) {
    setSelected(book); // show it right away; the slug follows
    try {
      const page = await api.library.open(book);
      setBookSlug(page.slug);
      setBookViews(page.views);
      setBookProgress(page.progress);
      navigate(`/library/${page.slug}`);
    } catch (error) {
      setSelected(null);
      show(error instanceof Error ? error.message : t("library.loadFailed"), "error");
    }
  }

  async function toggleSaved(book: LibraryBook) {
    const on = !saved.includes(book.key);
    setSaved((current) => on ? [...current, book.key] : current.filter((key) => key !== book.key));
    try {
      if (on) await api.library.save(book); else await api.library.unsave(book.key);
      if (reviews && selected?.key === book.key) setReviews({ ...reviews, saved: on });
      show(on ? t("library.savedToast") : t("library.unsavedToast"));
    } catch (error) {
      setSaved((current) => on ? current.filter((key) => key !== book.key) : [...current, book.key]);
      show(error instanceof Error ? error.message : t("library.saveFailed"), "error");
    }
  }

  async function toggleLiked(book: LibraryBook) {
    const on = !liked.includes(book.key);
    setLiked((current) => on ? [...current, book.key] : current.filter((key) => key !== book.key));
    try {
      const result = on ? await api.library.like(book.key, book) : await api.library.unlike(book.key);
      if (reviews && selected?.key === book.key) setReviews({ ...reviews, liked: result.liked, likes: result.likes });
    } catch {
      setLiked((current) => on ? current.filter((key) => key !== book.key) : [...current, book.key]);
    }
  }
  const author = (book: LibraryBook) => book.authors.join(", ") || t("library.unknownAuthor");

  /** Writes the reading position if it moved since the last write. */
  const savePosition = useCallback(() => {
    const current = position.current;
    if (!current || current.progress.position === current.saved) return;
    current.saved = current.progress.position;
    void api.media.progress(current.slug, current.progress).catch(() => { current.saved = -1; });
  }, []);
  const onPosition = useCallback((value: number, pageNumber: number, totalPages: number) => {
    if (!position.current) return;
    position.current.progress = { position: value, page: pageNumber, totalPages };
    setBookProgress(position.current.progress);
    // Every turn is kept on this device at once; the server gets it every 2 minutes / on leaving.
    try { localStorage.setItem(`optima-read:${position.current.slug}`, JSON.stringify({ position: value, at: Date.now() })); } catch { /* storage off */ }
  }, []);
  useEffect(() => {
    if (!reader) return;
    const timer = window.setInterval(savePosition, 2 * 60 * 1000);
    const onHidden = () => { if (document.visibilityState === "hidden") savePosition(); };
    window.addEventListener("pagehide", savePosition);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", savePosition);
      document.removeEventListener("visibilitychange", onHidden);
      savePosition(); // closing the reader
    };
  }, [reader, savePosition]);

  /** Opening the reader is a route (/library/:slug/read): reload or Back behave. */
  async function openReader(book: LibraryBook, startOver = false) {
    if (!book.readable) { window.open(book.sourceUrl, "_blank", "noopener,noreferrer"); return; }
    fromStart.current = startOver;
    try {
      const target = bookSlug && selected?.key === book.key ? bookSlug : (await api.library.open(book)).slug;
      if (selected?.key !== book.key) { setSelected(book); setBookSlug(target); }
      navigate(`/library/${target}/read`);
    } catch (error) {
      show(error instanceof Error ? error.message : t("library.loadFailed"), "error");
    }
  }

  // Route → reader: /read opens it for the book on the page; leaving the route closes it.
  useEffect(() => {
    if (mode === "read" && selected && reader?.key !== selected.key) {
      void startReader(selected, fromStart.current);
      fromStart.current = false;
    }
    if (mode !== "read" && reader) setReader(null);
  }, [mode, selected?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** `startOver`: ignore the saved position. */
  async function startReader(book: LibraryBook, startOver = false) {
    setReader(book);
    position.current = null;
    setReaderStart(null);
    // The book's record carries the saved position (and gives progress a place to go).
    api.library.open(book).then((page) => {
      // The newer of this device's position and the server's (another device may be ahead).
      const local = localPosition(page.slug);
      const server = page.progress;
      const newest = local && (!server?.updatedAt || local.at > Date.parse(server.updatedAt)) ? local.position : server?.position ?? 0;
      const start = startOver ? 0 : newest;
      position.current = { slug: page.slug, progress: { position: start, page: server?.page ?? 0, totalPages: server?.totalPages ?? 0 }, saved: server?.position ?? -1 };
      setReaderStart(start);
    }).catch(() => setReaderStart(0)); // read anyway; the position just won't be kept
    setReaderText("");
    setReaderFailed(false);
    if (!book.textUrl) return; // Open Library scans open in the embedded reader.
    setReaderLoading(true);
    try {
      const result = await api.library.read(book.textUrl);
      const raw = result.content;
      const text = result.contentType.includes("html") || raw.trimStart().startsWith("<") ? new DOMParser().parseFromString(raw, "text/html").body.innerText : raw;
      setReaderText(text.replace(/\n{4,}/g, "\n\n\n"));
    } catch {
      setReaderFailed(true);
    } finally {
      setReaderLoading(false);
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!selected || !myRating) { show(t("library.pickRating"), "error"); return; }
    setSavingReview(true);
    try {
      setReviews(await api.library.saveReview(selected.key, myRating, myText));
      show(t("library.reviewSaved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("library.reviewFailed"), "error");
    } finally {
      setSavingReview(false);
    }
  }

  async function removeReview() {
    if (!selected) return;
    try {
      setReviews(await api.library.deleteReview(selected.key));
      setMyRating(0);
      setMyText("");
    } catch (error) {
      show(error instanceof Error ? error.message : t("library.reviewFailed"), "error");
    }
  }

  if (reader) {
    return <div className={`book-reader reader-${readerTheme} ${reader.embedUrl ? "reader-embed" : ""}`}>
      <header>
        <button onClick={() => navigate(bookSlug ? `/library/${bookSlug}` : "/library")} aria-label={t("library.backToLibraryAria")}><ArrowLeft /></button>
        <div><strong>{reader.title}</strong><small>{author(reader)}</small></div>
        <div className="reader-tools">
          {!reader.embedUrl && <>
            <button onClick={() => setFontSize((value) => Math.max(14, value - 1))} aria-label="A-"><Minus /></button><span><Type /> {fontSize}</span>
            <button onClick={() => setFontSize((value) => Math.min(28, value + 1))} aria-label="A+"><Plus /></button>
            <button onClick={() => setReaderTheme(readerTheme === "light" ? "sepia" : readerTheme === "sepia" ? "dark" : "light")} aria-label={t("library.readerTheme")}>{readerTheme === "dark" ? <Moon /> : <Sun />}</button>
          </>}
          <button onClick={() => void toggleSaved(reader)} className={saved.includes(reader.key) ? "active" : ""} aria-label={t("library.saveAria")} aria-pressed={saved.includes(reader.key)}><Bookmark /></button>
        </div>
      </header>
      {reader.embedUrl
        ? <iframe className="reader-frame" src={reader.embedUrl} title={reader.title} allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <main style={{ fontSize }}>{readerLoading ? <LoaderCircle className="spin" /> : readerFailed
          ? <div className="reader-failed"><p>{t("library.readFailed")}</p><div><button onClick={() => void openReader(reader)}>{t("library.retry")}</button><a href={reader.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{t("library.openSource")}</a></div></div>
          : readerText && readerStart !== null
            ? <BookReader key={reader.key} text={readerText} fontSize={fontSize} initialPosition={readerStart} onPosition={onPosition}
                labels={{ previous: t("library.prevPage"), next: t("library.nextPage"), paginating: t("library.paginating"), pageOf: (page, total) => t("library.pageOf", { page, total }) }} />
            : null}</main>}
    </div>;
  }

  return <div className="library-page lib2">
    <header className="library-heading">
      <div><span>OPTIMA LIBRARY</span><h1>{t("library.pageTitle")}</h1><p>{t("library.pageDescriptionOpen")}</p></div>
      <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("library.searchPlaceholder")} />{query && <button onClick={() => setQuery("")} aria-label={t("library.clearSearch")}><X /></button>}</label>
    </header>
    <nav className="lib2-langs" aria-label={t("library.languageAria")}>
      {languages.map(([value, label]) => <button key={value} type="button" className={lang === value ? "active" : ""} aria-pressed={lang === value} onClick={() => setLang(value)}>{label}</button>)}
    </nav>
    <nav className="lib2-shelves" aria-label={t("library.shelvesAria")}>
      <button type="button" className={shelf === "browse" ? "active" : ""} onClick={() => setShelf("browse")}>{t("library.shelfBrowse")}</button>
      <button type="button" className={shelf === "reading" ? "active" : ""} onClick={() => setShelf("reading")}><BookOpen size={16} />{t("library.shelfReading")}{readingBooks.length ? <b>{readingBooks.length}</b> : null}</button>
      <button type="button" className={shelf === "finished" ? "active" : ""} onClick={() => setShelf("finished")}><Check size={16} />{t("library.shelfFinished")}{finishedBooks.length ? <b>{finishedBooks.length}</b> : null}</button>
      <button type="button" className={shelf === "saved" ? "active" : ""} onClick={() => setShelf("saved")}><Bookmark size={16} />{t("library.shelfSaved")}{saved.length ? <b>{saved.length}</b> : null}</button>
    </nav>
    {shelf === "browse" && <nav className="library-categories">
      {subjects.map((item) => <button key={item} aria-pressed={subject === item} onClick={() => setSubject(item)} className={subject === item ? "active" : ""}>{t(`library.subject_${item}`)}</button>)}
    </nav>}
    <section className="library-section">
      <header><div><span>{shelf === "saved" ? t("library.shelfSaved") : shelf === "reading" ? t("library.shelfReading") : shelf === "finished" ? t("library.shelfFinished") : lang === "en" ? "Project Gutenberg" : "Open Library"}</span><h2>{shelf === "saved" ? t("library.savedTitle") : shelf === "reading" ? t("library.readingTitle") : shelf === "finished" ? t("library.finishedTitle") : debounced ? t("library.searchResultsFor", { query: debounced }) : lang === "uz" ? t("library.uzbekLiterature") : t("library.openShelfBooks")}</h2></div><small>{shelf !== "browse" ? "" : total ? t("library.bookCount", { count: total.toLocaleString() }) : ""}</small></header>
      {shelf === "browse" && failed && !books.length ? <div className="library-empty">{t("library.sourceUnreachable")}</div>
        : (shelf !== "browse" || !loading) && !shelfBooks.length ? <div className="library-empty">{shelf === "saved" ? t("library.savedEmpty") : shelf === "reading" ? t("library.readingEmpty") : shelf === "finished" ? t("library.finishedEmpty") : t("library.nothingFound")}</div>
        : <div className="book-grid">{shelfBooks.map((book) => <article className={`book-card ${book.readable ? "" : "not-readable"}`} key={book.key}>
          <button className="book-cover" onClick={() => void (shelf === "reading" ? openReader(book) : openBook(book))} aria-label={book.title}>
            {progressOf(book.key) !== null && <span className="lib2-card-progress" aria-label={`${Math.round((progressOf(book.key) ?? 0) * 100)}%`}><i style={{ width: `${Math.round((progressOf(book.key) ?? 0) * 100)}%` }} /></span>}
            {book.cover ? <img loading="lazy" decoding="async" src={cdnImage(book.cover)} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
            {/* No scan cover (most Uzbek titles): a typeset one instead of a blank card. */}
            <span className={`lib2-gen-cover tone-${(book.title.length + book.authors.join("").length) % 5}`}><b>{book.title}</b><small>{author(book)}</small></span>
            {book.languages[0] && <i>{book.languages[0].slice(0, 3).toUpperCase()}</i>}
          </button>
          <div>
            <h3>{book.title}</h3><p>{author(book)}</p>
            <small>{[book.year, t("library.readTimes", { count: book.downloads.toLocaleString() })].filter(Boolean).join(" · ")}</small>
            <div>
              {book.readable
                ? <button onClick={() => void openReader(book)}><BookOpen /> {t("library.read")}</button>
                : <button onClick={() => void openBook(book)} className="muted"><BookOpen /> {t("library.details")}</button>}
              <button onClick={() => void toggleLiked(book)} className={liked.includes(book.key) ? "active liked" : ""} aria-label={t("library.likeAria")} aria-pressed={liked.includes(book.key)}><Heart /></button>
              <button onClick={() => void toggleSaved(book)} className={saved.includes(book.key) ? "active" : ""} aria-label={t("library.saveAria")} aria-pressed={saved.includes(book.key)}><Bookmark /></button>
            </div>
          </div>
        </article>)}</div>}
      {loading && shelf === "browse" && <div className="library-loading"><LoaderCircle className="spin" /><span>{t("library.loadingBooks")}</span></div>}
      {hasMore && !loading && shelf === "browse" && <div className="library-pagination"><button onClick={() => setPage((value) => value + 1)}>{t("library.loadMore")}</button></div>}
    </section>

    {selected && <div className="book-detail-backdrop">
      <aside ref={panelRef} className="lib2-detail" role="dialog" aria-modal="true" aria-label={selected.title}>
        <button className="close" onClick={closePanel} aria-label={t("common.close")}><X /></button>
        <div className="lib2-detail-top">
          {selected.cover && <img src={cdnImage(selected.cover)} alt="" />}
          <div>
            <span>{selected.source === "gutenberg" ? t("library.publicDomain") : "Open Library"}</span>
            <h2>{selected.title}</h2>
            <p className="author">{author(selected)}{selected.year ? ` · ${selected.year}` : ""}</p>
            {bookViews !== null && <p className="lib2-views"><Eye size={15} />{t("library.optimaViews", { count: bookViews.toLocaleString() })}</p>}
            <div className="lib2-rating">{reviews && reviews.average !== null ? <><Stars value={reviews.average} /><strong>{reviews.average.toFixed(1)}</strong><small>{t("library.reviewsCount", { count: reviews.count })}</small></> : <small>{t("library.noReviewsYet")}</small>}</div>
          </div>
        </div>
        {selected.description && <p className="lib2-desc">{selected.description}</p>}
        <div className="detail-actions">
          {selected.readable && selected.textUrl && bookProgress && bookProgress.position > 0.005 && bookProgress.position < 0.995
            ? <><button className="lib2-continue" onClick={() => void openReader(selected)}><BookOpen /> {t("library.continueReading", { percent: Math.round(bookProgress.position * 100) })}</button>
              <button className="lib2-from-start" onClick={() => void openReader(selected, true)}>{t("library.fromStart")}</button></>
            : selected.readable
            ? <button onClick={() => void openReader(selected)}><BookOpen /> {t("library.readOnline")}</button>
            : <a className="lib2-source-btn" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> {t("library.viewOnOpenLibrary")}</a>}
          <button onClick={() => void toggleLiked(selected)} className={liked.includes(selected.key) ? "active liked" : ""} aria-label={t("library.likeAria")}><Heart />{reviews?.likes ? <small>{reviews.likes}</small> : null}</button>
          <button onClick={() => void toggleSaved(selected)} className={saved.includes(selected.key) ? "active" : ""} aria-label={t("library.saveAria")} aria-pressed={saved.includes(selected.key)}><Bookmark /></button>
          <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={t("library.openSource")}><ExternalLink /></a>
        </div>

        <section className="lib2-reviews">
          <h3>{t("library.reviewsTitle")}</h3>
          <form onSubmit={(event) => void submitReview(event)} className="lib2-review-form">
            <Stars value={myRating} onChange={setMyRating} size={24} />
            <textarea value={myText} maxLength={2000} rows={3} placeholder={t("library.reviewPlaceholder")} onChange={(event) => setMyText(event.target.value)} />
            <div>
              {reviews?.items.some((item) => item.mine) && <button type="button" className="ghost" onClick={() => void removeReview()}><Trash2 size={16} />{t("common.delete")}</button>}
              <button type="submit" disabled={savingReview || !myRating}>{savingReview ? <LoaderCircle className="spin" size={16} /> : null}{reviews?.items.some((item) => item.mine) ? t("library.updateReview") : t("library.postReview")}</button>
            </div>
          </form>
          {reviews === null ? <div className="library-loading"><LoaderCircle className="spin" /></div>
            : reviews.items.map((review) => <article key={review.id} className={`lib2-review ${review.mine ? "mine" : ""}`}>
              <Avatar firstName={review.author.firstName} lastName={review.author.lastName} url={review.author.avatarUrl} size="sm" />
              <div><header><strong>{review.author.firstName} {review.author.lastName}</strong><Stars value={review.rating} size={13} /></header>{review.body && <p>{review.body}</p>}<small>{new Date(review.updatedAt).toLocaleDateString()}</small></div>
            </article>)}
        </section>
      </aside>
    </div>}
  </div>;
}
