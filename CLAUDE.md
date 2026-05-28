# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Agent shell

**Recommended shell: Git Bash.** Cursor is configured to use Git Bash as the default terminal on Windows (`terminal.integrated.defaultProfile.windows: "Git Bash"` in Cursor user settings). Git Bash supports bash heredocs (`<<'EOF'`), does not suffer from the PowerShell + conpty bridge wedging issue, and lets the agent run `npm run lint`, `npm run build`, `git`, and short scripts without manual intervention.

**If the shell is PowerShell** (e.g. in a session started before the setting took effect): `<<'EOF'` heredocs are not supported. Use a PowerShell here-string written to a temp file for multi-line git commits:
```powershell
$msg = @"
<subject>

<body>
"@
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, $msg, [System.Text.Encoding]::UTF8)
git commit -F $tmp; Remove-Item $tmp
```

**Do not run Docker / Supabase CLI commands through the agent shell.** `npx supabase db reset|start|stop`, `npm run dev`, `npx wrangler dev`, and other long-running or interactive commands can wedge the terminal bridge — once wedged, every subsequent command returns "no exit status" and only restarting the chat session frees it.

Protocol:

- The agent must ask the user to run Docker- or daemon-touching Supabase/Wrangler commands in their own terminal, then paste back the relevant output.
- Agent-friendly commands (safe to invoke directly): `npm run lint`, `npm run build`, `npx astro sync`, `git`, file edits, short scripts.
- If a Supabase migration was just edited and needs re-applying, ask the user to run `npx supabase db reset --local` manually before continuing review or implementation steps.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.
