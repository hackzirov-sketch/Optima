import { AnimatePresence, motion } from "framer-motion";
import Lottie from "lottie-react";
import { Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ChatReactionEmoji, ChatUser, UserStatus } from "@/types";

export type PremiumStatusId =
  | "coding"
  | "focused"
  | "learning"
  | "building"
  | "meeting"
  | "sleeping"
  | "gaming"
  | "offline"
  | "busy"
  | "available";

export type PremiumEmojiSectionId =
  | "recent"
  | "favorites"
  | "premium"
  | "smileys"
  | "people"
  | "animals"
  | "food"
  | "activities"
  | "travel"
  | "objects"
  | "symbols"
  | "flags"
  | "work-productivity"
  | "learning"
  | "coding"
  | "team"
  | "achievement"
  | "status"
  | "workspace";

type FigmaSource = {
  id: string;
  url: string;
  folder: "emojis" | "stickers" | "reactions" | "status" | "badges" | "animated" | "community";
  label: string;
};

type PublicEmojiSource = {
  id: string;
  name: string;
  license: string;
  usage: string;
  folder?: string;
};

type PremiumAsset = {
  id: string;
  label: string;
  src?: string;
  native?: string;
  animatedFluentId?: string;
  effect?: "pop" | "fire" | "hearts" | "sparkles" | "gem";
  section: PremiumEmojiSectionId;
  aliases: string[];
  sourceId: string;
  premium?: boolean;
  animated?: boolean;
  reactionId?: ChatReactionEmoji;
};

type PremiumReaction = PremiumAsset & {
  id: ChatReactionEmoji;
  category: "recent" | "favorite" | "premium";
  reactionId: ChatReactionEmoji;
};

type PremiumStatus = {
  id: PremiumStatusId;
  label: string;
  src: string;
  tone: string;
  sourceId: string;
};

type PremiumSticker = {
  id: string;
  label: string;
  src: string;
  prompt: string;
  sourceId: string;
  section: PremiumEmojiSectionId;
};

const classNames = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const REACTION_PARTICLES = ["#6366F1", "#3B82F6", "#F59E0B", "#10B981", "#F43F5E", "#FACC15"];

const EMOJI_NATIVE = {
  eyes: "\u{1F440}",
  target: "\u{1F3AF}",
  idea: "\u{1F4A1}",
  brain: "\u{1F9E0}",
  sparkles: "\u2728",
  trophy: "\u{1F3C6}",
  muscle: "\u{1F4AA}",
  celebrate: "\u{1F389}",
  star: "\u{1F31F}",
  raisedHands: "\u{1F64C}",
  handshake: "\u{1F91D}",
  salute: "\u{1FAE1}",
  stopwatch: "\u{23F1}\uFE0F",
  pin: "\u{1F4CC}",
  puzzle: "\u{1F9E9}",
  tools: "\u{1F6E0}\uFE0F",
  books: "\u{1F4DA}",
  sleeping: "\u{1F4A4}",
  green: "\u{1F7E2}",
  yellow: "\u{1F7E1}",
  red: "\u{1F534}",
  coffee: "\u2615",
  note: "\u{1F4DD}",
  calendar: "\u{1F4C5}",
  search: "\u{1F50D}",
  briefcase: "\u{1F4BC}",
  laptop: "\u{1F4BB}",
  developer: "\u{1F9D1}\u200D\u{1F4BB}",
  chart: "\u{1F4C8}",
  hourglass: "\u{23F3}",
  lock: "\u{1F512}",
  lab: "\u{1F9EA}",
  party: "\u{1F973}",
  cool: "\u{1F60E}",
  thinking: "\u{1F914}",
  wave: "\u{1F44B}",
} as const;

const OPENMOJI_ASSET_CODES = new Set([
  "1F44D",
  "2764",
  "1F525",
  "1F602",
  "1F62E",
  "1F622",
  "1F64F",
  "1F680",
  "26A1",
  "1F48E",
  "2705",
  "1F44F",
  "1F440",
  "1F3AF",
  "1F4A1",
  "1F9E0",
  "2728",
  "1F3C6",
  "1F4AA",
  "1F64C",
  "1F91D",
  "1FAE1",
  "23F1",
  "1F4CC",
  "1F9E9",
  "1F6E0",
  "1F4DA",
  "1F4A4",
  "1F7E2",
  "1F7E1",
  "1F534",
  "2615",
  "1F389",
  "1F31F",
  "1F4DD",
  "1F4C5",
  "1F50D",
  "1F4BC",
  "1F4BB",
  "1F9D1-200D-1F4BB",
  "1F4C8",
  "23F3",
  "1F512",
  "1F9EA",
  "1F973",
  "1F60E",
  "1F914",
  "1F44B",
]);

