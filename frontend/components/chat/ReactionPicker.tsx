import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import emojiMartDataRaw from "@emoji-mart/data";
import type { EmojiMartData } from "@emoji-mart/data";
import type { ChatReactionEmoji } from "@/types";
import {
  EmojiRenderer,
  PREMIUM_REACTIONS,
  ReactionButton,
  encodeNativeEmojiReaction,
  getReactionAsset,
} from "@/components/premium/PremiumAssets";
import { cn } from "./chatShared";
import { PremiumEmojiPicker } from "./PremiumEmojiPicker";

const emojiMartData = emojiMartDataRaw as EmojiMartData;

const NATIVE_REACTIONS = {
  like: "\u{1F44D}",
  heart: "\u2764\uFE0F",
  fire: "\u{1F525}",
  laugh: "\u{1F602}",
  wow: "\u{1F62E}",
  sad: "\u{1F622}",
  pray: "\u{1F64F}",
  rocket: "\u{1F680}",
  done: "\u2705",
  clap: "\u{1F44F}",
  gem: "\u{1F48E}",
  zap: "\u26A1",
  eyes: "\u{1F440}",
  target: "\u{1F3AF}",
  idea: "\u{1F4A1}",
  brain: "\u{1F9E0}",
  sparkles: "\u2728",
  trophy: "\u{1F3C6}",
  muscle: "\u{1F4AA}",
  celebrate: "\u{1F389}",
  raisedHands: "\u{1F64C}",
  handshake: "\u{1F91D}",
  salute: "\u{1FAE1}",
  pin: "\u{1F4CC}",
  puzzle: "\u{1F9E9}",
  tools: "\u{1F6E0}\uFE0F",
  books: "\u{1F4DA}",
  coffee: "\u2615",
  chart: "\u{1F4C8}",
  lab: "\u{1F9EA}",
  party: "\u{1F973}",
  cool: "\u{1F60E}",
  thinking: "\u{1F914}",
} as const;

const REACTION_PRESETS = [
  {
    id: "quick",
    label: "Quick",
    items: [NATIVE_REACTIONS.like, NATIVE_REACTIONS.heart, NATIVE_REACTIONS.fire, NATIVE_REACTIONS.laugh, NATIVE_REACTIONS.wow, NATIVE_REACTIONS.pray, NATIVE_REACTIONS.rocket, NATIVE_REACTIONS.done],
  },
  {
    id: "work",
    label: "Work",
    items: [NATIVE_REACTIONS.target, NATIVE_REACTIONS.idea, NATIVE_REACTIONS.brain, NATIVE_REACTIONS.pin, NATIVE_REACTIONS.puzzle, NATIVE_REACTIONS.tools, NATIVE_REACTIONS.books, NATIVE_REACTIONS.chart],
  },
  {
    id: "team",
    label: "Team",
    items: [NATIVE_REACTIONS.clap, NATIVE_REACTIONS.raisedHands, NATIVE_REACTIONS.handshake, NATIVE_REACTIONS.salute, NATIVE_REACTIONS.muscle, NATIVE_REACTIONS.eyes, NATIVE_REACTIONS.party, NATIVE_REACTIONS.cool],
  },
  {
    id: "pro",
    label: "Pro",
    items: [NATIVE_REACTIONS.gem, NATIVE_REACTIONS.zap, NATIVE_REACTIONS.sparkles, NATIVE_REACTIONS.trophy, NATIVE_REACTIONS.celebrate, NATIVE_REACTIONS.coffee, NATIVE_REACTIONS.lab, NATIVE_REACTIONS.thinking],
  },
] as const;

type ReactionPresetId = (typeof REACTION_PRESETS)[number]["id"];
const MINI_NATIVE = Array.from(new Set(REACTION_PRESETS.flatMap((preset) => preset.items)));

interface ReactionPickerProps {
  activeEmojis?: ChatReactionEmoji[];
  onSelect: (emoji: ChatReactionEmoji) => void;
  onSelectAsset?: (assetId: string) => void;
  onSelectNative?: (native: string) => void;
  mode?: "message" | "reaction";
  className?: string;
}

