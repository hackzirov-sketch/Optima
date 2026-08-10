export const EMOJI_CDN_BASE =
  "https://sfedvjmtlqdliapoapca.supabase.co/storage/v1/object/public/optima-emojis/v1";

export function emojiAssetUrl(id: string) {
  return `${EMOJI_CDN_BASE}/${id}.png`;
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
