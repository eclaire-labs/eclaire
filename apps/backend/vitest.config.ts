import { defineConfig } from "vitest/config";
import path from "node:path";

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
    // Default: exclude integration tests (they require a running server)
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-typecheck/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "src/tests/integration/**", // Integration tests require running server
    ],
  },
});
