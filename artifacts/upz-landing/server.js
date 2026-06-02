import express from "express";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT ?? "5173");
const basePath = (process.env.BASE_PATH ?? "/").replace(/\/+$/, "") || "/";
const host = process.env.HOST ?? "0.0.0.0";
const mount = basePath === "/" ? "" : basePath;

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`[optima] dist/index.html not found at ${distDir}. Build first.`);
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

// Long-lived cache for hashed assets
app.use(
  `${mount}/assets`,
  express.static(path.join(distDir, "assets"), {
    immutable: true,
    maxAge: 31_536_000,
    setHeaders: (res) => res.setHeader("Cache-Control", "public, max-age=31536000, immutable"),
  }),
);

// Emoji assets — served from public/ (cleaned from dist/ for deploy size)
if (fs.existsSync(publicDir)) {
  app.use(
    mount || "/",
    express.static(publicDir, {
      index: false,
      maxAge: 3600,
      setHeaders: (res) => res.setHeader("Cache-Control", "public, max-age=3600"),
    }),
  );
}

// Other static files
app.use(
  mount || "/",
  express.static(distDir, {
    index: false,
    maxAge: 3600,
    setHeaders: (res) => res.setHeader("Cache-Control", "public, max-age=3600"),
  }),
);

// SPA fallback — serve index.html for any unmatched GET route
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (path.extname(req.path)) return res.status(404).end();
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(distDir, "index.html"));
});

const server = app.listen(port, host, () => {
  const display = basePath === "/" ? "" : basePath;
  console.log(`[optima] Listening on http://${host}:${port}${display}`);
});

const shutdown = (signal) => {
  console.log(`[optima] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
