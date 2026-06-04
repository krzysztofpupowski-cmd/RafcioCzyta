// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

/**
 * Pre-bundle island deps for workerd SSR in one pass (Astro 6 + Cloudflare).
 * Lazy discovery reloads the worker and splits React across deps_ssr chunks.
 */
const SERVER_OPTIMIZE_DEPS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react-dom/server.edge",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "lucide-react",
  "@radix-ui/react-slot",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "zod",
];

function optimizeServerDeps() {
  return {
    name: "optimize-server-deps",
    /** @param {string} name */
    configEnvironment(name) {
      if (name !== "client") {
        return { optimizeDeps: { include: SERVER_OPTIMIZE_DEPS } };
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss(), optimizeServerDeps()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "react-dom/server": "react-dom/server.edge",
      },
    },
    optimizeDeps: {
      include: SERVER_OPTIMIZE_DEPS,
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
