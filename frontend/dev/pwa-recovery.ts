import type { Plugin } from "vite";

export const DEV_PWA_RECOVERY_PATH = "/@optima/dev-pwa-recovery";
export const LEGACY_PWA_ENTRY_PATH = "/@vite-plugin-pwa/pwa-entry-point-loaded";

// Old Vite PWA HTML can survive a dev-server restart on the same origin.
// Retire only that plugin's development worker, not production/custom workers.
export const DEV_PWA_RECOVERY_SCRIPT = String.raw`
async function recoverLegacyDevPwa() {
  if (!("serviceWorker" in navigator)) return;
  const isLegacy = (worker) => {
    if (!worker) return false;
    const url = new URL(worker.scriptURL, location.href);
    return url.origin === location.origin && url.pathname === "/dev-sw.js";
  };
  const controlled = isLegacy(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  const legacy = registrations.filter((registration) =>
    isLegacy(registration.active) || isLegacy(registration.waiting) || isLegacy(registration.installing));
  const results = await Promise.all(legacy.map(async (registration) => {
    const removed = await registration.unregister();
    if (removed && "caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) =>
        name.startsWith("workbox-precache-") && name.endsWith(registration.scope))
        .map((name) => caches.delete(name)));
    }
    return removed;
  }));
  const marker = "optima:legacy-dev-pwa-reloaded";
  if (!controlled) {
    try { sessionStorage.removeItem(marker); } catch {}
    return;
  }
  if (!results.some(Boolean)) return;
  try {
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, "1");
  } catch { return; }
  location.reload();
}
recoverLegacyDevPwa().catch((error) => console.warn("Legacy dev worker cleanup failed", error));
`;

const RETIRE_DEV_WORKER = String.raw`
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.registration.unregister().then(() => self.clients.matchAll()).then((clients) =>
    Promise.all(clients.map((client) => client.navigate(client.url)))));
});
`;

export function legacyPwaResponse(path: string): string | undefined {
  if (path === DEV_PWA_RECOVERY_PATH || path === LEGACY_PWA_ENTRY_PATH) {
    return `${DEV_PWA_RECOVERY_SCRIPT}\nexport default recoverLegacyDevPwa;`;
  }
  if (path === "/dev-sw.js") return RETIRE_DEV_WORKER;
}

export function devPwaRecovery(): Plugin {
  return {
    name: "optima-dev-pwa-recovery",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const path = new URL(req.url || "/", "http://localhost").pathname;
        const source = legacyPwaResponse(path);
        if (source === undefined) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(req.method === "HEAD" ? undefined : source);
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler: () => [{ tag: "script", attrs: { type: "module", src: DEV_PWA_RECOVERY_PATH }, injectTo: "head-prepend" }],
    },
  };
}