function nativeToOpenMojiCode(native: string) {
  return Array.from(native)
    .map((char) => char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0"))
    .filter(Boolean)
    .join("-");
}

export function getOpenMojiAssetSrc(native: string) {
  const exact = nativeToOpenMojiCode(native);
  const withoutVariation = exact.replace(/-FE0F/g, "");
  const code = OPENMOJI_ASSET_CODES.has(exact) ? exact : OPENMOJI_ASSET_CODES.has(withoutVariation) ? withoutVariation : "";
  return code ? `/openmoji/${code}.svg` : undefined;
}

function createOpenMojiAsset(
  id: string,
  label: string,
  native: string,
  section: PremiumEmojiSectionId,
  aliases: string[],
  effect: PremiumAsset["effect"] = "sparkles",
): PremiumAsset {
  return {
    id,
    label,
    native,
    src: getOpenMojiAssetSrc(native),
    section,
    aliases,
    sourceId: "openmoji",
    premium: true,
    reactionId: `emoji:${native}` as ChatReactionEmoji,
    effect,
  };
}

const SPARKLE_LOTTIE = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 42,
  w: 80,
  h: 80,
  nm: "UPZ reaction sparkle",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "sparkle",
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [0] }, { t: 8, s: [100] }, { t: 28, s: [88] }, { t: 42, s: [0] }] },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 42, s: [90] }] },
        p: { a: 0, k: [40, 40, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [20, 20, 100] }, { t: 14, s: [110, 110, 100] }, { t: 42, s: [20, 20, 100] }] },
      },
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [18, 18] } },
            { ty: "fl", c: { a: 0, k: [0.99, 0.84, 0.27, 1] }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 42,
      st: 0,
      bm: 0,
    },
  ],
};

export const PREMIUM_FIGMA_SOURCES: FigmaSource[] = [
  { id: "figma-1079620626888497486", url: "https://www.figma.com/community/file/1079620626888497486", folder: "reactions", label: "Premium reaction source" },
  { id: "figma-913339145625776252", url: "https://www.figma.com/community/file/913339145625776252", folder: "emojis", label: "Memoji profile source" },
  { id: "figma-880472656109554171", url: "https://www.figma.com/community/file/880472656109554171", folder: "emojis", label: "Emoji collection source" },
  { id: "figma-1189959468232007322", url: "https://www.figma.com/community/file/1189959468232007322", folder: "stickers", label: "Sticker source" },
  { id: "figma-1009868574319844781", url: "https://www.figma.com/community/file/1009868574319844781", folder: "status", label: "Status source" },
  { id: "figma-1362851535732450410", url: "https://www.figma.com/community/file/1362851535732450410", folder: "animated", label: "Animated emoji source" },
  { id: "figma-1360294413073459375", url: "https://www.figma.com/community/file/1360294413073459375", folder: "community", label: "Community identity source" },
  { id: "figma-1330303513070680896", url: "https://www.figma.com/community/file/1330303513070680896", folder: "badges", label: "Premium badge source" },
  { id: "figma-909586006292122542", url: "https://www.figma.com/community/file/909586006292122542", folder: "emojis", label: "Workspace pack source" },
  { id: "figma-984862418888658318", url: "https://www.figma.com/community/file/984862418888658318", folder: "stickers", label: "Team sticker source" },
  { id: "figma-1084822581560600941", url: "https://www.figma.com/community/file/1084822581560600941", folder: "animated", label: "Animated status source" },
];

export const PUBLIC_FREE_EMOJI_SOURCES: PublicEmojiSource[] = [
  { id: "emoji-mart-data", name: "Emoji Mart Data", license: "MIT", usage: "Unicode search index, category metadata, keyboard-friendly emoji lookup" },
  { id: "frimousse", name: "Frimousse", license: "MIT", usage: "Accessible picker primitives for the Telegram-like emoji cloud" },
  { id: "animated-fluent-emojis", name: "Animated Fluent Emojis", license: "ISC", usage: "Subtle animated emoji rendering for premium hover states" },
  { id: "openmoji", name: "OpenMoji", license: "CC BY-SA 4.0", usage: "Curated public SVG reaction/status/productivity assets", folder: "/openmoji/" },
];

export const PREMIUM_EMOJI_SECTIONS: Array<{ id: PremiumEmojiSectionId; label: string; premium?: boolean }> = [
  { id: "recent", label: "Recent" },
  { id: "favorites", label: "Favorites" },
  { id: "premium", label: "Premium", premium: true },
  { id: "smileys", label: "Smileys" },
  { id: "people", label: "People" },
  { id: "animals", label: "Animals" },
  { id: "food", label: "Food" },
  { id: "activities", label: "Activities" },
  { id: "travel", label: "Travel" },
  { id: "objects", label: "Objects" },
  { id: "symbols", label: "Symbols" },
  { id: "flags", label: "Flags" },
  { id: "work-productivity", label: "Work & Productivity", premium: true },
  { id: "learning", label: "Learning", premium: true },
  { id: "coding", label: "Coding", premium: true },
  { id: "team", label: "Team", premium: true },
  { id: "achievement", label: "Achievement", premium: true },
  { id: "status", label: "Status", premium: true },
  { id: "workspace", label: "Custom Workspace Packs", premium: true },
];

