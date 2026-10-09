import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend the dev server proxies to. Defaults to the shared API; point it at a
// local backend with e.g. `API_PROXY_TARGET=http://localhost:8080 npm run dev`.
const apiTarget = process.env.API_PROXY_TARGET || "https://api.honeymedia.uz";
const apiSecure = apiTarget.startsWith("https://");

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT || 5173),
    strictPort: true,
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
