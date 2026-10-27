const DEMO_KEY = "optima-public-demo";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  const requested = new URLSearchParams(window.location.search).get("demo");
  if (requested !== null) return requested === "1";
  try { return sessionStorage.getItem(DEMO_KEY) === "1"; } catch { return false; }
}

export function initializeDemo() {
  const requested = new URLSearchParams(window.location.search).get("demo");
  if (requested !== null) {
    try {
      if (requested === "1") sessionStorage.setItem(DEMO_KEY, "1");
      else sessionStorage.removeItem(DEMO_KEY);
    } catch { /* The initial demo URL still works without storage. */ }
  }
}

export function assertDemoRequest(path: string, method = "GET") {
  const read = ["GET", "HEAD"].includes(method.toUpperCase());
  const setup = /^\/groups\/[^/]+\/select$/.test(path);
  if (!read && !setup) throw new Error("Bu amal demo rejimida yopiq. Davom etish uchun hisobingizga kiring.");
}
