import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "src/**/tests/**/*.test.ts",
      "src/**/tests/**/*.test.tsx",
      "src/tests/**/*.test.ts",
      "src/tests/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
