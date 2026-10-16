import { createServer } from "node:http";

const target = new URL(process.argv[2] || "http://127.0.0.1:5176");
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Local frontend required");
let repair = false;
const staleHtml = `<!doctype html><h1>Old cached PWA page</h1><script type="module">import recover from '/@vite-plugin-pwa/pwa-entry-point-loaded';recover();</script>`;
const worker = `
const key = 'workbox-precache-v2-' + self.location.origin + '/';
self.addEventListener('install', event => event.waitUntil(caches.open(key)
  .then(cache => cache.put('/g/123456', new Response(${JSON.stringify(staleHtml)}, { headers: { 'Content-Type': 'text/html' } })))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(caches.match('/g/123456'));
});`;

// Disposable origin: never register this intentionally broken worker on the app.
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const path = new URL(req.url || "/", "http://localhost").pathname;
  if (path === "/__repair" && req.method === "POST") {
    repair = true;
    res.end("OK");
    return;
  }
  if (path === "/dev-sw.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(worker);
    return;
  }
  if (path === "/@vite-plugin-pwa/pwa-entry-point-loaded" && repair) {
    try {
      const upstream = await fetch(new URL(path, target));
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain");
      res.end(await upstream.text());
    } catch {
      res.statusCode = 502;
      res.end("Local frontend unavailable");
    }
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(path === "/seed" ? "<h1>Seed</h1>" : repair ? "<h1>Fresh page after recovery</h1>" : "<h1>SPA fallback</h1>");
});
server.listen(0, "127.0.0.1", () => console.log(`Fixture: http://127.0.0.1:${server.address().port}`));
process.on("SIGINT", () => server.close(() => process.exit(0)));
