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
  return `/telegram-emojis/${id}.png`;
}

export function fallbackEmojiImage(image: HTMLImageElement, id: string) {
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = localEmojiAssetUrl(id);
}

export async function fetchEmojiManifest<T>() {
  try {
    const cdnResponse = await fetch(`${EMOJI_CDN_BASE}/manifest.json`, { cache: "force-cache" });
    if (cdnResponse.ok) return cdnResponse.json() as Promise<T>;
  } catch {
    // The local catalog keeps chat usable during a temporary CDN outage.
  }

  const localResponse = await fetch("/telegram-emojis/manifest.json?v=2", { cache: "no-store" });
  if (!localResponse.ok) throw new Error("Emoji manifest unavailable");
  return localResponse.json() as Promise<T>;
}

export async function fetchAnimatedEmojiManifest<T>() {
  const response = await fetch(`${ANIMATED_EMOJI_CDN_BASE}/manifest.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error("Animated emoji manifest unavailable");
  return response.json() as Promise<T>;
}
