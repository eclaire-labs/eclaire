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
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-typecheck/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
    ],
  },
});
