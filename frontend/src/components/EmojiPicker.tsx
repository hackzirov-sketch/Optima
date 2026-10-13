import { Clock3, RefreshCw, Smile, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";
import {
  emojiPreviewUrl,
  fetchAnimatedEmojiManifest,
  fetchEmojiManifest,
  type EmojiAsset
} from "../lib/emojiAssets";

/* The grid renders in batches rather than all at once: the largest pack holds
   691 emoji, and mounting that many <img> at once is what made the picker
   stutter on a phone. A sentinel at the end of the list pulls the next batch. */
const BATCH_SIZE = 96;
const RECENT_KEY = "optima:telegram-emoji-recent";

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

export function EmojiPickerButton({ onSelect }: { onSelect: (emojiId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<EmojiAsset[]>([]);
  const [pack, setPack] = useState(1);
  const [shown, setShown] = useState(BATCH_SIZE);
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

  const packAssets = useMemo(() => pack === 0
    ? recent.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is EmojiAsset => Boolean(asset))
    : assets.filter((asset) => asset.pack === pack), [assets, pack, recent]);
  const visible = packAssets.slice(0, shown);
  const packs = useMemo(() => labelPacks(Array.from(new Map(assets.map((asset) => [asset.pack, {
    number: asset.pack,
    name: asset.packName,
    preview: asset.previewSrc || emojiPreviewUrl(asset.id)
  }])).values())), [assets]);
  const activePack = packs.find((item) => item.number === pack);

  const loadMore = useCallback(() => {
    setShown((value) => (value >= packAssets.length ? value : value + BATCH_SIZE));
  }, [packAssets.length]);

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

  function selectPack(nextPack: number) {
    setPack(nextPack);
    setShown(BATCH_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }

  function pick(id: string) {
    const next = [id, ...recent.filter((item) => item !== id)].slice(0, 32);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage may be disabled */ }
    onSelect(id);
  }

  return (
    <span className="emoji-menu-wrap" ref={wrapRef}>
      <button type="button" className={`icon-button ${open ? "active" : ""}`}
              onClick={() => setOpen((value) => !value)} aria-label="Emoji tanlash"
              aria-expanded={open} aria-haspopup="dialog">
        <Smile size={20} />
      </button>
      {open && (
        <div className="emoji-picker telegram-emoji-picker" role="dialog" aria-label="Emojilar">
          <div className="telegram-emoji-head">
            <span><strong>{pack === 0 ? "So‘nggi ishlatilganlar" : activePack?.name || "Custom emojilar"}</strong>
              <small>{assets.length ? `${packAssets.length} ta · jami ${assets.length}` : "Emoji to‘plami"}</small></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Yopish"><X size={16} /></button>
          </div>
          <div className="telegram-emoji-packs" role="tablist" aria-label="Emoji to‘plamlari">
            <button type="button" role="tab" aria-selected={pack === 0} className={pack === 0 ? "active" : ""}
                    onClick={() => selectPack(0)} title="So‘nggi ishlatilganlar"><Clock3 size={18} /></button>
            {packs.map((item) => (
              <button key={item.number} type="button" role="tab" aria-selected={pack === item.number}
                      className={pack === item.number ? "active" : ""} onClick={() => selectPack(item.number)}
                      title={item.name} aria-label={item.name}>
                <img src={item.preview} alt="" loading="lazy" decoding="async" />
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
                <img src={asset.previewSrc || emojiPreviewUrl(asset.id)} alt="" loading="lazy" decoding="async" />
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