export const PREMIUM_REACTIONS: PremiumReaction[] = [
  { id: "like", label: "Like", src: "/reactions/like.svg", native: "\u{1F44D}", animatedFluentId: "thumbs-up", category: "recent", section: "recent", aliases: ["approve", "thumb", "yes"], sourceId: "figma-1079620626888497486", premium: true, reactionId: "like", effect: "pop" },
  { id: "heart", label: "Love", src: "/reactions/heart.svg", native: "\u2764\uFE0F", animatedFluentId: "red-heart", category: "favorite", section: "favorites", aliases: ["love", "care", "warm"], sourceId: "figma-1079620626888497486", premium: true, reactionId: "heart", effect: "hearts" },
  { id: "fire", label: "Fire", src: "/reactions/fire.svg", native: "\u{1F525}", animatedFluentId: "fire", category: "premium", section: "premium", aliases: ["hot", "ship", "energy"], sourceId: "figma-1362851535732450410", premium: true, animated: true, reactionId: "fire", effect: "fire" },
  { id: "laugh", label: "Laugh", src: "/reactions/laugh.svg", native: "\u{1F602}", animatedFluentId: "face-with-tears-of-joy", category: "recent", section: "smileys", aliases: ["fun", "haha"], sourceId: "figma-880472656109554171", reactionId: "laugh", effect: "pop" },
  { id: "wow", label: "Wow", src: getOpenMojiAssetSrc("\u{1F62E}"), native: "\u{1F62E}", animatedFluentId: "face-with-open-mouth", category: "recent", section: "smileys", aliases: ["wow", "surprise", "impressed"], sourceId: "openmoji", reactionId: "wow", effect: "sparkles" },
  { id: "sad", label: "Sad", src: getOpenMojiAssetSrc("\u{1F622}"), native: "\u{1F622}", animatedFluentId: "crying-face", category: "favorite", section: "smileys", aliases: ["sad", "empathy", "cry"], sourceId: "openmoji", reactionId: "sad", effect: "hearts" },
  { id: "pray", label: "Thanks", src: getOpenMojiAssetSrc("\u{1F64F}"), native: "\u{1F64F}", animatedFluentId: "folded-hands", category: "favorite", section: "people", aliases: ["thanks", "please", "respect"], sourceId: "openmoji", reactionId: "pray", effect: "sparkles" },
  { id: "rocket", label: "Launch", src: "/emojis/rocket.svg", native: "\u{1F680}", animatedFluentId: "rocket", category: "premium", section: "work-productivity", aliases: ["rocket", "launch", "ship"], sourceId: "figma-1362851535732450410", premium: true, animated: true, reactionId: "rocket", effect: "fire" },
  { id: "zap", label: "Energy", src: "/emojis/sparkle.svg", native: "\u26A1", animatedFluentId: "high-voltage", category: "premium", section: "premium", aliases: ["energy", "fast", "power"], sourceId: "emoji-mart-frimousse", premium: true, animated: true, reactionId: "zap", effect: "sparkles" },
  { id: "gem", label: "Premium", src: "/emojis/gem.svg", native: "\u{1F48E}", animatedFluentId: "gem-stone", category: "premium", section: "premium", aliases: ["gem", "premium", "quality"], sourceId: "figma-1330303513070680896", premium: true, reactionId: "gem", effect: "gem" },
];

const PRODUCTIVITY_REACTIONS: PremiumReaction[] = [
  { id: "clap", label: "Applause", src: "/reactions/clap.svg", native: "\u{1F44F}", animatedFluentId: "clapping-hands", category: "favorite", section: "team", aliases: ["bravo", "team", "nice"], sourceId: "figma-984862418888658318", premium: true, reactionId: "clap", effect: "sparkles" },
  { id: "done", label: "Done", src: "/reactions/done.svg", native: "\u2705", animatedFluentId: "check-mark-button", category: "premium", section: "work-productivity", aliases: ["complete", "approved", "task"], sourceId: "figma-909586006292122542", premium: true, reactionId: "done", effect: "pop" },
];
const ALL_PREMIUM_REACTIONS: PremiumReaction[] = [...PREMIUM_REACTIONS, ...PRODUCTIVITY_REACTIONS];

export const PREMIUM_STATUSES: PremiumStatus[] = [
  { id: "coding", label: "Coding", src: "/status/coding.svg", tone: "from-indigo-500 to-blue-500", sourceId: "figma-1009868574319844781" },
  { id: "focused", label: "Focused", src: "/status/focused.svg", tone: "from-sky-500 to-indigo-500", sourceId: "figma-1084822581560600941" },
  { id: "learning", label: "Learning", src: "/status/learning.svg", tone: "from-violet-500 to-blue-500", sourceId: "figma-1009868574319844781" },
  { id: "building", label: "Building", src: "/status/building.svg", tone: "from-orange-500 to-indigo-500", sourceId: "figma-1362851535732450410" },
  { id: "meeting", label: "Meeting", src: "/status/meeting.svg", tone: "from-cyan-500 to-blue-500", sourceId: "figma-1189959468232007322" },
  { id: "sleeping", label: "Sleeping", src: "/status/sleeping.svg", tone: "from-slate-500 to-indigo-900", sourceId: "figma-1009868574319844781" },
  { id: "gaming", label: "Gaming", src: "/status/gaming.svg", tone: "from-violet-600 to-pink-500", sourceId: "figma-880472656109554171" },
  { id: "offline", label: "Offline", src: "/status/offline.svg", tone: "from-slate-400 to-slate-600", sourceId: "figma-1009868574319844781" },
  { id: "busy", label: "Busy", src: "/status/busy.svg", tone: "from-rose-500 to-orange-500", sourceId: "figma-1084822581560600941" },
  { id: "available", label: "Available", src: "/status/available.svg", tone: "from-emerald-500 to-green-500", sourceId: "figma-1009868574319844781" },
];

