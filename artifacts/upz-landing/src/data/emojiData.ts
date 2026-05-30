export type GeneratedEmoji = {
  id: string;
  name: string;
  type: "static" | "animated";
  category: string;
  previewSrc: string;
  animationSrc?: string;
  keywords: string[];
  part?: string;
  bytes: number;
};

export type GeneratedEmojiPayload = {
  meta: {
    generatedAt: string;
    count: number;
    totalBytes: number;
    totalAnimated: number;
    totalStatic: number;
  };
  emojis: GeneratedEmoji[];
};

let payloadCache: Promise<GeneratedEmojiPayload> | undefined;
let byIdCache: Map<string, GeneratedEmoji> | undefined;

export async function loadGeneratedEmojis() {
  payloadCache ??= import("./emojis.generated.json").then((module) => module.default as GeneratedEmojiPayload);
  return payloadCache;
}

export async function loadGeneratedEmojiById(id: string) {
  if (!byIdCache) {
    const payload = await loadGeneratedEmojis();
    byIdCache = new Map(payload.emojis.map((emoji) => [emoji.id, emoji]));
  }
  return byIdCache.get(id);
}
