import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EmojiPicker } from "frimousse";
import emojiMartDataRaw from "@emoji-mart/data";
import type { EmojiMartData } from "@emoji-mart/data";
import { init as initEmojiMart } from "emoji-mart";
import { Search, Sparkles, Star } from "lucide-react";
import type { ChatReactionEmoji } from "@/types";
import {
  EmojiRenderer,
  PUBLIC_FREE_EMOJI_SOURCES,
  PREMIUM_REACTIONS,
  ReactionButton,
  encodeNativeEmojiReaction,
  getEmojiSectionItems,
  getReactionAsset,
  type PremiumEmojiSectionId,
} from "@/components/premium/PremiumAssets";
import { cn } from "./chatShared";

const emojiMartData = emojiMartDataRaw as EmojiMartData;
const RECENT_KEY = "upz_recent_native_emojis";

const CATEGORY_META = [
  { id: "all", label: "All", native: "⌘", martId: "people" },
  { id: "recent", label: "Recent", native: "◷", martId: "people" },
  { id: "favorites", label: "Favorites", native: "★", martId: "people" },
  { id: "premium", label: "Premium", native: "✦", martId: "people", premium: true },
  { id: "smileys", label: "Smileys", native: "🙂", martId: "people" },
  { id: "people", label: "People", native: "👋", martId: "people" },
  { id: "animals", label: "Animals", native: "🐾", martId: "nature" },
  { id: "food", label: "Food", native: "🍎", martId: "foods" },
  { id: "activities", label: "Activities", native: "⚽", martId: "activity" },
  { id: "travel", label: "Travel", native: "✈️", martId: "places" },
  { id: "objects", label: "Objects", native: "💡", martId: "objects" },
  { id: "symbols", label: "Symbols", native: "🔷", martId: "symbols" },
  { id: "flags", label: "Flags", native: "🏁", martId: "flags" },
  { id: "work-productivity", label: "Work", native: "💼", martId: "objects", premium: true },
  { id: "learning", label: "Learning", native: "📚", martId: "objects", premium: true },
  { id: "coding", label: "Coding", native: "💻", martId: "objects", premium: true },
  { id: "team", label: "Team", native: "🤝", martId: "people", premium: true },
  { id: "achievement", label: "Achievement", native: "🏆", martId: "activity", premium: true },
  { id: "status", label: "Status", native: "🟢", martId: "symbols", premium: true },
  { id: "workspace", label: "Workspace", native: "🧩", martId: "objects", premium: true },
] as const;

type CategoryId = (typeof CATEGORY_META)[number]["id"];

type NativeEmojiItem = {
  id: string;
  label: string;
  native: string;
  keywords: string[];
};

interface PremiumEmojiPickerProps {
  mode?: "message" | "reaction";
  compact?: boolean;
  activeEmojis?: ChatReactionEmoji[];
  onSelectReaction?: (emoji: ChatReactionEmoji) => void;
  onSelectAsset?: (assetId: string) => void;
  onSelectNative?: (native: string) => void;
  className?: string;
}

function getNativeEmoji(id: string): NativeEmojiItem | null {
  const emoji = emojiMartData.emojis[id];
  const native = emoji?.skins?.[0]?.native;
  if (!emoji || !native) return null;
  return { id: emoji.id, label: emoji.name, native, keywords: emoji.keywords ?? [] };
}

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 18) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 18)));
}