export const PREMIUM_STICKERS: PremiumSticker[] = [
  { id: "ship-it", label: "Ship it", src: "/stickers/ship-it.svg", prompt: "Ship it. This is ready for the next step.", sourceId: "figma-1189959468232007322", section: "work-productivity" },
  { id: "great-work", label: "Great work", src: "/stickers/great-work.svg", prompt: "Great work. This looks polished.", sourceId: "figma-984862418888658318", section: "team" },
  { id: "focus-mode", label: "Focus mode", src: "/stickers/focus-mode.svg", prompt: "Focus mode on. I will handle this block.", sourceId: "figma-1084822581560600941", section: "status" },
  { id: "premium-win", label: "Win unlocked", src: "/stickers/premium-win.svg", prompt: "Win unlocked. Nice progress today.", sourceId: "figma-1330303513070680896", section: "achievement" },
];

export const PREMIUM_EMOJI_PACKS: PremiumAsset[] = [
  { id: "productivity-laptop", label: "Deep Work", src: "/emojis/laptop.svg", section: "work-productivity", aliases: ["laptop", "work", "deep"], sourceId: "figma-909586006292122542", premium: true, reactionId: "done" },
  { id: "learning-book", label: "Learning", src: "/emojis/book.svg", section: "learning", aliases: ["book", "study", "mentor"], sourceId: "figma-880472656109554171", premium: true, reactionId: "like" },
  { id: "shipping-rocket", label: "Shipping", src: "/emojis/rocket.svg", section: "activities", aliases: ["rocket", "launch", "build"], sourceId: "figma-1362851535732450410", premium: true, animated: true, reactionId: "fire" },
  { id: "premium-gem", label: "Premium", src: "/emojis/gem.svg", section: "premium", aliases: ["premium", "gem", "pro"], sourceId: "figma-1330303513070680896", premium: true, reactionId: "heart" },
  { id: "wins-trophy", label: "Achievement", src: "/emojis/trophy.svg", section: "achievement", aliases: ["win", "trophy", "achievement"], sourceId: "figma-1330303513070680896", premium: true, reactionId: "clap" },
  { id: "typing-spark", label: "Typing Spark", src: "/animated/typing-spark.svg", section: "status", aliases: ["typing", "spark", "presence"], sourceId: "figma-1084822581560600941", premium: true, animated: true, reactionId: "like" },
  { id: "developer-terminal", label: "Developer", src: "/community/developer.svg", section: "coding", aliases: ["developer", "terminal", "code"], sourceId: "figma-1360294413073459375", premium: true, reactionId: "done" },
  { id: "designer-pen", label: "Designer", src: "/community/designer.svg", section: "objects", aliases: ["designer", "pen", "design"], sourceId: "figma-1360294413073459375", premium: true, reactionId: "heart" },
  { id: "teacher-book", label: "Teacher", src: "/community/teacher.svg", section: "learning", aliases: ["teacher", "book", "class"], sourceId: "figma-1360294413073459375", premium: true, reactionId: "like" },
  { id: "freelancer-rocket", label: "Freelancer", src: "/community/freelancer.svg", section: "workspace", aliases: ["freelancer", "rocket", "work"], sourceId: "figma-1360294413073459375", premium: true, reactionId: "fire" },
];

