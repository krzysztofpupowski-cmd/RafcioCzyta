# Repository Guidelines

Astro 6 SSR starter with React 19 islands, Tailwind 4, Supabase cookie auth, and Cloudflare Workers deployment. Full conventions live in @CLAUDE.md; this file is the agent onboarding distillation.

## Hard Rules

- Full SSR (`output: "server"` in @astro.config.mjs). API routes under `src/pages/api/` must export `const prerender = false`.
- Never commit secrets. Use `.env` (Node) and `.dev.vars` (Cloudflare local); copy from @.env.example. `SUPABASE_URL` and `SUPABASE_KEY` are server-only via `astro:env` in @astro.config.mjs.
- Protected routes: add paths to `PROTECTED_ROUTES` in @src/middleware.ts`; unauthenticated users redirect to `/auth/signin`.
- React components: no Next.js directives (`"use client"`). Put hooks in `src/components/hooks/`.
- Tailwind: merge classes with `cn()` from @src/lib/utils.ts, not string concatenation.
- New Supabase tables: migrations in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql` with RLS and per-operation policies.
- **Do not run Docker / Supabase CLI commands through the agent shell** on Windows. `npx supabase db reset|start|stop`, `npm run dev`, `npx wrangler dev`, and other long-running or interactive commands wedge the PowerShell + conpty bridge and require a session restart. Ask the user to run them in their own terminal and paste output back. Agent-friendly: `npm run lint`, `npm run build`, `npx astro sync`, `git`, file edits.

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
- `npm test` / `npm run test:watch` — Vitest (`tests/**/*.test.ts`). Integration suites need `.env.test` copied from @.env.test.example against a **dedicated hosted Supabase test project** (not production). Missing vars fail fast via `requireTestEnv()` in @tests/helpers/env.ts.

Local Supabase: `npx supabase start` (Docker). Deploy: `npx wrangler deploy`.

## Coding Style

- API routes: uppercase `GET`/`POST` exports; validate request bodies with zod.
- Astro for layouts and static content; React for interactivity only.
- ESLint enforces strict TypeScript, React Compiler, Astro a11y rules, and Prettier. Husky pre-commit runs lint-staged (`eslint --fix` on `*.{ts,tsx,astro}`, Prettier on `*.{json,css,md}`).
- **`src/db/database.types.ts` is excluded from ESLint's type resolution** (`eslint.config.js` line 73: `{ ignores: ["src/db/database.types.ts"] }`). Every type derived from `Database` — i.e. all exports from `src/types.ts` (`Child`, `Flashcard`, `ReadingLevel`, etc.) — is treated as an error type by `@typescript-eslint`, causing `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-return`, and `no-redundant-type-constituents` errors. **Pattern**: service modules (`src/lib/services/`) use a file-wide `/* eslint-disable */` block (see `src/lib/services/children.ts` as the canonical template). Astro pages and React components that receive these types use `// eslint-disable-next-line` inline comments on the specific problem lines. Do NOT remove the ignore entry — `database.types.ts` is auto-generated and must stay out of the type-checked graph.

## Pull Requests

CI (@.github/workflows/ci.yml) on push/PR to `main`: `npm ci`, `npx astro sync`, `npm run lint`, `npm run build` (needs `SUPABASE_URL` and `SUPABASE_KEY` repo secrets), then `npm test` against the hosted Supabase test project (needs `TEST_*` repo secrets — see `tests/fixtures/README.md`). Deploy job on push to `main` / `workflow_dispatch` needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and only runs after both `ci` and `test` pass.

Run `npm run lint`, `npm run build`, and `npm test` locally before opening a PR. Integration tests require `.env.test` configured against a dedicated hosted Supabase test project — missing vars fail fast via `requireTestEnv()` in @tests/helpers/env.ts.

A husky `pre-push` hook runs `npm test` automatically on every `git push`; bypass with `git push --no-verify` for WIP pushes you don't intend to PR yet.
