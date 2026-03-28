import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/integration/**/*.test.ts"],
    exclude: ["**/dist/**"],
    globals: false,
    environment: "node",
    testTimeout: 30000,
  },
});
