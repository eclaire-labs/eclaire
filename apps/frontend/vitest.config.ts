import react from "@vitejs/plugin-react"; // Ensure you have @vitejs/plugin-react installed
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // Use Vitest global APIs (describe, it, expect, etc.)
    environment: "node", // Use Node.js environment for API tests
    // You might want to add setup files here if needed, e.g., for global mocks or environment variables
    // setupFiles: './src/tests/setup.ts',
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
      "src/tests/**/*.test.ts",
      "src/tests/**/*.test.tsx",
    ],
  },
  // Optional: Alias configuration to match tsconfig.json for imports like @/lib/...
  resolve: {
    alias: {
      "@": "/src", // Adjust path based on your project structure if needed
    },
  },
});