export function PremiumEmojiPicker({
  mode = "reaction",
  compact = false,
  activeEmojis = [],
  onSelectReaction,
  onSelectAsset,
  onSelectNative,
  className,
}: PremiumEmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>(mode === "reaction" ? "premium" : "all");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const sourceLabel = PUBLIC_FREE_EMOJI_SOURCES.map((source) => source.name).join(" + ");

  useEffect(() => {
    void initEmojiMart({ data: emojiMartData }, { caller: "upz-premium-emoji-picker" }).catch(() => undefined);
  }, []);

  const activeIds = activeEmojis.map(String);
  const selectedCategory = CATEGORY_META.find((category) => category.id === activeCategory) ?? CATEGORY_META[0];
  const favoriteNative = ["👍", "❤️", "🔥", "😂", "🚀", "💎", "✅", "👏"];

  const nativeItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (activeCategory === "recent" && !normalized) {
      return recent.map((native, index) => ({ id: `recent-${index}`, label: "Recent emoji", native, keywords: [] }));
    }

    if (activeCategory === "favorites" && !normalized) {
      return favoriteNative.map((native, index) => ({ id: `favorite-${index}`, label: "Favorite emoji", native, keywords: [] }));
    }

    const category = emojiMartData.categories.find((item) => item.id === selectedCategory.martId);
    const ids = normalized ? Object.keys(emojiMartData.emojis) : category?.emojis ?? [];

    const categoryOffset = activeCategory === "people" && !normalized ? 80 : 0;

    return ids
      .map(getNativeEmoji)
      .filter((item): item is NativeEmojiItem => Boolean(item))
      .filter((item) => {
        if (!normalized) return true;
        return `${item.label} ${item.keywords.join(" ")} ${item.id}`.toLowerCase().includes(normalized);
      })
      .slice(categoryOffset)
      .slice(0, 56);
  }, [activeCategory, query, recent, selectedCategory.martId]);

  const premiumItems = useMemo(() => {
    if (activeCategory === "all" || activeCategory === "recent" || activeCategory === "favorites") return [];
    return getEmojiSectionItems(activeCategory as PremiumEmojiSectionId, query).slice(0, 18);
  }, [activeCategory, query]);

  const selectNative = (native: string) => {
    const next = [native, ...recent.filter((item) => item !== native)].slice(0, 18);
    setRecent(next);
    saveRecent(next);
    if (mode === "reaction") {
      onSelectReaction?.(encodeNativeEmojiReaction(native));
    } else {
      onSelectNative?.(native);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={cn(
        "overflow-hidden border border-white/80 bg-white/82 shadow-2xl shadow-indigo-950/15 backdrop-blur-2xl dark:border-gray-700/80 dark:bg-gray-900/86",
        compact ? "w-[min(280px,calc(100vw-1.25rem))] rounded-[22px] p-2" : "w-[min(430px,calc(100vw-1rem))] rounded-[28px] p-3",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label={mode === "reaction" ? "Premium reaction picker" : "Premium emoji picker"}
    >
      <div className={cn("flex items-center justify-between gap-3", compact ? "mb-2" : "mb-3")}>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">{compact ? "Reactions" : "UPZ Emoji Cloud"}</p>
          {!compact && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={sourceLabel}>
              Public/free sources: Emoji Mart, Frimousse, OpenMoji, Fluent
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(255,255,220)]/80 px-2.5 py-1 text-[10px] font-black text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800">
          <Sparkles className="h-3 w-3" /> Premium
        </span>
      </div>

      <div className={cn("flex items-center gap-2 rounded-2xl border border-gray-200/90 bg-white/70 px-3 shadow-inner shadow-white/60 backdrop-blur focus-within:border-indigo-300 dark:border-gray-700 dark:bg-gray-800/70 dark:shadow-none", compact ? "mb-2 h-9" : "mb-3 h-10")}>
        <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === "reaction" ? "Search reactions" : "Search emoji"}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          aria-label="Search emoji"
        />
      </div>

      {mode === "reaction" && !compact && (
        <div className="mb-3 flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl bg-white/60 p-1.5 ring-1 ring-gray-200/80 dark:bg-gray-800/70 dark:ring-gray-700">
          {PREMIUM_REACTIONS.map((reaction) => (
            <ReactionButton
              key={reaction.id}
              asset={reaction}
              active={activeIds.includes(reaction.id)}
              compact
              onClick={() => onSelectReaction?.(reaction.id)}
            />
          ))}
        </div>
      )}

      <div className={cn("grid gap-2 max-sm:grid-cols-1", compact ? "min-h-[164px] grid-cols-[40px_1fr]" : "min-h-[292px] grid-cols-[64px_1fr] gap-3")}>
        <div className={cn("flex flex-col gap-1 overflow-y-auto rounded-2xl bg-white/62 p-1 ring-1 ring-gray-200/80 dark:bg-gray-800/70 dark:ring-gray-700 max-sm:max-h-none max-sm:flex-row max-sm:overflow-x-auto", compact ? "max-h-[164px]" : "max-h-[292px] p-1.5")}>
          {CATEGORY_META.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                "group inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-xl text-xs font-black transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400/30",
                compact ? "min-h-8 px-1.5" : "min-h-10 px-2",
                activeCategory === category.id
                  ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-700 dark:text-indigo-300 dark:ring-indigo-800"
                  : "text-gray-500 hover:bg-white/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100",
              )}
              aria-label={`Open ${category.label} emoji category`}
              title={category.label}
            >
              <span className="text-base transition-transform group-hover:scale-110" aria-hidden="true">{category.native}</span>
              {"premium" in category && category.premium && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className={cn("min-w-0 rounded-[22px] bg-gray-50/72 p-2 ring-1 ring-gray-200/80 dark:bg-gray-800/70 dark:ring-gray-700", compact && "p-1.5")}>
          <div className={cn("flex items-center justify-between gap-2 px-1", compact ? "mb-1" : "mb-2")}>
            <div>
              <p className="text-xs font-black text-gray-900 dark:text-gray-100">{selectedCategory.label}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{mode === "reaction" ? "Tap to react instantly" : "Tap to insert into message"}</p>
            </div>
            {"premium" in selectedCategory && selectedCategory.premium && <Star className="h-4 w-4 text-amber-400" aria-hidden="true" />}
          </div>

          <AnimatePresence mode="wait">
            {activeCategory === "all" ? (
              <motion.div key="frimousse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmojiPicker.Root onEmojiSelect={(emoji) => selectNative(emoji.emoji)} columns={8}>
                  <EmojiPicker.Search value={query} onChange={(event) => setQuery(event.target.value)} className="sr-only" />
                  <EmojiPicker.Viewport className={cn("overflow-y-auto rounded-2xl bg-white/60 p-1 dark:bg-gray-900/30", compact ? "h-[124px]" : "h-[232px]")}>
                    <EmojiPicker.Loading className="grid h-full place-items-center text-xs font-semibold text-gray-400">Loading emoji...</EmojiPicker.Loading>
                    <EmojiPicker.Empty>
                      {({ search }) => <span className="grid h-full place-items-center text-xs text-gray-400">No emoji found for {search}</span>}
                    </EmojiPicker.Empty>
                    <EmojiPicker.List
                      components={{
                        CategoryHeader: ({ category, ...props }) => (
                          <div {...props} className="sticky top-0 z-10 bg-white/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400 backdrop-blur dark:bg-gray-900/90 dark:text-gray-500">
                            {category.label}
                          </div>
                        ),
                        Row: ({ children, ...props }) => <div {...props} className={cn("grid gap-1 px-1 py-0.5", compact ? "grid-cols-7" : "grid-cols-8")}>{children}</div>,
                        Emoji: ({ emoji, ...props }) => (
                          <button
                            {...props}
                            className={cn(
                              "grid place-items-center rounded-xl transition-all hover:scale-110 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 dark:hover:bg-indigo-950/40",
                              compact ? "h-8 w-8 text-lg" : "h-9 w-9 text-xl",
                              emoji.isActive && "bg-white shadow-sm ring-1 ring-indigo-100 dark:bg-gray-700 dark:ring-indigo-800",
                            )}
                            aria-label={emoji.label}
                          >
                            {emoji.emoji}
                          </button>
                        ),
                      }}
                    />
                  </EmojiPicker.Viewport>
                </EmojiPicker.Root>
              </motion.div>
            ) : (
              <motion.div key={activeCategory} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={cn("overflow-y-auto rounded-2xl bg-white/60 p-1.5 dark:bg-gray-900/30", compact ? "h-[124px]" : "h-[232px]")}>
                {premiumItems.length > 0 && (
                  <div className={cn("mb-2 grid gap-1", compact ? "grid-cols-5" : "grid-cols-6")}>
                    {premiumItems.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => (mode === "reaction" ? onSelectReaction?.(asset.reactionId ?? "gem") : onSelectAsset?.(asset.id))}
                        className={cn("group grid place-items-center rounded-xl bg-white text-sm shadow-sm ring-1 ring-gray-200 transition-all hover:-translate-y-0.5 hover:ring-indigo-200 dark:bg-gray-800 dark:ring-gray-700", compact ? "h-8" : "h-10")}
                        aria-label={`Select ${asset.label}`}
                        title={asset.label}
                      >
                        <EmojiRenderer asset={asset} size={compact ? 20 : 24} className="transition-transform group-hover:scale-110" />
                      </button>
                    ))}
                  </div>
                )}

                <div className={cn("grid gap-1 max-sm:grid-cols-6", compact ? "grid-cols-6" : "grid-cols-7")}>
                  {nativeItems.map((emoji) => (
                    <motion.button
                      key={`${emoji.id}-${emoji.native}`}
                      type="button"
                      whileHover={{ scale: 1.12, y: -1 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => selectNative(emoji.native)}
                      className={cn("grid place-items-center rounded-xl transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 dark:hover:bg-indigo-950/40", compact ? "h-8 text-lg" : "h-10 text-xl")}
                      aria-label={`Select ${emoji.label}`}
                      title={emoji.label}
                    >
                      <EmojiRenderer asset={getReactionAsset(encodeNativeEmojiReaction(emoji.native))} size={compact ? 20 : 24} decorative />
                    </motion.button>
                  ))}
                </div>

                {nativeItems.length === 0 && premiumItems.length === 0 && (
                  <div className="grid h-full place-items-center rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 text-center text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-900/40">
                    No emoji found. Try a softer search.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
