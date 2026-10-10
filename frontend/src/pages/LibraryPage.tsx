import { ArrowLeft, Bookmark, BookOpen, ExternalLink, Heart, LoaderCircle, Minus, Moon, Plus, Search, Star, Sun, Trash2, Type, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../components/ui";
import { useToast } from "../components/Toast";
import { api, type LibraryBook, type LibraryReviews } from "../lib/api";
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

export function LibraryPage() {
  const { t, locale } = useI18n();
  const { show } = useToast();
  const [lang, setLang] = useState<Lang>(() => (["uz", "en", "ru", "tr"].includes(locale) ? locale as Lang : "uz"));
  const [subject, setSubject] = useState<Subject>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<LibraryBook | null>(null);
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
  const [shelf, setShelf] = useState<"browse" | "saved">("browse");
  const [savedBooks, setSavedBooks] = useState<LibraryBook[]>([]);
  const request = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const closePanel = useCallback(() => setSelected(null), []);
  useOutsideClose(panelRef, Boolean(selected) && !reader, closePanel);

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 400); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [lang, subject, debounced]);

  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setFailed(false);
    api.library.search({ q: debounced, lang, subject, page })
      .then((result) => {
        if (sequence !== request.current) return;
        setBooks((current) => page === 1 ? result.items : [...current, ...result.items.filter((book) => !current.some((item) => item.key === book.key))]);
        setTotal(result.total);
        setHasMore(result.hasMore);
      })
      .catch(() => { if (sequence === request.current) { setFailed(true); if (page === 1) setBooks([]); } })
      .finally(() => { if (sequence === request.current) setLoading(false); });
  }, [lang, subject, debounced, page]);

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
      const result = on ? await api.library.like(book.key) : await api.library.unlike(book.key);
      if (reviews && selected?.key === book.key) setReviews({ ...reviews, liked: result.liked, likes: result.likes });
    } catch {
      setLiked((current) => on ? current.filter((key) => key !== book.key) : [...current, book.key]);
    }
  }
  const author = (book: LibraryBook) => book.authors.join(", ") || t("library.unknownAuthor");

  async function openReader(book: LibraryBook) {
    setReader(book);
    setReaderText("");
    setReaderFailed(false);
    if (!book.readable) { window.open(book.sourceUrl, "_blank", "noopener,noreferrer"); setReader(null); return; }
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
        <button onClick={() => setReader(null)} aria-label={t("library.backToLibraryAria")}><ArrowLeft /></button>
        <div><strong>{reader.title}</strong><small>{author(reader)}</small></div>
        <div className="reader-tools">
          {!reader.embedUrl && <>
            <button onClick={() => setFontSize((value) => Math.max(14, value - 1))} aria-label="A-"><Minus /></button><span><Type /> {fontSize}</span>
            <button onClick={() => setFontSize((value) => Math.min(28, value + 1))} aria-label="A+"><Plus /></button>
            <button onClick={() => setReaderTheme(readerTheme === "light" ? "sepia" : readerTheme === "sepia" ? "dark" : "light")} aria-label={t("library.readerTheme")}>{readerTheme === "dark" ? <Moon /> : <Sun />}</button>
          </>}
          <button onClick={() => void toggleSaved(reader)} className={saved.includes(reader.key) ? "active" : ""} aria-label={t("library.saveAria")}><Bookmark /></button>
        </div>
      </header>
      {reader.embedUrl
        ? <iframe className="reader-frame" src={reader.embedUrl} title={reader.title} allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <main style={{ fontSize }}>{readerLoading ? <LoaderCircle className="spin" /> : readerFailed
          ? <div className="reader-failed"><p>{t("library.readFailed")}</p><div><button onClick={() => void openReader(reader)}>{t("library.retry")}</button><a href={reader.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{t("library.openSource")}</a></div></div>
          : <pre>{readerText}</pre>}</main>}
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
      <button type="button" className={shelf === "saved" ? "active" : ""} onClick={() => setShelf("saved")}><Bookmark size={16} />{t("library.shelfSaved")}{saved.length ? <b>{saved.length}</b> : null}</button>
    </nav>
    {shelf === "browse" && <nav className="library-categories">
      {subjects.map((item) => <button key={item} aria-pressed={subject === item} onClick={() => setSubject(item)} className={subject === item ? "active" : ""}>{t(`library.subject_${item}`)}</button>)}
    </nav>}
    <section className="library-section">
      <header><div><span>{shelf === "saved" ? t("library.shelfSaved") : lang === "en" ? "Project Gutenberg" : "Open Library"}</span><h2>{shelf === "saved" ? t("library.savedTitle") : debounced ? t("library.searchResultsFor", { query: debounced }) : lang === "uz" ? t("library.uzbekLiterature") : t("library.openShelfBooks")}</h2></div><small>{shelf === "saved" ? "" : total ? t("library.bookCount", { count: total.toLocaleString() }) : ""}</small></header>
      {shelf === "browse" && failed && !books.length ? <div className="library-empty">{t("library.sourceUnreachable")}</div>
        : !loading && !(shelf === "saved" ? savedBooks : books).length ? <div className="library-empty">{shelf === "saved" ? t("library.savedEmpty") : t("library.nothingFound")}</div>
        : <div className="book-grid">{(shelf === "saved" ? savedBooks : books).map((book) => <article className={`book-card ${book.readable ? "" : "not-readable"}`} key={book.key}>
          <button className="book-cover" onClick={() => setSelected(book)} aria-label={book.title}>
            {book.cover ? <img loading="lazy" src={book.cover} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
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
                : <button onClick={() => setSelected(book)} className="muted"><BookOpen /> {t("library.details")}</button>}
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
        <button className="close" onClick={() => setSelected(null)} aria-label={t("common.close")}><X /></button>
        <div className="lib2-detail-top">
          {selected.cover && <img src={selected.cover} alt="" />}
          <div>
            <span>{selected.source === "gutenberg" ? t("library.publicDomain") : "Open Library"}</span>
            <h2>{selected.title}</h2>
            <p className="author">{author(selected)}{selected.year ? ` · ${selected.year}` : ""}</p>
            <div className="lib2-rating">{reviews && reviews.average !== null ? <><Stars value={reviews.average} /><strong>{reviews.average.toFixed(1)}</strong><small>{t("library.reviewsCount", { count: reviews.count })}</small></> : <small>{t("library.noReviewsYet")}</small>}</div>
          </div>
        </div>
        {selected.description && <p className="lib2-desc">{selected.description}</p>}
        <div className="detail-actions">
          {selected.readable
            ? <button onClick={() => void openReader(selected)}><BookOpen /> {t("library.readOnline")}</button>
            : <a className="lib2-source-btn" href={selected.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> {t("library.viewOnOpenLibrary")}</a>}
          <button onClick={() => void toggleLiked(selected)} className={liked.includes(selected.key) ? "active liked" : ""} aria-label={t("library.likeAria")}><Heart />{reviews?.likes ? <small>{reviews.likes}</small> : null}</button>
          <button onClick={() => void toggleSaved(selected)} className={saved.includes(selected.key) ? "active" : ""} aria-label={t("library.saveAria")}><Bookmark /></button>
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
