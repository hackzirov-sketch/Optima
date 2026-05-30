import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Clock3, Search, SmilePlus } from "lucide-react";
import { loadGeneratedEmojis, type GeneratedEmoji, type GeneratedEmojiPayload } from "@/data/emojiData";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/utils/storage";
import { cn } from "./chatShared";
import { FastEmojiRenderer } from "./FastEmojiRenderer";

const RECENTS_KEY = "upz:recent-pack-emojis";
const GRID_HEIGHT = 260;
const ROW_HEIGHT = 48;
const OVERSCAN_ROWS = 3;
const EMPTY_PAYLOAD: GeneratedEmojiPayload = {
  meta: { generatedAt: "", count: 0, totalBytes: 0, totalAnimated: 0, totalStatic: 0 },
  emojis: [],
};

const CATEGORY_LABELS: Record<string, string> = {
  recent: "Recent",
  animated: "Animated",
  static: "Static",
  emoji: "Emoji",
  emojis: "Emoji",
  openmoji: "OpenMoji",
};

function readRecentIds() {
  const raw = safeLocalStorageGet(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}

function writeRecentIds(nextIds: string[]) {
  safeLocalStorageSet(RECENTS_KEY, JSON.stringify(nextIds.slice(0, 24)));
}

function emojiMatchesQuery(emoji: GeneratedEmoji, query: string) {
  const text = `${emoji.name} ${emoji.id} ${emoji.category} ${emoji.part ?? ""} ${emoji.keywords.join(" ")}`.toLowerCase();
  return text.includes(query);
}

const EmojiGridButton = memo(function EmojiGridButton({
  emoji,
  active,
  onSelect,
}: {
  emoji: GeneratedEmoji;
  active: boolean;
  onSelect: (emoji: GeneratedEmoji) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(emoji)}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#8B7CF6]/55",
        active && "bg-white/12 ring-1 ring-white/20",
      )}
      aria-label={`Send ${emoji.name}`}
      title={emoji.name}
    >
      <FastEmojiRenderer emoji={emoji} size="picker" mode="static" playOnClick={false} decorative />
    </button>
  );
});

export function FastEmojiPicker({
  onSelectAsset,
  className,
}: {
  onSelectAsset?: (assetId: string) => void;
  onSelectNative?: (native: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("animated");
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentIds());
  const [payload, setPayload] = useState<GeneratedEmojiPayload>(EMPTY_PAYLOAD);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const columns = typeof window !== "undefined" && window.innerWidth < 520 ? 7 : 10;
  const allEmojis = payload.emojis;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadGeneratedEmojis().then((data) => {
        if (!cancelled) setPayload(data);
      });
    };
    const idle = window.requestIdleCallback?.(load, { timeout: 250 }) ?? window.setTimeout(load, 0);
    return () => {
      cancelled = true;
      if (typeof idle === "number") window.clearTimeout(idle);
      else window.cancelIdleCallback?.(idle);
    };
  }, []);

  const categories = useMemo(() => {
    const base = Array.from(new Set(allEmojis.map((emoji) => emoji.category))).sort();
    return recentIds.length ? ["recent", ...base] : base;
  }, [allEmojis, recentIds.length]);

  const recentEmojis = useMemo(() => {
    const byId = new Map<string, GeneratedEmoji>(allEmojis.map((emoji) => [emoji.id, emoji]));
    return recentIds.map((id) => byId.get(id)).filter((emoji): emoji is GeneratedEmoji => Boolean(emoji));
  }, [allEmojis, recentIds]);

  const filtered = useMemo(() => {
    const source = category === "recent" ? recentEmojis : allEmojis.filter((emoji) => emoji.category === category);
    return normalizedQuery ? source.filter((emoji) => emojiMatchesQuery(emoji, normalizedQuery)) : source;
  }, [allEmojis, category, normalizedQuery, recentEmojis]);

  useEffect(() => {
    setScrollTop(0);
    setActiveIndex(0);
  }, [category, normalizedQuery]);

  useEffect(() => {
    if (!categories.includes(category) && categories[0]) setCategory(categories[0]);
  }, [categories, category]);

  const totalRows = Math.ceil(filtered.length / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + GRID_HEIGHT) / ROW_HEIGHT) + OVERSCAN_ROWS);
  const virtualItems = filtered.slice(startRow * columns, endRow * columns);
  const topSpacer = startRow * ROW_HEIGHT;
  const bottomSpacer = Math.max(0, (totalRows - endRow) * ROW_HEIGHT);

  const selectEmoji = (emoji: GeneratedEmoji) => {
    onSelectAsset?.(emoji.id);
    const nextRecentIds = [emoji.id, ...recentIds.filter((id) => id !== emoji.id)];
    setRecentIds(nextRecentIds.slice(0, 24));
    writeRecentIds(nextRecentIds);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!filtered.length) return;
    if (event.key === "ArrowRight") setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    if (event.key === "ArrowLeft") setActiveIndex((index) => Math.max(index - 1, 0));
    if (event.key === "ArrowDown") setActiveIndex((index) => Math.min(index + columns, filtered.length - 1));
    if (event.key === "ArrowUp") setActiveIndex((index) => Math.max(index - columns, 0));
    if (event.key === "Enter") selectEmoji(filtered[activeIndex]);
    if (event.key === "Escape") (event.currentTarget.closest("[role='dialog']") as HTMLElement | null)?.blur();
  };

  return (
    <div
      className={cn(
        "w-[min(100vw,720px)] overflow-hidden rounded-t-[20px] border border-[#2A2A2D] bg-[#171719] text-[#F3F4F6] shadow-2xl shadow-black/35",
        className,
      )}
      role="dialog"
      aria-label="Emoji picker"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="flex h-12 items-center gap-3 border-b border-white/8 px-4">
        <SmilePlus className="h-5 w-5 text-[#8B7CF6]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-none">Emoji</div>
          <div className="mt-1 text-[11px] text-white/45">{payload.meta.count || "Loading"} indexed assets</div>
        </div>
        <div className="flex h-8 w-[min(240px,42vw)] items-center gap-2 rounded-full bg-[#222225] px-3">
          <Search className="h-4 w-4 text-white/45" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
            aria-label="Search emojis"
          />
        </div>
      </div>

      <div className="flex max-h-[54px] gap-1 overflow-x-auto border-b border-white/8 px-3 py-2" aria-label="Emoji categories">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              "inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#8B7CF6]/55",
              category === item ? "bg-[#8774E1] text-white" : "bg-transparent text-white/62 hover:bg-white/8 hover:text-white",
            )}
            aria-pressed={category === item}
          >
            {item === "recent" && <Clock3 className="h-4 w-4" aria-hidden="true" />}
            {CATEGORY_LABELS[item] ?? item.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto px-3 py-4" style={{ maxHeight: GRID_HEIGHT }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {filtered.length ? (
          <div>
            <div style={{ height: topSpacer }} />
            <div className="grid grid-cols-7 justify-items-center gap-1 sm:grid-cols-10">
              {virtualItems.map((emoji, index) => (
                <EmojiGridButton key={emoji.id} emoji={emoji} active={startRow * columns + index === activeIndex} onSelect={selectEmoji} />
              ))}
            </div>
            <div style={{ height: bottomSpacer }} />
          </div>
        ) : (
          <div className="grid min-h-[112px] place-items-center text-sm font-medium text-white/48">Emoji topilmadi</div>
        )}
      </div>
    </div>
  );
}
