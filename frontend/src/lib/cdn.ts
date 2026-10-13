import { envUrl } from "./env-url";

/**
 * Optima's media CDN (nginx on the API host caches these for 30 days): book
 * covers from Open Library and Project Gutenberg are slow and Open Library
 * bounces every cover through two redirects, so they are served from there.
 * Only when the API is a real https origin — local dev keeps the originals.
 */
const apiOrigin = (() => {
  for (const url of [envUrl(import.meta.env.VITE_API_URL), envUrl(import.meta.env.VITE_SERVER_URL)]) {
    if (!url || !/^https:\/\//i.test(url)) continue;
    try { return new URL(url).origin; } catch { /* try the next one */ }
  }
  return null;
})();

export function cdnImage(url: string | null | undefined): string {
  if (!url) return "";
  if (!apiOrigin) return url;
  const match = /^https?:\/\/(covers\.openlibrary\.org|www\.gutenberg\.org)\/(.+)$/i.exec(url);
  if (!match) return url;
  return `${apiOrigin}/cdn/${match[1].toLowerCase().startsWith("covers") ? "ol" : "pg"}/${match[2]}`;
}

/** The separate admin site, on the API host (nginx serves it at /admin/). */
export function adminSiteUrl(): string {
  return apiOrigin ? `${apiOrigin}/admin/` : "/admin";
}
