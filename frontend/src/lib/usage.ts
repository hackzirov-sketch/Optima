export type UsageService = "meetings" | "chat" | "library" | "education";
export type UsageDay = { date: string; service: UsageService; seconds: number; visits: number };
export function usageKey(userId: string) { return `optima-usage-v1:${userId}`; }
export function readUsage(userId: string): UsageDay[] {
  try { const data = JSON.parse(localStorage.getItem(usageKey(userId)) || "[]"); return Array.isArray(data) ? data.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && ["meetings", "chat", "library", "education"].includes(row.service) && Number.isFinite(row.seconds) && Number.isFinite(row.visits)) : []; } catch { return []; }
}
export function recordUsage(userId: string, service: UsageService, seconds: number, visits = 0) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = readUsage(userId);
  let row = rows.find(item => item.date === date && item.service === service);
  if (!row) { row = { date, service, seconds: 0, visits: 0 }; rows.push(row); }
  row.seconds += Math.max(0, Math.round(seconds)); row.visits += visits;
  try { localStorage.setItem(usageKey(userId), JSON.stringify(rows)); window.dispatchEvent(new Event("optima-usage-update")); } catch { /* Statistics must never interrupt navigation. */ }
}
