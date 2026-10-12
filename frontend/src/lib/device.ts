/**
 * This browser install's own id: made once, kept in localStorage, sent as
 * X-Device-Id so the server counts one session per device (logging in again
 * here replaces the old session rather than adding "another device").
 * Not a hardware id — a new browser or cleared site data makes a new one.
 */
const KEY = "optima-device-id";
let cached: string | null = null;

export function deviceId(): string {
  if (cached) return cached;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return (cached = saved);
  } catch { /* storage off */ }
  const made = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try { localStorage.setItem(KEY, made); } catch { /* storage off: this tab keeps it */ }
  return (cached = made);
}
