import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { devPwaRecovery } from "./dev/pwa-recovery";

// Backend the dev server proxies to. Defaults to the shared API; point it at a
// local backend with e.g. `API_PROXY_TARGET=http://localhost:8080 npm run dev`.
const apiTarget = process.env.API_PROXY_TARGET || "https://api.honeymedia.uz";
const apiSecure = apiTarget.startsWith("https://");

// Set by scripts/dev-lan.mjs (`npm run dev:lan`): HTTPS so the camera,
// microphone and WebCrypto also work when the app is opened from another device.
const https =
  process.env.DEV_HTTPS_KEY && process.env.DEV_HTTPS_CERT
    ? { key: readFileSync(process.env.DEV_HTTPS_KEY), cert: readFileSync(process.env.DEV_HTTPS_CERT) }
    : undefined;

export default defineConfig({
  plugins: [devPwaRecovery(), react()],
  server: {
    port: Number(process.env.PORT || 5173),
    strictPort: true,
    https,
    // Behind an HTTPS tunnel (cloudflared) the browser reaches the dev server
    // on 443, not on `port` — the HMR socket has to be told, or it dials a
    // port the tunnel doesn't expose. DEV_HMR_CLIENT_PORT=443 npm run dev
    hmr: process.env.DEV_HMR_CLIENT_PORT ? { clientPort: Number(process.env.DEV_HMR_CLIENT_PORT) } : undefined,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiSecure,
      },
      "/socket.io": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiSecure,
        ws: true,
      },
      "/uploads": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiSecure,
      },
    },
  },
  preview: {
    port: 5173,
  },
});
