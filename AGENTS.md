# Repository Guidelines

Astro 6 SSR starter with React 19 islands, Tailwind 4, Supabase cookie auth, and Cloudflare Workers deployment. Full conventions live in @CLAUDE.md; this file is the agent onboarding distillation.

## Hard Rules

- Full SSR (`output: "server"` in @astro.config.mjs). API routes under `src/pages/api/` must export `const prerender = false`.
- Never commit secrets. Use `.env` (Node) and `.dev.vars` (Cloudflare local); copy from @.env.example. `SUPABASE_URL` and `SUPABASE_KEY` are server-only via `astro:env` in @astro.config.mjs.
- Protected routes: add paths to `PROTECTED_ROUTES` in @src/middleware.ts`; unauthenticated users redirect to `/auth/signin`.
- React components: no Next.js directives (`"use client"`). Put hooks in `src/components/hooks/`.
- Tailwind: merge classes with `cn()` from @src/lib/utils.ts, not string concatenation.
- New Supabase tables: migrations in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql` with RLS and per-operation policies.

## Project Structure

- `src/pages/` — Astro pages and `api/` endpoints (auth: `src/pages/api/auth/`, UI: `src/pages/auth/`).
- `src/components/` — Astro for static; React only when interactive. shadcn/ui in `src/components/ui/` (`npx shadcn@latest add [name]`).
- `src/lib/` — helpers and services; shared types in `src/types.ts`.
- `public/` — static assets. Deploy config: @wrangler.jsonc.

Path alias `@/*` → `./src/*` per @tsconfig.json.

## Build, Test, and Development

Run on Node.js v22.14.0 (@.nvmrc):

- `npm run dev` — dev server (Cloudflare workerd runtime)
- `npm run build` — production SSR build
- `npm run preview` — preview production build
- `npm run lint` / `npm run lint:fix` — ESLint (type-checked; @eslint.config.js)
- `npm run format` — Prettier (Astro + Tailwind plugins)

Local Supabase: `npx supabase start` (Docker). Deploy: `npx wrangler deploy`.

No automated test runner is configured; verify with lint, build, and manual checks.

## Coding Style

- API routes: uppercase `GET`/`POST` exports; validate request bodies with zod.
- Astro for layouts and static content; React for interactivity only.
- ESLint enforces strict TypeScript, React Compiler, Astro a11y rules, and Prettier. Husky pre-commit runs lint-staged (`eslint --fix` on `*.{ts,tsx,astro}`, Prettier on `*.{json,css,md}`).

## Pull Requests

CI (@.github/workflows/ci.yml) on push/PR to `master`: `npm ci`, `npx astro sync`, `npm run lint`, `npm run build` (needs `SUPABASE_URL` and `SUPABASE_KEY` repo secrets). Run `npm run lint` and `npm run build` locally before opening a PR.
