import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT || 5173),
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "https://api.honeymedia.uz",
        changeOrigin: true,
        secure: true,
      },
      "/socket.io": {
        target: "https://api.honeymedia.uz",
        changeOrigin: true,
        secure: true,
        ws: true,
      },
      "/uploads": {
        target: "https://api.honeymedia.uz",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    port: 5173,
  },
});
