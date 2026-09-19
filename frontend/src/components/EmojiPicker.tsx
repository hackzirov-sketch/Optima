import { Clock3, LayoutGrid, RefreshCw, Search, Smile, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  emojiPreviewUrl,
  fetchAnimatedEmojiManifest,
  fetchEmojiManifest,
  type EmojiAsset
} from "../lib/emojiAssets";
import { AnimatedEmoji } from "./AnimatedEmoji";

/* The grid renders in batches rather than all at once: the largest pack holds
   691 emoji, and mounting that many <img> at once is what made the picker
   stutter on a phone. A sentinel at the end of the list pulls the next batch. */
const BATCH_SIZE = 96;
const RECENT_KEY = "optima:telegram-emoji-recent";
type EmojiMode = "all" | "static" | "animated";
type PackSelection = "all" | "recent" | string;
type EmojiTopic = "all" | "mood" | "it" | "games" | "icons" | "drawn";

const TOPICS: Array<{ id: EmojiTopic; label: string }> = [
  { id: "all", label: "Barchasi" },
  { id: "mood", label: "Kayfiyat" },
  { id: "it", label: "IT" },
  { id: "games", label: "O‘yinlar" },
  { id: "icons", label: "Ikonlar" },
  { id: "drawn", label: "Chizilgan" }
];

function assetTopic(asset: EmojiAsset): EmojiTopic {
  if (asset.format === "png") return "mood";
  const name = asset.packName.toLocaleLowerCase();
  if (/developer|geek|linux|python|\bit\b/.test(name)) return "it";
  if (/game/.test(name)) return "games";
  if (/crayon|draw/.test(name)) return "drawn";
  if (/icon|round|interactive|theme/.test(name)) return "icons";
  return "mood";
}

function assetPackKey(asset: EmojiAsset): string {
  const kind = asset.format === "png" ? "static" : "animated";
  return `${kind}:${asset.pack}:${asset.packName}`;
}

/* Four packs ship under the name "Animated Emoji", so the tab strip offered
   four identical tooltips. Repeated names get numbered in the order they
   arrive; names that are already unique are left alone. */
function labelPacks<T extends { name: string }>(items: T[]): T[] {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.name, (totals.get(item.name) ?? 0) + 1);

  const seen = new Map<string, number>();
  return items.map((item) => {
    if ((totals.get(item.name) ?? 0) < 2) return item;
    const index = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, index);
    return { ...item, name: `${item.name} ${index}` };
  });
}

function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 32) : [];
  }
  catch { return []; }
}

