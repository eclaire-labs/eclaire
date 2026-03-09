import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

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
    exclude: [
      ...configDefaults.exclude,
      "src/tests/integration/**",
    ],
  },
});