function searchNative(query: string, preset: ReactionPresetId) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return REACTION_PRESETS.find((item) => item.id === preset)?.items ?? MINI_NATIVE.slice(0, 18);

  const martResults = Object.values(emojiMartData.emojis)
    .filter((emoji) => `${emoji.name} ${emoji.keywords?.join(" ") ?? ""} ${emoji.id}`.toLowerCase().includes(normalized))
    .map((emoji) => emoji.skins?.[0]?.native)
    .filter((native): native is string => Boolean(native));

  return Array.from(new Set([...MINI_NATIVE, ...martResults])).slice(0, 24);
}

export function ReactionPicker({
  activeEmojis = [],
  onSelect,
  onSelectAsset,
  onSelectNative,
  mode = "reaction",
  className,
}: ReactionPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<ReactionPresetId>("quick");
  const activeIds = activeEmojis.map(String);
  const nativeResults = useMemo(() => searchNative(query, preset), [query, preset]);

  const selectNative = (native: string) => {
    if (onSelectNative) {
      onSelectNative(native);
    } else {
      onSelect(encodeNativeEmojiReaction(native));
    }
    setExpanded(false);
  };

  if (mode === "message") {
    return (
      <PremiumEmojiPicker
        mode="message"
        compact
        activeEmojis={activeEmojis}
        onSelectReaction={onSelect}
        onSelectAsset={onSelectAsset}
        onSelectNative={onSelectNative}
        className={className}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 4 }}
      transition={{ type: "spring", stiffness: 480, damping: 36 }}
      className={cn("relative w-max max-w-[min(284px,calc(100vw-1rem))]", className)}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Message reactions"
    >
      <div className="flex items-center gap-1 rounded-full border border-white/80 bg-white/92 p-1 shadow-xl shadow-indigo-950/12 backdrop-blur-xl dark:border-gray-700/80 dark:bg-gray-900/92">
        {PREMIUM_REACTIONS.slice(0, 6).map((reaction) => (
          <ReactionButton
            key={reaction.id}
            asset={reaction}
            active={activeIds.includes(reaction.id)}
            compact
            onClick={() => onSelect(reaction.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gray-100 text-indigo-600 ring-1 ring-gray-200 transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 dark:bg-gray-800 dark:ring-gray-700 dark:hover:bg-indigo-950/40"
          aria-label={expanded ? "Close more reactions" : "Open more reactions"}
          aria-expanded={expanded}
        >
          <Plus className={cn("h-4 w-4 transition-transform", expanded && "rotate-45")} />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="absolute left-0 top-12 w-[268px] overflow-hidden rounded-[22px] border border-white/80 bg-white/94 p-2 shadow-2xl shadow-indigo-950/14 backdrop-blur-xl dark:border-gray-700/80 dark:bg-gray-900/94"
          >
            <div className="mb-2 flex h-8 items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-2.5 dark:border-gray-700 dark:bg-gray-800">
              <Search className="h-3.5 w-3.5 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Emoji"
                className="min-w-0 flex-1 bg-transparent text-xs text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                aria-label="Search reactions"
              />
            </div>

            <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5" aria-label="Reaction categories">
              {REACTION_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(item.id)}
                  className={cn(
                    "flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/30",
                    preset === item.id
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                      : "bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-indigo-950/50",
                  )}
                  aria-pressed={preset === item.id}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid max-h-[128px] grid-cols-6 gap-1 overflow-y-auto pr-0.5">
              {nativeResults.map((native, index) => {
                const reactionId = encodeNativeEmojiReaction(native);
                const active = activeIds.includes(reactionId);

                return (
                  <motion.button
                    key={`${native}-${index}`}
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => selectNative(native)}
                    className={cn(
                      "grid h-8 place-items-center rounded-xl transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 dark:hover:bg-indigo-950/40",
                      active && "bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-800",
                    )}
                    aria-label={`React with ${native}`}
                  >
                    <EmojiRenderer asset={getReactionAsset(reactionId)} size={20} decorative />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
