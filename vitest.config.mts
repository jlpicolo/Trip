import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    include: ["tests/unit/**/*.test.ts"],
  },
});
