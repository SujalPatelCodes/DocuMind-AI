import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Local SQLite-backed REST API (see server/apiPlugin.mjs). Mounted at /api by
// Vite itself, so `npm run dev` and `npm run preview` both persist data with no
// extra process and no CORS.
import { apiPlugin } from "./server/apiPlugin.mjs";

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Route /ollama/* to the local Ollama server so the browser never has to
    // deal with CORS during development. Production builds call Ollama
    // directly (see src/llm.ts) — start it with OLLAMA_ORIGINS="*" there.
    proxy: {
      "/ollama": {
        target: "http://localhost:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
});