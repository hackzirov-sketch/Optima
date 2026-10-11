import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** A piece of a paragraph on a page; `cont` = it continues from the previous page (no indent). */
type Part = { text: string; cont: boolean };
type Page = { start: number; parts: Part[] };
type Flip = { dir: 1 | -1; p: number };

const DOUBLE_MIN_WIDTH = 900;

/** Plain text → paragraphs (Gutenberg hard-wraps lines; a blank line ends a paragraph). */
function paragraphsOf(text: string) {
  return text.replace(/\r/g, "").split(/\n\s*\n/).map((block) => block.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
}

/**
 * Lays paragraphs out into pages without touching the DOM: words are measured
 * on a canvas (cached), lines are wrapped greedily as the browser does, and
 * lines are stacked into pages. A whole novel takes milliseconds. Lines are
 * wrapped against a hair less than the real width, so the page can only ever
 * fit the text more easily than computed — never overflow.
 */
function paginate(paragraphs: string[], box: { width: number; height: number; fontSize: number; padX: number; padTop: number; padBottom: number }): Page[] {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [];
  context.font = `${box.fontSize}px Georgia, "Times New Roman", serif`;
  const widths = new Map<string, number>();
  const measure = (word: string) => {
    let width = widths.get(word);
    if (width === undefined) { width = context.measureText(word).width; widths.set(word, width); }
    return width;
  };
  const space = measure(" ");
  const lineWidth = (box.width - box.padX * 2) * 0.985;
  const indent = box.fontSize * 1.4;
  const lineHeight = box.fontSize * 1.62;
  const gap = box.fontSize * 0.35;
  const usable = box.height - box.padTop - box.padBottom;

  const pages: Page[] = [];
  let page: Page = { start: 0, parts: [] };
  let used = 0;
  let offset = 0;
  for (const paragraph of paragraphs) {
    // Wrap into lines (each line = the words on it).
    const words = paragraph.split(" ");
    const lines: string[][] = [];
    let line: string[] = [];
    let width = indent;
    for (const word of words) {
      const w = measure(word);
      if (line.length && width + space + w > lineWidth) { lines.push(line); line = []; width = 0; }
      width += (line.length ? space : 0) + w;
      line.push(word);
    }
    if (line.length) lines.push(line);
    // Stack the lines onto pages, splitting the paragraph where a page ends.
    let piece: string[] = [];
    let cont = false;
    let pieceStart = offset;
    for (const current of lines) {
      if (used + lineHeight > usable && (page.parts.length || piece.length)) {
        if (piece.length) page.parts.push({ text: piece.join(" "), cont });
        pages.push(page);
        const at = pieceStart + (piece.length ? piece.join(" ").length + 1 : 0);
        page = { start: at, parts: [] };
        if (piece.length) { cont = true; pieceStart = at; }
        piece = [];
        used = 0;
      }
      piece.push(...current);
      used += lineHeight;
    }
    if (piece.length) page.parts.push({ text: piece.join(" "), cont });
    used += gap;
    offset += paragraph.length + 2;
  }
  if (page.parts.length) pages.push(page);
  return pages;
}

function PageView({ page, number, side }: { page?: Page; number: number; side: "left" | "right" | "single" }) {
  return <div className={`bk-page bk-${side}`}>
    {page && <div className="bk-page-inner">{page.parts.map((part, index) => <p key={index} className={part.cont ? "cont" : undefined}>{part.text}</p>)}</div>}
    {page && <span className="bk-folio">{number}</span>}
  </div>;
}

/**
 * A book-like reader for plain text: two facing pages on wide screens, one on
 * phones. Drag a page with the mouse or a finger to turn it (it follows the
 * pointer, and finishes or falls back when released); tap a page edge, use
 * the arrow keys or the buttons to turn it outright.
 */
export function BookReader({ text, fontSize, initialPosition, onPosition, labels }: {
  text: string;
  fontSize: number;
  /** 0..1 — where to open (the saved reading position). */
  initialPosition: number;
  onPosition: (position: number, page: number, totalPages: number) => void;
  labels: { previous: string; next: string; paginating: string; pageOf: (page: number, total: number) => string };
}) {
  const host = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number; double: boolean } | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [done, setDone] = useState(false);
  const [at, setAt] = useState(0);
  const [flip, setFlip] = useState<Flip | null>(null);
  const drag = useRef<{ x: number; dir: 1 | -1; moved: boolean; lastX: number; lastT: number; speed: number } | null>(null);
  const animation = useRef<number | null>(null);
  const restoring = useRef(initialPosition);

  const paragraphs = useMemo(() => paragraphsOf(text), [text]);
  const totalChars = useMemo(() => paragraphs.reduce((sum, item) => sum + item.length + 2, 0) || 1, [paragraphs]);

  // Book size: as large as the space allows, pages roughly 2:3.
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measureHost = () => {
      const rect = element.getBoundingClientRect();
      const double = rect.width >= DOUBLE_MIN_WIDTH;
      const height = Math.max(320, Math.min(rect.height - 24, 980));
      const pageWidth = Math.min(double ? (rect.width - 48) / 2 : rect.width - 24, height * 0.72);
      setSize((current) => current && current.double === double && Math.abs(current.width - pageWidth) < 2 && Math.abs(current.height - height) < 2 ? current : { width: Math.round(pageWidth), height: Math.round(height), double });
    };
    measureHost();
    const observer = new ResizeObserver(measureHost);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const double = Boolean(size?.double);
  const step = double ? 2 : 1;

  // (Re)paginate when the text, the page size or the font changes — keeping the reading place.
  useEffect(() => {
    const measure = measureRef.current;
    if (!size || !measure) return;
    // Paddings come from the stylesheet (they differ on phones).
    const style = getComputedStyle(measure);
    const made = paginate(paragraphs, {
      width: size.width, height: size.height, fontSize,
      padX: parseFloat(style.paddingLeft) || 0, padTop: parseFloat(style.paddingTop) || 0, padBottom: parseFloat(style.paddingBottom) || 0,
    });
    setPages(made);
    setDone(true);
  }, [paragraphs, size, fontSize]);

  // Land on the saved position (or the current one, after a re-layout) once its page exists.
  useEffect(() => {
    if (!pages.length) return;
    // +1: a position saved at a page's first character must land on that page, not the one before.
    const target = restoring.current * totalChars + 1;
    const last = pages[pages.length - 1];
    if (!done && last.start < target) return; // not laid out that far yet
    let index = pages.findIndex((page, i) => i === pages.length - 1 || pages[i + 1].start > target);
    if (index < 0) index = 0;
    setAt(double ? index - (index % 2) : index);
    if (done) restoring.current = -1;
  }, [pages, done, totalChars, double]);

  useEffect(() => {
    if (!pages.length || restoring.current >= 0) return;
    const page = pages[Math.min(at, pages.length - 1)];
    onPosition(Math.min(1, page.start / totalChars), at + 1, pages.length);
  }, [at, pages, totalChars, onPosition]);

  // Re-layout keeps the place: remember where we are before size/font change.
  useEffect(() => {
    if (pages[at]) restoring.current = pages[at].start / totalChars;
  }, [size, fontSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = at + step < pages.length;
  const canPrev = at > 0;

  const finish = useCallback((dir: 1 | -1, from: number, to: 0 | 1) => {
    if (animation.current) cancelAnimationFrame(animation.current);
    const started = performance.now();
    const duration = 420 * Math.abs(to - from) + 60;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const p = from + (to - from) * eased;
      if (t < 1) { setFlip({ dir, p }); animation.current = requestAnimationFrame(tick); return; }
      animation.current = null;
      setFlip(null);
      if (to === 1) setAt((value) => Math.max(0, Math.min(value + dir * step, Math.max(0, pages.length - 1))));
    };
    animation.current = requestAnimationFrame(tick);
  }, [step, pages.length]);

  const turn = useCallback((dir: 1 | -1) => {
    if (flip || (dir === 1 ? !canNext : !canPrev)) return;
    finish(dir, 0, 1);
  }, [flip, canNext, canPrev, finish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") turn(1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") turn(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);
  useEffect(() => () => { if (animation.current) cancelAnimationFrame(animation.current); }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (flip || !size || event.button > 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const dir: 1 | -1 = x > rect.width * (double ? 0.5 : 0.35) ? 1 : -1;
    if (dir === 1 ? !canNext : !canPrev) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, dir, moved: false, lastX: event.clientX, lastT: performance.now(), speed: 0 };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || !size) return;
    const dx = (event.clientX - state.x) * -state.dir; // positive = toward turning
    if (!state.moved && Math.abs(dx) < 6) return;
    state.moved = true;
    const now = performance.now();
    state.speed = ((event.clientX - state.lastX) * -state.dir) / Math.max(1, now - state.lastT);
    state.lastX = event.clientX;
    state.lastT = now;
    setFlip({ dir: state.dir, p: Math.max(0, Math.min(1, dx / (size.width * 1.4))) });
  }
  function onPointerUp() {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (!state.moved) { turn(state.dir); return; } // a tap turns the page
    const p = flip?.p ?? 0;
    finish(state.dir, p, p > 0.32 || state.speed > 0.45 ? 1 : 0);
  }

  const page = (index: number) => pages[index];
  const number = (index: number) => index + 1;
  const p = flip?.p ?? 0;
  const shade = Math.sin(p * Math.PI); // darkest mid-turn

  let content: React.ReactNode;
  if (!size || !pages.length) {
    content = <div className="bk-status"><LoaderCircle className="spin" size={22} />{labels.paginating}</div>;
  } else if (double) {
    const forward = flip?.dir === 1, backward = flip?.dir === -1;
    content = <div className="bk-book" style={{ width: size.width * 2, height: size.height }}>
      <PageView page={page(backward ? at - 2 : at)} number={number(backward ? at - 2 : at)} side="left" />
      <PageView page={page(forward ? at + 3 : at + 1)} number={number(forward ? at + 3 : at + 1)} side="right" />
      <span className="bk-spine" aria-hidden="true" />
      {flip && <div className={`bk-leaf ${forward ? "bk-leaf-right" : "bk-leaf-left"}`}
        style={{ width: size.width, transform: `rotateY(${forward ? -180 * p : 180 * p}deg)` }}>
        <div className="bk-face bk-front"><PageView page={page(forward ? at + 1 : at)} number={number(forward ? at + 1 : at)} side={forward ? "right" : "left"} /><i style={{ opacity: shade * 0.35 }} /></div>
        <div className="bk-face bk-back"><PageView page={page(forward ? at + 2 : at - 1)} number={number(forward ? at + 2 : at - 1)} side={forward ? "left" : "right"} /><i style={{ opacity: shade * 0.35 }} /></div>
      </div>}
    </div>;
  } else {
    const forward = flip?.dir === 1;
    content = <div className="bk-book bk-book-single" style={{ width: size.width, height: size.height }}>
      <PageView page={page(forward ? at + 1 : at)} number={number(forward ? at + 1 : at)} side="single" />
      {flip && <div className="bk-leaf bk-leaf-right" style={{ width: size.width, transform: `rotateY(${forward ? -180 * p : -180 * (1 - p)}deg)` }}>
        <div className="bk-face bk-front"><PageView page={page(forward ? at : at - 1)} number={number(forward ? at : at - 1)} side="single" /><i style={{ opacity: shade * 0.35 }} /></div>
        <div className="bk-face bk-back bk-paper-back" />
      </div>}
    </div>;
  }

  const shown = pages.length ? Math.min(at + 1, pages.length) : 0;
  return <div className="bk-reader">
    <div ref={host} className="bk-stage" style={{ fontSize }}
         onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {content}
      {/* Off-screen twin of a page's text box: the layout reads its paddings. */}
      <div className="bk-page-inner bk-measure" ref={measureRef} aria-hidden="true" />
    </div>
    <footer className="bk-controls">
      <button type="button" onClick={() => turn(-1)} disabled={!canPrev || Boolean(flip)} aria-label={labels.previous}><ChevronLeft size={20} /></button>
      <span>{labels.pageOf(shown + (double && at + 1 < pages.length ? 1 : 0), pages.length)}{!done && "…"}</span>
      <button type="button" onClick={() => turn(1)} disabled={!canNext || Boolean(flip)} aria-label={labels.next}><ChevronRight size={20} /></button>
      <progress max={1} value={pages.length ? (pages[at]?.start ?? 0) / totalChars : 0} aria-hidden="true" />
    </footer>
  </div>;
}
