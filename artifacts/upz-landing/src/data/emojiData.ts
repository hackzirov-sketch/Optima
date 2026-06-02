import { type GeneratedEmoji, GENERATED_EMOJI_CATEGORY_LOADERS } from "./emojis.generated";

export type { GeneratedEmoji };

export type GeneratedEmojiPayload = {
  meta: Record<string, unknown>;
  emojis: GeneratedEmoji[];
};

let payloadCache: Promise<GeneratedEmojiPayload> | undefined;
let byIdCache: Map<string, GeneratedEmoji> | undefined;

export async function loadGeneratedEmojis() {
  payloadCache ??= import("./emojis.generated.json").then((module) => module.default as GeneratedEmojiPayload);
  return payloadCache;
}

export function loadEmojiCategory(category: string): Promise<GeneratedEmoji[]> {
  const loader = GENERATED_EMOJI_CATEGORY_LOADERS[category];
  if (!loader) return Promise.reject(new Error(`Unknown category: ${category}`));
  return loader().then((m) => m.default);
}

export async function loadGeneratedEmojiById(id: string) {
  if (!byIdCache) {
    const all = Object.values(GENERATED_EMOJI_CATEGORY_LOADERS);
    const results = await Promise.all(all.map((loader) => loader().then((m) => m.default)));
    byIdCache = new Map(results.flat().map((emoji) => [emoji.id, emoji]));
  }
  return byIdCache.get(id);
}
