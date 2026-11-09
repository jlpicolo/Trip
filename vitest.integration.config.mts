import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv(mode, process.cwd(), ""),
    testTimeout: 30_000,
    fileParallelism: false,
  },
}));
