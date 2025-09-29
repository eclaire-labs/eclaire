import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "development",
    },
    setupFiles: ["./src/lib/env-loader.ts"],
  },
});
