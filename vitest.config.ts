import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", ".astro/**", "node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "astro:env/server": path.resolve(import.meta.dirname, "./tests/stubs/astro-env-server.ts"),
      "astro:middleware": path.resolve(import.meta.dirname, "./tests/stubs/astro-middleware.ts"),
    },
  },
});