const OPENMOJI_PRODUCTIVITY_PACKS: PremiumAsset[] = [
  createOpenMojiAsset("openmoji-review", "Reviewing", EMOJI_NATIVE.eyes, "work-productivity", ["review", "watch", "eyes"], "pop"),
  createOpenMojiAsset("openmoji-target", "Target", EMOJI_NATIVE.target, "work-productivity", ["goal", "target", "focus"], "sparkles"),
  createOpenMojiAsset("openmoji-idea", "Idea", EMOJI_NATIVE.idea, "learning", ["idea", "insight", "lightbulb"], "sparkles"),
  createOpenMojiAsset("openmoji-brain", "Deep focus", EMOJI_NATIVE.brain, "coding", ["brain", "thinking", "focus"], "sparkles"),
  createOpenMojiAsset("openmoji-sparkles", "Polished", EMOJI_NATIVE.sparkles, "premium", ["sparkle", "polish", "premium"], "sparkles"),
  createOpenMojiAsset("openmoji-trophy", "Win", EMOJI_NATIVE.trophy, "achievement", ["win", "trophy", "achievement"], "gem"),
  createOpenMojiAsset("openmoji-muscle", "Strong", EMOJI_NATIVE.muscle, "team", ["strong", "support", "effort"], "pop"),
  createOpenMojiAsset("openmoji-celebrate", "Celebrate", EMOJI_NATIVE.celebrate, "achievement", ["party", "celebrate", "launch"], "sparkles"),
  createOpenMojiAsset("openmoji-star", "Featured", EMOJI_NATIVE.star, "premium", ["star", "featured", "favorite"], "gem"),
  createOpenMojiAsset("openmoji-hands", "Team win", EMOJI_NATIVE.raisedHands, "team", ["team", "win", "hands"], "sparkles"),
  createOpenMojiAsset("openmoji-handshake", "Aligned", EMOJI_NATIVE.handshake, "team", ["agreement", "aligned", "deal"], "pop"),
  createOpenMojiAsset("openmoji-salute", "Respect", EMOJI_NATIVE.salute, "people", ["respect", "salute", "noted"], "pop"),
  createOpenMojiAsset("openmoji-stopwatch", "Timebox", EMOJI_NATIVE.stopwatch, "status", ["timer", "time", "focus"], "pop"),
  createOpenMojiAsset("openmoji-pin", "Pinned", EMOJI_NATIVE.pin, "objects", ["pin", "important", "saved"], "pop"),
  createOpenMojiAsset("openmoji-puzzle", "Solution", EMOJI_NATIVE.puzzle, "work-productivity", ["puzzle", "solve", "system"], "sparkles"),
  createOpenMojiAsset("openmoji-tools", "Building", EMOJI_NATIVE.tools, "coding", ["tools", "build", "fix"], "sparkles"),
  createOpenMojiAsset("openmoji-books", "Learning stack", EMOJI_NATIVE.books, "learning", ["books", "learn", "docs"], "pop"),
  createOpenMojiAsset("openmoji-coffee", "Coffee focus", EMOJI_NATIVE.coffee, "status", ["coffee", "focus", "break"], "pop"),
  createOpenMojiAsset("openmoji-note", "Note", EMOJI_NATIVE.note, "objects", ["note", "doc", "write"], "pop"),
  createOpenMojiAsset("openmoji-calendar", "Deadline", EMOJI_NATIVE.calendar, "work-productivity", ["calendar", "deadline", "schedule"], "pop"),
  createOpenMojiAsset("openmoji-search", "Investigate", EMOJI_NATIVE.search, "work-productivity", ["search", "investigate", "find"], "pop"),
  createOpenMojiAsset("openmoji-briefcase", "Client work", EMOJI_NATIVE.briefcase, "workspace", ["briefcase", "client", "work"], "pop"),
  createOpenMojiAsset("openmoji-laptop", "Workstation", EMOJI_NATIVE.laptop, "coding", ["laptop", "workspace", "device"], "pop"),
  createOpenMojiAsset("openmoji-developer", "Developer mode", EMOJI_NATIVE.developer, "coding", ["developer", "code", "terminal"], "sparkles"),
  createOpenMojiAsset("openmoji-chart", "Growth", EMOJI_NATIVE.chart, "achievement", ["chart", "growth", "metrics"], "sparkles"),
  createOpenMojiAsset("openmoji-hourglass", "Waiting", EMOJI_NATIVE.hourglass, "status", ["waiting", "pending", "time"], "pop"),
  createOpenMojiAsset("openmoji-lock", "Private", EMOJI_NATIVE.lock, "status", ["lock", "private", "secure"], "pop"),
  createOpenMojiAsset("openmoji-lab", "Experiment", EMOJI_NATIVE.lab, "work-productivity", ["experiment", "test", "lab"], "sparkles"),
  createOpenMojiAsset("openmoji-party", "Big win", EMOJI_NATIVE.party, "achievement", ["party", "win", "celebrate"], "sparkles"),
  createOpenMojiAsset("openmoji-cool", "Cool", EMOJI_NATIVE.cool, "smileys", ["cool", "nice", "confident"], "pop"),
  createOpenMojiAsset("openmoji-thinking", "Thinking", EMOJI_NATIVE.thinking, "smileys", ["thinking", "hmm", "question"], "pop"),
  createOpenMojiAsset("openmoji-wave", "Hello", EMOJI_NATIVE.wave, "people", ["hello", "wave", "welcome"], "pop"),
];

const PLACEHOLDER_SECTION_ASSETS: PremiumAsset[] = PREMIUM_EMOJI_SECTIONS.flatMap((section, index) => {
  const base = PREMIUM_EMOJI_PACKS[index % PREMIUM_EMOJI_PACKS.length];
  const reaction = PREMIUM_REACTIONS[index % PREMIUM_REACTIONS.length];
  return [
    { ...base, id: `${section.id}-primary`, label: section.label, section: section.id, aliases: [...base.aliases, section.id], sourceId: base.sourceId },
    { ...reaction, id: `${section.id}-reaction`, label: `${section.label} Reaction`, section: section.id, aliases: [section.id, "reaction"], sourceId: reaction.sourceId, reactionId: reaction.reactionId },
  ];
});

export const PREMIUM_EMOJI_COLLECTION: PremiumAsset[] = [
  ...ALL_PREMIUM_REACTIONS,
  ...PREMIUM_EMOJI_PACKS,
  ...OPENMOJI_PRODUCTIVITY_PACKS,
  ...PLACEHOLDER_SECTION_ASSETS,
];

const LEGACY_REACTION_MAP: Record<string, ChatReactionEmoji> = {
  "\u{1F44D}": "like",
  "\u2764\uFE0F": "heart",
  "\u{1F525}": "fire",
  "\u{1F602}": "laugh",
  "\u{1F62E}": "wow",
  "\u{1F622}": "sad",
  "\u{1F64F}": "pray",
  "\u{1F680}": "rocket",
  "\u26A1": "zap",
  "\u{1F48E}": "gem",
  "\u{1F44F}": "clap",
  "\u2705": "done",
};

