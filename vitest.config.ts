import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", ".astro/**", "node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    // Integration tests hit a shared hosted Supabase as a single Parent A fixture.
    // Running files in parallel causes cross-file count/state interference and DB
    // contention (e.g. flashcards-generate vs flashcards-state-machine both writing
    // flashcard_generations rows for Parent A at the same time).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "astro:env/server": path.resolve(import.meta.dirname, "./tests/stubs/astro-env-server.ts"),
      "astro:middleware": path.resolve(import.meta.dirname, "./tests/stubs/astro-middleware.ts"),
    },
  },
});
