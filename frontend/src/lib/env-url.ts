/**
 * An env URL as the browser should use it. "api.example.com/api/v1" (no
 * scheme) would otherwise be read as a path on the current site —
 * https://app.example.com/api.example.com/api/v1 — so a bare host gets
 * https://. Paths ("/api/v1") and full URLs pass through unchanged.
 */
export function envUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}
