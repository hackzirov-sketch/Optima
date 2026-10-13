import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The separate Optima admin site, served by nginx at https://api.honeymedia.uz/admin/
// (same host as the API, so the signed-in admin's cookie comes along).
// Build: npx vite build --config vite.admin.config.ts  →  dist-admin/
const apiTarget = process.env.API_PROXY_TARGET || "https://api.honeymedia.uz";
export default defineConfig({
  root: "admin",
  base: "/admin/",
  plugins: [react()],
  build: { outDir: "../dist-admin", emptyOutDir: true },
  server: {
    port: 5174,
    proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: apiTarget.startsWith("https://") } },
  },
});
