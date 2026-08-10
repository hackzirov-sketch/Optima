import { ChevronLeft, ChevronRight, Clock3, RefreshCw, Smile, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutsideClose } from "../lib/useOutsideClose";
import { fallbackEmojiImage, fetchEmojiManifest } from "../lib/emojiAssets";

type EmojiAsset = { id: string; src: string; pack: number };

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
    fetchEmojiManifest<EmojiAsset[]>()
      .then(setAssets)
      .catch(() => setFailed(true));
  }, [open, assets.length, failed]);

  const packAssets = useMemo(() => pack === 0
    ? recent.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is EmojiAsset => Boolean(asset))
    : assets.filter((asset) => asset.pack === pack), [assets, pack, recent]);
  const pageCount = Math.max(1, Math.ceil(packAssets.length / PAGE_SIZE));
  const visible = packAssets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
            {[1, 2, 3, 4].map((number) => (
              <button key={number} type="button" role="tab" aria-selected={pack === number}
                      className={pack === number ? "active" : ""} onClick={() => selectPack(number)}
                      title={`${number}-to‘plam`}>
                {assets.find((asset) => asset.pack === number) ?
                  <img src={assets.find((asset) => asset.pack === number)!.src} alt=""
                       onError={(event) => fallbackEmojiImage(event.currentTarget, assets.find((asset) => asset.pack === number)!.id)} /> : <span>{number}</span>}
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
                <img src={asset.src} alt="" loading="lazy" decoding="async"
                     onError={(event) => fallbackEmojiImage(event.currentTarget, asset.id)} />
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
