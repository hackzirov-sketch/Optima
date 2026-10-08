export const EMOJI_CDN_BASE =
  "https://sfedvjmtlqdliapoapca.supabase.co/storage/v1/object/public/optima-emojis/v1";
export const ANIMATED_EMOJI_CDN_BASE =
  "https://sfedvjmtlqdliapoapca.supabase.co/storage/v1/object/public/optima-emojis/animated/v1";

export type EmojiAsset = {
  id: string;
  src: string;
  previewSrc: string;
  pack: number;
  packName: string;
  format: "png" | "lottie" | "webp";
};

export const CUSTOM_EMOJI_ID_PATTERN = /^(?:p[1-4]|[aw]\d{3})-\d{4}$/;
export const CUSTOM_EMOJI_TOKEN_PATTERN = /\[\[optima-emoji:((?:p[1-4]|[aw]\d{3})-\d{4})]]/g;

export function emojiAssetUrl(id: string) {
  if (id.startsWith("a")) return `${ANIMATED_EMOJI_CDN_BASE}/${id}.lottie`;
  if (id.startsWith("w")) return `${ANIMATED_EMOJI_CDN_BASE}/${id}.webp`;
  return `${EMOJI_CDN_BASE}/${id}.png`;
}

export function emojiPreviewUrl(id: string) {
  if (id.startsWith("a") || id.startsWith("w")) {
    return `${ANIMATED_EMOJI_CDN_BASE}/previews/${id}.${id.startsWith("w") ? "webp" : "png"}`;
  }
  return emojiAssetUrl(id);
}

export function localEmojiAssetUrl(id: string) {
  if (id.startsWith("a")) return `/telegram-emojis/animated/${id}.lottie`;
  if (id.startsWith("w")) return `/telegram-emojis/animated/${id}.webp`;
  return `/telegram-emojis/${id}.png`;
}

export function localEmojiPreviewUrl(id: string) {
  if (id.startsWith("a") || id.startsWith("w")) {
    return `/telegram-emojis/animated/previews/${id}.${id.startsWith("w") ? "webp" : "png"}`;
  }
  return localEmojiAssetUrl(id);
}

export function emojiImageSources(id: string, preview = true): string[] {
  // Static packs ship with the app. Remote-only packs retain their CDN URL.
  const local = preview ? localEmojiPreviewUrl(id) : localEmojiAssetUrl(id);
  const remote = preview ? emojiPreviewUrl(id) : emojiAssetUrl(id);
  return id.startsWith("p") ? [local, remote] : [remote, local];
}

export function fallbackEmojiImage(image: HTMLImageElement, id: string) {
  const sources = emojiImageSources(id);
  const next = Number(image.dataset.sourceIndex || 0) + 1;
  image.dataset.sourceIndex = String(next);
  if (next < sources.length) image.src = sources[next];
  else {
    image.removeAttribute("src");
    image.alt = "[emoji]";
    image.title = "Emoji yuklanmadi";
  }
}

async function fetchManifest<T>(urls: string[]): Promise<T> {
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) continue;
      const value: unknown = await response.json();
      if (Array.isArray(value) && value.length) return value as T;
    } catch {
      // A missing host, stale HTML response, or timeout must not empty the picker.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Emoji manifest unavailable");
}

export function fetchEmojiManifest<T>() {
  return fetchManifest<T>(["/telegram-emojis/manifest.json?v=3", `${EMOJI_CDN_BASE}/manifest.json`]);
}

export function fetchAnimatedEmojiManifest<T>() {
  return fetchManifest<T>([`${ANIMATED_EMOJI_CDN_BASE}/manifest.json`, "/telegram-emojis/animated/manifest.json"]);
}
