import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev sunucusu /api isteklerini Fastify'a vekiller.
 *
 * Boylece arayuz her yerde GORELI yol kullanir (fetch("/api/...")) — build
 * alindiginda API ile ayni kokten servis edilecegi icin URL'lerin degismesi
 * gerekmez ve tarayicida CORS/preflight yasanmaz. SSE icin tamponlama kapali.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
