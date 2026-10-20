import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", "localhost"],
    proxy: { "/api": { target: "http://127.0.0.1:8765", ws: true } },
  },
  build: { chunkSizeWarningLimit: 1000 },
});