const STATUS_BY_USER_ID: Record<string, PremiumStatusId> = {
  me: "available",
  u1: "coding",
  u2: "focused",
  u3: "meeting",
  u4: "sleeping",
  u5: "building",
};

const STATUS_BY_BASE_STATUS: Record<UserStatus, PremiumStatusId> = {
  online: "available",
  away: "busy",
  offline: "offline",
};

export function normalizeReactionId(value: string): ChatReactionEmoji {
  if (LEGACY_REACTION_MAP[value]) return LEGACY_REACTION_MAP[value];
  if (value.startsWith("emoji:")) return value as ChatReactionEmoji;
  const known = ALL_PREMIUM_REACTIONS.find((reaction) => reaction.id === value || reaction.reactionId === value);
  const collectionMatch = PREMIUM_EMOJI_COLLECTION.find((asset) => asset.id === value || asset.reactionId === value);
  return known?.id ?? collectionMatch?.reactionId ?? (value as ChatReactionEmoji);
}

export function getReactionAsset(value: string) {
  const normalized = normalizeReactionId(value);
  if (String(normalized).startsWith("emoji:")) {
    const native = String(normalized).slice("emoji:".length);
    const openMojiSrc = getOpenMojiAssetSrc(native);
    const dynamicReaction: PremiumReaction = {
      id: normalized,
      label: "Custom emoji",
      native,
      src: openMojiSrc,
      category: "recent",
      section: "recent" as PremiumEmojiSectionId,
      aliases: ["custom", "emoji"],
      sourceId: openMojiSrc ? "openmoji" : "emoji-mart-frimousse",
      reactionId: normalized,
      effect: "sparkles" as const,
    };
    return dynamicReaction;
  }
  return ALL_PREMIUM_REACTIONS.find((reaction) => reaction.id === normalized) ?? PREMIUM_REACTIONS[0];
}

export function findEmojiAsset(value: string) {
  if (value.startsWith("emoji:")) return getReactionAsset(value);
  return PREMIUM_EMOJI_COLLECTION.find((asset) => asset.id === value || asset.reactionId === value);
}

export function getEmojiAsset(value: string) {
  return findEmojiAsset(value) ?? getReactionAsset(value);
}

export function encodeNativeEmojiReaction(native: string): ChatReactionEmoji {
  return `emoji:${native}` as ChatReactionEmoji;
}

export function getStatusAsset(status: PremiumStatusId) {
  return PREMIUM_STATUSES.find((item) => item.id === status) ?? PREMIUM_STATUSES[0];
}

export function getEmojiSectionItems(section: PremiumEmojiSectionId, query = "") {
  const normalized = query.trim().toLowerCase();
  return PREMIUM_EMOJI_COLLECTION.filter((asset) => {
    const sectionMatches = asset.section === section || section === "recent" || (section === "premium" && asset.premium);
    if (!sectionMatches) return false;
    if (!normalized) return true;
    return `${asset.label} ${asset.aliases.join(" ")}`.toLowerCase().includes(normalized);
  }).slice(0, 28);
}

export function getPremiumStatusForUser(user?: ChatUser): PremiumStatusId {
  if (!user) return "offline";
  if (user.status === "offline") return "offline";
  return STATUS_BY_USER_ID[user.id] ?? STATUS_BY_BASE_STATUS[user.status] ?? "available";
}

