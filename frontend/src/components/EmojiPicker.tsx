import { ChevronLeft, ChevronRight, Clock3, RefreshCw, Smile, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";
import {
  emojiPreviewUrl,
  fetchAnimatedEmojiManifest,
  fetchEmojiManifest,
  type EmojiAsset
} from "../lib/emojiAssets";

const PAGE_SIZE = 96;
const RECENT_KEY = "optima:telegram-emoji-recent";

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 32); }
  catch { return []; }
}

export function EmojiPickerButton({ onSelect }: { onSelect: (emojiId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<EmojiAsset[]>([]);
  const [pack, setPack] = useState(1);
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const wrapRef = useRef<HTMLSpanElement>(null);
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
  const pageCount = Math.max(1, Math.ceil(packAssets.length / PAGE_SIZE));
  const visible = packAssets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const packs = useMemo(() => Array.from(new Map(assets.map((asset) => [asset.pack, {
    number: asset.pack,
    name: asset.packName,
    preview: asset.previewSrc || emojiPreviewUrl(asset.id)
  }])).values()), [assets]);

  function selectPack(nextPack: number) {
    setPack(nextPack);
    setPage(0);
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
              onClick={() => setOpen((value) => !value)} aria-label="Telegram emoji tanlash"
              aria-expanded={open} aria-haspopup="dialog">
        <Smile size={20} />
      </button>
      {open && (
        <div className="emoji-picker telegram-emoji-picker" role="dialog" aria-label="Telegram emojilari">
          <div className="telegram-emoji-head">
            <span><strong>Custom emojilar</strong><small>{assets.length ? `${assets.length} ta` : "Telegram to‘plami"}</small></span>
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
          <div className="telegram-emoji-grid">
            {!assets.length && !failed && Array.from({ length: 32 }, (_, index) => <i className="emoji-skeleton" key={index} />)}
            {failed && <span className="telegram-emoji-state"><strong>Emojilar yuklanmadi</strong><button type="button" onClick={() => setFailed(false)}><RefreshCw size={15} /> Qayta urinish</button></span>}
            {assets.length > 0 && packAssets.length === 0 && <span className="telegram-emoji-state"><Clock3 size={22} /><strong>Hali emoji tanlanmagan</strong><small>Tanlangan emojilar shu yerda saqlanadi.</small></span>}
            {visible.map((asset) => (
              <button key={asset.id} type="button" onClick={() => pick(asset.id)}
                      aria-label="Custom emojini matnga qo‘shish">
                <img src={asset.previewSrc || emojiPreviewUrl(asset.id)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
          {pageCount > 1 && (
            <div className="telegram-emoji-pagination">
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}
                      aria-label="Oldingi emojilar"><ChevronLeft size={18} /></button>
              <span>{page + 1} / {pageCount}</span>
              <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}
                      aria-label="Keyingi emojilar"><ChevronRight size={18} /></button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
