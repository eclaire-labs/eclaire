import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    env: {
      NODE_ENV: "test",
    },
    setupFiles: ["./src/lib/env-loader.ts"],
    include: ["src/tests/integration/**/*.test.ts"],
  },
});
