import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    exclude: [
      "**/dist/**",
      "src/tests/driver-bullmq/**", // BullMQ tests require Redis
    ],
    testTimeout: 30000,
    hookTimeout: 10000,
    globals: false,
    environment: "node",
  },
});