export function EmojiRenderer({
  asset,
  assetId,
  size = 24,
  className = "",
  decorative = false,
}: {
  asset?: PremiumAsset | PremiumReaction;
  assetId?: string;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const resolved = asset ?? getEmojiAsset(assetId ?? "like");
  const label = `${resolved.label} premium emoji`;

  if (!resolved.src && !resolved.animatedFluentId) {
    return (
      <span
        aria-hidden={decorative ? "true" : undefined}
        aria-label={decorative ? undefined : label}
        className={classNames("inline-grid select-none place-items-center leading-none", className)}
        style={{ width: size, height: size, fontSize: Math.max(14, size * 0.82) }}
      >
        {resolved.native ?? "\u2726"}
      </span>
    );
  }

  if (resolved.animatedFluentId && !resolved.src) {
    return (
      <motion.span
        animate={decorative ? undefined : { scale: [1, 1.05, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden={decorative ? "true" : undefined}
        aria-label={decorative ? undefined : label}
        className={classNames("relative inline-grid select-none place-items-center overflow-hidden rounded-full leading-none", className)}
        style={{ width: size, height: size, fontSize: Math.max(14, size * 0.78) }}
      >
        <span className="absolute inset-0 rounded-full bg-indigo-400/10 blur-md" aria-hidden="true" />
        <span className="relative grid place-items-center">{resolved.native ?? "\u2726"}</span>
      </motion.span>
    );
  }

  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={classNames("relative inline-grid select-none place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={resolved.src}
        alt={decorative ? "" : label}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}

export function PremiumReactionIcon({ reaction, size = 24, className = "" }: { reaction: string; size?: number; className?: string }) {
  return <EmojiRenderer asset={getReactionAsset(reaction)} size={size} className={className} />;
}

export function ReactionButton({
  asset,
  active = false,
  count,
  onClick,
  compact = false,
}: {
  asset: PremiumAsset | PremiumReaction;
  active?: boolean;
  count?: number;
  onClick: () => void;
  compact?: boolean;
}) {
  const [burstKey, setBurstKey] = useState(0);
  const triggerClick = () => {
    setBurstKey((current) => current + 1);
    onClick();
  };

  return (
    <motion.button
      type="button"
      whileHover={{ scale: compact ? 1.06 : 1.12, y: -2, boxShadow: "0 16px 36px rgba(99,102,241,0.18)" }}
      whileTap={{ scale: 0.9 }}
      onClick={triggerClick}
      className={classNames(
        "group relative inline-flex flex-shrink-0 items-center justify-center gap-1.5 overflow-visible border bg-white/90 shadow-sm backdrop-blur transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/30",
        compact ? "h-8 rounded-full px-2" : "h-12 w-12 rounded-2xl",
        active ? "border-indigo-200 text-indigo-700 ring-1 ring-indigo-100" : "border-[#E5E7EB] text-[#111827] hover:border-indigo-200",
      )}
      aria-label={`Select ${asset.label} reaction`}
      title={asset.label}
    >
      <AnimatePresence>
        {burstKey > 0 && (
          <motion.span
            key={burstKey}
            className="pointer-events-none absolute inset-0 z-0"
            initial={{ opacity: 1, scale: 0.2 }}
            animate={{ opacity: 0, scale: 1.85 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
          >
            <span className="absolute inset-0 rounded-full bg-indigo-400/20 blur-sm" />
            <span className="absolute -inset-5">
              <Lottie animationData={SPARKLE_LOTTIE} loop={false} autoplay className="h-full w-full" />
            </span>
            {REACTION_PARTICLES.slice(0, compact ? 4 : 6).map((color, index) => (
              <motion.span
                key={`${color}-${index}`}
                className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
                initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.6 }}
                animate={{
                  x: Math.cos((index / 6) * Math.PI * 2) * (compact ? 18 : 28),
                  y: Math.sin((index / 6) * Math.PI * 2) * (compact ? 18 : 28),
                  opacity: 0,
                  scale: 0.1,
                }}
                transition={{ duration: 0.46, ease: "easeOut" }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
      <EmojiRenderer asset={asset} size={compact ? 18 : 31} className="drop-shadow-sm transition-transform group-hover:scale-105" />
      {typeof count === "number" && (
        <motion.span key={count} initial={{ scale: 0.7, opacity: 0.5 }} animate={{ scale: 1, opacity: 0.7 }} className="text-[10px] font-bold">
          {count}
        </motion.span>
      )}
      {!compact && (
        <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-white/90 px-2 py-1 text-[10px] font-bold text-[#111827] shadow-lg backdrop-blur group-hover:block">
          {asset.label}
        </span>
      )}
    </motion.button>
  );
}

export function PremiumStatusBadge({
  status,
  size = 22,
  className = "",
  showLabel = false,
}: {
  status: PremiumStatusId;
  size?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const asset = getStatusAsset(status);

  return (
    <motion.span
      initial={false}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      className={classNames("inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/85 p-0.5 shadow-sm backdrop-blur", className)}
      aria-label={`Premium status: ${asset.label}`}
      title={asset.label}
    >
      <img src={asset.src} alt={`${asset.label} status`} width={size} height={size} loading="lazy" decoding="async" className="object-contain" draggable={false} />
      {showLabel && <span className="pr-1 text-[11px] font-bold text-[#111827]">{asset.label}</span>}
    </motion.span>
  );
}

export function PremiumStatus(props: Parameters<typeof PremiumStatusBadge>[0]) {
  return <PremiumStatusBadge {...props} />;
}

export function AnimatedPresenceIndicator({ status, className = "" }: { status: PremiumStatusId; className?: string }) {
  const asset = getStatusAsset(status);
  return (
    <motion.span
      animate={{ boxShadow: ["0 0 0 0 rgba(99,102,241,0.18)", "0 0 0 8px rgba(99,102,241,0)"] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      className={classNames(`inline-flex items-center rounded-full bg-gradient-to-br ${asset.tone} p-[2px]`, className)}
      aria-label={`${asset.label} presence`}
    >
      <span className="rounded-full bg-white p-0.5">
        <img src={asset.src} alt={`${asset.label} presence icon`} className="h-4 w-4" loading="lazy" decoding="async" />
      </span>
    </motion.span>
  );
}

export function PremiumAvatarRing({ children, active = true, className = "" }: { children: ReactNode; active?: boolean; className?: string }) {
  return (
    <motion.div
      animate={active ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] } : undefined}
      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      className={classNames(
        "relative rounded-full p-[2px]",
        active ? "bg-[linear-gradient(120deg,#6366F1,#3B82F6,#10B981,#6366F1)] bg-[length:220%_220%] shadow-sm shadow-indigo-200" : "bg-[#E5E7EB]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function PremiumGradientBadge({ label = "Premium", icon = "/emojis/gem.svg", className = "" }: { label?: string; icon?: string; className?: string }) {
  return (
    <span className={classNames("inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-gradient-to-r from-indigo-50 via-white to-blue-50 px-2.5 py-1 text-[11px] font-black text-indigo-700 shadow-sm", className)}>
      <img src={icon} alt="" aria-hidden="true" width={16} height={16} loading="lazy" decoding="async" className="h-4 w-4" />
      {label}
    </span>
  );
}

export function PremiumBadge(props: Parameters<typeof PremiumGradientBadge>[0]) {
  return <PremiumGradientBadge {...props} />;
}

const AI_STATE_ASSETS = {
  thinking: { label: "Thinking", asset: "typing-spark", emoji: "\u{1F9E0}", fluent: "brain" },
  typing: { label: "Typing", asset: "typing-spark", emoji: "\u270D\uFE0F", fluent: "writing-hand" },
  generating: { label: "Generating", asset: "shipping-rocket", emoji: "\u2728", fluent: "sparkles" },
  completed: { label: "Completed", asset: "done", emoji: "\u2705", fluent: "check-mark-button" },
} as const;

export function AIAssistantStateBadge({
  state,
  className = "",
}: {
  state: keyof typeof AI_STATE_ASSETS;
  className?: string;
}) {
  const config = AI_STATE_ASSETS[state];
  const asset = getEmojiAsset(config.asset);

  return (
    <motion.span
      animate={state === "completed" ? { scale: 1 } : { opacity: [0.72, 1, 0.72] }}
      transition={{ duration: 1.7, repeat: state === "completed" ? 0 : Infinity, ease: "easeInOut" }}
      className={classNames("inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-black text-[#111827] shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100", className)}
      aria-label={`AI assistant state: ${config.label}`}
    >
      <EmojiRenderer asset={asset} size={20} decorative />
      {config.label}
    </motion.span>
  );
}

export function WorkspaceEmojiPack({ activeId, onSelect }: { activeId?: string; onSelect?: (asset: PremiumAsset) => void }) {
  const packs = PREMIUM_EMOJI_PACKS.filter((asset) => ["workspace", "work-productivity", "coding", "learning", "achievement", "team"].includes(asset.section));
  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-2xl bg-[#F7FAFC] p-2" role="list" aria-label="Workspace emoji packs">
      {packs.map((pack) => (
        <button
          key={pack.id}
          type="button"
          onClick={() => onSelect?.(pack)}
          className={classNames("inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#6B7280] ring-1 ring-[#E5E7EB] transition-colors hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30", activeId === pack.id && "text-indigo-700 ring-indigo-200")}
          aria-label={`Select ${pack.label} emoji pack`}
        >
          <EmojiRenderer asset={pack} size={16} decorative />
          {pack.label}
        </button>
      ))}
    </div>
  );
}

export function CommunityRoleIcon({ role, className = "" }: { role: string; className?: string }) {
  const normalized = role.toLowerCase();
  const asset = normalized.includes("design")
    ? "/community/designer.svg"
    : normalized.includes("teach") || normalized.includes("learn")
      ? "/community/teacher.svg"
      : normalized.includes("freelance") || normalized.includes("marketing")
        ? "/community/freelancer.svg"
        : "/community/developer.svg";

  return <img src={asset} alt={`${role} role icon`} aria-label={`${role} role icon`} className={classNames("object-contain", className)} loading="lazy" decoding="async" />;
}

export function StickerPicker({
  onSelect,
  onClose,
}: {
  onSelect: (sticker: PremiumSticker) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return PREMIUM_STICKERS;
    return PREMIUM_STICKERS.filter((sticker) => `${sticker.label} ${sticker.prompt}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 5 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="w-[min(420px,calc(100vw-2rem))] rounded-[26px] border border-white/70 bg-white/95 p-3 shadow-2xl shadow-indigo-950/15 backdrop-blur-xl"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Premium sticker picker"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">Premium stickers</p>
          <p className="text-xs text-[#6B7280]">Figma-sourced sticker replies and workspace packs</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-[#F7FAFC] px-2 py-1 text-[10px] font-bold text-[#6B7280] hover:text-[#111827]" aria-label="Close sticker picker">
          Esc
        </button>
      </div>
      <div className="mb-3 flex h-10 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] px-3 focus-within:border-indigo-300 focus-within:bg-white">
        <Search className="h-4 w-4 text-[#6B7280]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stickers" className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#6B7280]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <AnimatePresence initial={false}>
          {filtered.map((sticker) => (
            <motion.button
              key={sticker.id}
              layout
              type="button"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(sticker)}
              className="group rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-2 text-left transition-colors hover:border-indigo-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
              aria-label={`Use ${sticker.label} sticker`}
            >
              <img src={sticker.src} alt={`${sticker.label} sticker`} className="mx-auto h-20 w-20 object-contain transition-transform group-hover:scale-105" loading="lazy" decoding="async" />
              <span className="mt-1 flex items-center justify-center gap-1 truncate text-center text-xs font-bold text-[#111827]">
                {sticker.label}
                <Star className="h-3 w-3 text-amber-400" aria-hidden="true" />
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <WorkspaceEmojiPack />
    </motion.div>
  );
}
