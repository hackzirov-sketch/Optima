import { Clock3, LayoutGrid, RefreshCw, Search, Smile, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";
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
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 32); }
  catch { return []; }
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
  const [recent, setRecent] = useState<string[]>(readRecent);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useOutsideClose(wrapRef, open, () => setOpen(false));

  useEffect(() => {
    if (!open || assets.length || failed) return;
    Promise.allSettled([
      fetchEmojiManifest<Array<Pick<EmojiAsset, "id" | "src" | "pack">>>(),
      fetchAnimatedEmojiManifest<EmojiAsset[]>()
    ]).then(([staticResult, animatedResult]) => {
      const staticAssets = staticResult.status === "fulfilled" ? staticResult.value.map((asset) => ({
        ...asset,
        previewSrc: asset.src || emojiPreviewUrl(asset.id),
        packName: `${asset.pack}-to‘plam`,
        format: "png" as const
      })) : [];
      const animatedAssets = animatedResult.status === "fulfilled" ? animatedResult.value : [];
      const next = [...staticAssets, ...animatedAssets];
      if (!next.length) setFailed(true);
      else setAssets(next);
    });
  }, [open, assets.length, failed]);

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
  const packs = useMemo(() => labelPacks(Array.from(new Map(assets.map((asset) => [assetPackKey(asset), {
    key: assetPackKey(asset),
    name: asset.packName,
    preview: asset.previewSrc || emojiPreviewUrl(asset.id)
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
      {open && (
        <div className="emoji-picker telegram-emoji-picker" role="dialog" aria-label="Telegram emojilari">
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
          <div className="telegram-emoji-modes" role="tablist" aria-label="Emoji turi">
            {(["all", "static", "animated"] as const).map((item) => <button key={item} type="button" role="tab"
              aria-selected={mode === item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}>
              {item === "all" ? "Barchasi" : item === "static" ? "Static" : "Animated"}
            </button>)}
          </div>
          <div className="telegram-emoji-topics" role="tablist" aria-label="Emoji mavzulari">
            {TOPICS.map((item) => <button key={item.id} type="button" role="tab"
              aria-selected={topic === item.id} className={topic === item.id ? "active" : ""}
              onClick={() => selectTopic(item.id)}>{item.label}</button>)}
          </div>
          <div className="telegram-emoji-packs" role="tablist" aria-label="Emoji to‘plamlari">
            <button type="button" role="tab" aria-selected={pack === "all"} className={pack === "all" ? "active" : ""}
                    onClick={() => selectPack("all")} title="Barcha emojilar"><LayoutGrid size={17} /><span>Barchasi</span></button>
            <button type="button" role="tab" aria-selected={pack === "recent"} className={pack === "recent" ? "active" : ""}
                    onClick={() => selectPack("recent")} title="So‘nggi ishlatilganlar"><Clock3 size={17} /><span>So‘nggi</span></button>
            {visiblePacks.map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={pack === item.key}
                      className={pack === item.key ? "active" : ""} onClick={() => selectPack(item.key)}
                      title={item.name} aria-label={item.name}>
                <img src={item.preview} alt="" loading="lazy" decoding="async" />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <div className="telegram-emoji-grid" ref={gridRef}>
            {!assets.length && !failed && Array.from({ length: 32 }, (_, index) => <i className="emoji-skeleton" key={index} />)}
            {failed && <span className="telegram-emoji-state"><strong>Emojilar yuklanmadi</strong><button type="button" onClick={() => setFailed(false)}><RefreshCw size={15} /> Qayta urinish</button></span>}
            {assets.length > 0 && packAssets.length === 0 && <span className="telegram-emoji-state"><Clock3 size={22} /><strong>Hali emoji tanlanmagan</strong><small>Tanlangan emojilar shu yerda saqlanadi.</small></span>}
            {visible.map((asset) => (
              <button key={asset.id} type="button" onClick={() => pick(asset.id)}
                      aria-label="Custom emojini matnga qo‘shish">
                {asset.format === "lottie" ? <AnimatedEmoji id={asset.id} label="" /> :
                  <img src={asset.previewSrc || emojiPreviewUrl(asset.id)} alt="" loading="lazy" decoding="async" />}
              </button>
            ))}
            {shown < packAssets.length && (
              <div className="telegram-emoji-sentinel" ref={sentinelRef} aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => <i className="emoji-skeleton" key={index} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
