import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const bridgePort = Number(env.CATCHUP_BRIDGE_PORT || 4318);
  return ({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${bridgePort}`,
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/.pnpm-store/**"],
    maxWorkers: 1,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/test/**"],
    },
  },
  });
});
