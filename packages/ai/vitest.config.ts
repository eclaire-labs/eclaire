import { defineConfig } from "vitest/config";

// Check if running integration tests
const isIntegration = !!process.env.AI_TEST_PROVIDER;

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Separate unit tests from integration tests based on environment
    include: isIntegration
      ? ["src/tests/integration/**/*.test.ts"]
      : ["src/tests/**/*.test.ts"],
    exclude: isIntegration
      ? []
      : ["src/tests/integration/**"],
    setupFiles: ["src/tests/setup.ts"],
    // Integration tests need longer timeout for real API calls (local models can be slow)
    testTimeout: isIntegration ? 120000 : 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/tests/**", "src/**/*.d.ts"],
    },
  },
});
