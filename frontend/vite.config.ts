/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the API is reached through this dev server (same origin as the page), so the HttpOnly session
// cookie is first-party. Production does the same with the rewrites in vercel.json.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const backend = env.DEV_BACKEND_URL || "http://127.0.0.1:8000";
  return {
    plugins: [react(), tailwindcss()],
    test: { env: { VITE_ACCOUNTS_ENABLED: "true" } },  // the suite exercises the full account feature
    server: { port: 5173, host: "127.0.0.1", proxy: { "/api": backend, "/health": backend } },
  };
});
