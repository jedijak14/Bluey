import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Shared server-only adapter: never imported into browser bundles.
// @ts-expect-error JavaScript server module intentionally has no client declaration.
import { gemmaProxy } from "./server/gemmaProxy.mjs";
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env,
    NODE_ENV: "development",
  };
  const middleware = (server: {
    middlewares: { use: (fn: (...args: any[]) => void) => void };
  }) => {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split("?")[0].startsWith("/api/gemma/"))
        void gemmaProxy(req, res, env);
      else next();
    });
  };
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "gemma-gateway",
        configureServer: middleware,
        configurePreviewServer: middleware,
      },
    ],
    base: "./",
    server: {
      host: "0.0.0.0",
      allowedHosts: [".e2b.app", "localhost"],
      proxy: {
        "^/api/(?!gemma/)": { target: "http://127.0.0.1:8765", ws: true },
      },
    },
    build: { chunkSizeWarningLimit: 1000 },
  };
});
