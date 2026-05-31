import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ChatReactionEmoji } from "@/types";
import { loadGeneratedEmojis, type GeneratedEmoji } from "@/data/emojiData";
import { cn } from "./chatShared";
import { FastEmojiPicker } from "./FastEmojiPicker";
import { FastEmojiRenderer } from "./FastEmojiRenderer";

interface ReactionPickerProps {
  activeEmojis?: ChatReactionEmoji[];
  onSelect: (emoji: ChatReactionEmoji) => void;
  onSelectAsset?: (assetId: string) => void;
  onSelectNative?: (native: string) => void;
  isPremiumUser?: boolean;
  mode?: "message" | "reaction";
  className?: string;
}

export function ReactionPicker({
  activeEmojis = [],
  onSelect,
  onSelectAsset,
  onSelectNative,
  isPremiumUser = false,
  mode = "reaction",
  className,
}: ReactionPickerProps) {
  const [reactionEmojis, setReactionEmojis] = useState<GeneratedEmoji[]>([]);
  const activeIds = useMemo(() => new Set(activeEmojis.map(String)), [activeEmojis]);

  useEffect(() => {
    if (mode !== "reaction") return;
    let cancelled = false;
    void loadGeneratedEmojis().then((payload) => {
      if (cancelled) return;
      setReactionEmojis(payload.emojis.filter((emoji) => emoji.type === "animated" && emoji.animationSrc).slice(0, 10));
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (mode === "message") {
    return <FastEmojiPicker onSelectAsset={onSelectAsset} onSelectNative={onSelectNative} isPremiumUser={isPremiumUser} className={className} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 4 }}
      transition={{ type: "spring", stiffness: 480, damping: 36 }}
      className={cn("w-[248px] rounded-2xl border border-white/80 bg-white/95 p-2 shadow-xl shadow-indigo-950/12 backdrop-blur-xl dark:border-gray-700/80 dark:bg-gray-900/95", className)}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Message reactions"
    >
      <div className="grid grid-cols-5 gap-1">
        {reactionEmojis.map((emoji) => {
          const active = activeIds.has(emoji.id);
          return (
            <button
              key={emoji.id}
              type="button"
              onClick={() => onSelect(emoji.id)}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 dark:hover:bg-indigo-950/40",
                active && "bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-800",
              )}
              aria-label={`React with ${emoji.name}`}
              title={emoji.name}
            >
              <FastEmojiRenderer emoji={emoji} size="reaction" mode="static" playOnClick={false} decorative />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