function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"));
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.click();
  tabs[next]?.focus();
  tabs[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function EmojiPickerButton({ onSelect, label = "Telegram emoji tanlash", className = "" }: {
  onSelect: (emojiId: string) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<EmojiAsset[]>([]);
  const [pack, setPack] = useState<PackSelection>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(BATCH_SIZE);
  const [mode, setMode] = useState<EmojiMode>("all");
  const [topic, setTopic] = useState<EmojiTopic>("all");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const trigger = wrapRef.current;
    if (!panel || !trigger) return;
    const viewport = window.visualViewport;
    const place = () => {
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = Math.min(420, width - 16);
      const panelHeight = Math.min(560, height - 24);
      const above = rect.top - panelHeight - 10;
      panel.style.width = `${panelWidth}px`;
      panel.style.height = `${panelHeight}px`;
      panel.style.maxHeight = `${panelHeight}px`;
      panel.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - panelWidth - 8))}px`;
      panel.style.top = `${Math.max(top + 12, Math.min(above >= top + 12 ? above : rect.bottom + 10, top + height - panelHeight - 12))}px`;
    };
    place();
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trigger = wrapRef.current?.querySelector<HTMLButtonElement>(":scope > button");
    if (window.matchMedia("(pointer: fine)").matches) {
      panelRef.current?.querySelector<HTMLInputElement>(".telegram-emoji-search input")?.focus({ preventScroll: true });
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setUnavailable([]);
    const add = (items: EmojiAsset[], animated: boolean) => {
      if (!cancelled) setAssets(previous => [...previous.filter(item => (item.format !== "png") !== animated), ...items]);
    };
    Promise.allSettled([
      fetchEmojiManifest<Array<Pick<EmojiAsset, "id" | "src" | "pack">>>().then(items => add(items.map((asset) => ({
        ...asset,
        previewSrc: emojiPreviewUrl(asset.id),
        packName: `${asset.pack}-to‘plam`,
        format: "png" as const
      })), false)),
      fetchAnimatedEmojiManifest<EmojiAsset[]>().then(items => add(items, true))
    ]).then(results => {
      if (cancelled) return;
      loadedRef.current = true;
      setLoading(false);
      setUnavailable(results.flatMap((result, index) => result.status === "rejected" ? [index === 0 ? "Statik" : "Animatsion"] : []));
      setFailed(results.every(result => result.status === "rejected"));
    });
    return () => { cancelled = true; };
  }, [open, reload]);

  function retry() {
    loadedRef.current = false;
    setReload(value => value + 1);
  }

  const packAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const byMode = mode === "all" ? assets : assets.filter((asset) => mode === "animated" ? asset.format !== "png" : asset.format === "png");
    const byTopic = topic === "all" ? byMode : byMode.filter((asset) => assetTopic(asset) === topic);
    const source = normalizedQuery || pack === "all"
      ? byTopic
      : pack === "recent"
        ? recent.map((id) => byTopic.find((asset) => asset.id === id)).filter((asset): asset is EmojiAsset => Boolean(asset))
        : byTopic.filter((asset) => assetPackKey(asset) === pack);
    if (!normalizedQuery) return source;
    return source.filter((asset) => `${asset.id} ${asset.packName}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [assets, mode, pack, query, recent, topic]);
  const batchSize = mode === "animated" ? 36 : BATCH_SIZE;
  const visible = packAssets.slice(0, shown);
  const focusedVisible = visible.some(asset => asset.id === focusedId);
  const packs = useMemo(() => labelPacks(Array.from(new Map(assets.map((asset) => [assetPackKey(asset), {
    key: assetPackKey(asset),
    name: asset.packName,
    id: asset.id
  }])).values())), [assets]);
  const visiblePacks = useMemo(() => packs.filter((item) => {
    const sample = assets.find((asset) => assetPackKey(asset) === item.key);
    return Boolean(sample) && (mode === "all" || item.key.startsWith(`${mode}:`)) && (topic === "all" || assetTopic(sample!) === topic);
  }), [assets, mode, packs, topic]);
  const activePack = packs.find((item) => item.key === pack);

  const loadMore = useCallback(() => {
    setShown((value) => (value >= packAssets.length ? value : value + batchSize));
  }, [batchSize, packAssets.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || shown >= packAssets.length) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) loadMore(); },
      { root: gridRef.current, rootMargin: "240px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, shown, packAssets.length, loadMore]);

  function selectPack(nextPack: PackSelection) {
    setPack(nextPack);
    setQuery("");
    setShown(BATCH_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }

  function selectMode(nextMode: EmojiMode) {
    setMode(nextMode);
    setPack("all");
    setQuery("");
    setShown(nextMode === "animated" ? 36 : BATCH_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }

  function selectTopic(nextTopic: EmojiTopic) {
    setTopic(nextTopic);
    setPack("all");
    setQuery("");
    setShown(mode === "animated" ? 36 : BATCH_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }

  function pick(id: string) {
    const next = [id, ...recent.filter((item) => item !== id)].slice(0, 32);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage may be disabled */ }
    onSelect(id);
  }

  return (
    <span className={`emoji-menu-wrap ${className}`} ref={wrapRef}>
      <button type="button" className={`icon-button ${open ? "active" : ""}`}
              onClick={() => setOpen((value) => !value)} aria-label={label} title={label}
              aria-expanded={open} aria-haspopup="dialog">
        <Smile size={20} />
      </button>
      {open && createPortal(
        <div ref={panelRef} className="emoji-picker telegram-emoji-picker emoji-picker-floating" role="dialog" aria-label="Telegram emojilari">
          <div className="telegram-emoji-head">
            <span><strong>{query ? "Qidiruv natijalari" : pack === "all" ? "Barcha emojilar" : pack === "recent" ? "So‘nggi ishlatilganlar" : activePack?.name || "Custom emojilar"}</strong>
              <small>{assets.length ? `${packAssets.length} ta · jami ${assets.length}` : "Telegram to‘plami"}</small></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Yopish"><X size={16} /></button>
          </div>
          <label className="telegram-emoji-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setShown(BATCH_SIZE); }}
                   placeholder="Emoji yoki to‘plamni qidirish" aria-label="Emojilarni qidirish" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Qidiruvni tozalash"><X size={14} /></button>}
          </label>
          <div className="telegram-emoji-modes" role="tablist" aria-label="Emoji turi" onKeyDown={navigateTabs}>
            {(["all", "static", "animated"] as const).map((item) => <button key={item} type="button" role="tab"
              tabIndex={mode === item ? 0 : -1} aria-selected={mode === item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}>
              {item === "all" ? "Barchasi" : item === "static" ? "Static" : "Animated"}
            </button>)}
          </div>
          <div className="telegram-emoji-topics" role="tablist" aria-label="Emoji mavzulari" onKeyDown={navigateTabs}>
            {TOPICS.map((item) => <button key={item.id} type="button" role="tab"
              tabIndex={topic === item.id ? 0 : -1} aria-selected={topic === item.id} className={topic === item.id ? "active" : ""}
              onClick={() => selectTopic(item.id)}>{item.label}</button>)}
          </div>
          <div className="telegram-emoji-packs" role="tablist" aria-label="Emoji to‘plamlari" onKeyDown={navigateTabs}>
            <button type="button" role="tab" tabIndex={pack === "all" ? 0 : -1} aria-selected={pack === "all"} className={pack === "all" ? "active" : ""}
                    onClick={() => selectPack("all")} title="Barcha emojilar"><LayoutGrid size={17} /><span>Barchasi</span></button>
            <button type="button" role="tab" tabIndex={pack === "recent" ? 0 : -1} aria-selected={pack === "recent"} className={pack === "recent" ? "active" : ""}
                    onClick={() => selectPack("recent")} title="So‘nggi ishlatilganlar"><Clock3 size={17} /><span>So‘nggi</span></button>
            {visiblePacks.map((item) => (
              <button key={item.key} type="button" role="tab" tabIndex={pack === item.key ? 0 : -1} aria-selected={pack === item.key}
                      className={pack === item.key ? "active" : ""} onClick={() => selectPack(item.key)}
                      title={item.name} aria-label={item.name}>
                <AnimatedEmoji key={`${item.id}-${reload}`} id={item.id} className="emoji-pack-preview" animate={false} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <div className="emoji-catalog-status" role="status">
            {unavailable.length > 0 && !failed && <><span>{unavailable.join(", ")} to‘plamlar yuklanmadi</span><button type="button" onClick={retry} disabled={loading} aria-label="To‘plamlarni qayta yuklash" title="Qayta yuklash"><RefreshCw size={16} /></button></>}
            {loading && assets.length > 0 && <span>Qolgan to‘plamlar yuklanmoqda...</span>}
          </div>
          <div className="telegram-emoji-grid" ref={gridRef} aria-busy={loading} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(":scope > button"));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (current < 0) return;
            event.preventDefault();
            const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ").length;
            const delta = event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : event.key === "ArrowLeft" ? -1 : 1;
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(current + delta, buttons.length - 1));
            buttons[next]?.focus();
          }}>
            {!assets.length && loading && Array.from({ length: 32 }, (_, index) => <i className="emoji-skeleton" key={index} />)}
            {failed && <span className="telegram-emoji-state"><strong>Emojilar yuklanmadi</strong><button type="button" onClick={retry}><RefreshCw size={15} /> Qayta urinish</button></span>}
            {!loading && !failed && packAssets.length === 0 && <span className="telegram-emoji-state"><Search size={22} /><strong>{query ? "Emoji topilmadi" : pack === "recent" ? "Hali emoji tanlanmagan" : "Bu bo‘limda emoji yo‘q"}</strong><small>{query ? "Boshqa nom bilan qidiring." : pack === "recent" ? "Tanlangan emojilar shu yerda saqlanadi." : "Boshqa to‘plamni tanlang yoki qayta yuklang."}</small></span>}
            {visible.map((asset, index) => (
              <button key={asset.id} type="button" onClick={() => pick(asset.id)}
                      title={`${asset.packName} · ${asset.id}`} aria-label={`${asset.packName}: ${asset.id}`}
                      onPointerEnter={() => setPreviewId(asset.id)} onPointerLeave={() => setPreviewId(null)}
                      tabIndex={asset.id === focusedId || (!focusedVisible && index === 0) ? 0 : -1}
                      onFocus={() => { setPreviewId(asset.id); setFocusedId(asset.id); }} onBlur={() => setPreviewId(null)}>
                <AnimatedEmoji key={`${asset.id}-${reload}`} id={asset.id} animate={previewId === asset.id} />
              </button>
            ))}
            {shown < packAssets.length && (
              <div className="telegram-emoji-sentinel" ref={sentinelRef} aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => <i className="emoji-skeleton" key={index} />)}
              </div>
            )}
          </div>
        </div>, document.body
      )}
    </span>
  );
}
