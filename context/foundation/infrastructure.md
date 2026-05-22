---
project: rafcio-czyta
researched_at: 2026-05-22
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

This repository is already configured for Cloudflare: `@astrojs/cloudflare` v13.5, `output: "server"`, `wrangler` v4.90, and a Workers entrypoint in `wrangler.jsonc`. Your interview answers (stateless SSR, Cloudflare familiarity, single-region users, undecided data layer) align with staying on the starter path rather than swapping adapters. Cloudflare scored 5/5 on agent-friendly criteria (CLI, managed runtime, `llms-full.txt` docs, deterministic deploy, official MCP servers). At MVP scale (10k–100k requests/month), the Workers Free tier (100k requests/day) likely covers traffic; paid usage starts at $5/month minimum if limits are exceeded. Supabase remains the external auth/database layer until you explicitly choose co-located storage.

## Platform Comparison

| Platform               | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total   |
| ---------------------- | --------- | ------------------ | ------------------- | ----------------- | ----------------- | ------- |
| **Cloudflare Workers** | Pass      | Pass               | Pass                | Pass              | Pass              | **5/5** |
| Netlify                | Pass      | Pass               | Partial             | Pass              | Pass              | 4.5/5   |
| Vercel                 | Pass      | Pass               | Pass                | Pass              | Partial (beta)    | 4.5/5   |
| Fly.io                 | Pass      | Pass               | Pass                | Pass              | Partial           | 4.5/5   |
| Railway                | Pass      | Pass               | Partial             | Pass              | Fail              | 4/5     |
| Render                 | Partial   | Pass               | Partial             | Pass              | Fail              | 3.5/5   |

**Cloudflare** — First-class Astro 6 support via `@astrojs/cloudflare` v13+; `npm run dev` runs on workerd locally; `wrangler deploy` is the production path. Official MCP at `https://mcp.cloudflare.com/mcp` plus domain servers (`docs.mcp.cloudflare.com`, `builds.mcp.cloudflare.com`). Free tier generous for low-traffic MVP; Paid plan $5/month floor. Note: adapter v13+ deploys to **Workers only** (Cloudflare Pages deployment removed from the adapter).

**Netlify** — Strong `@astrojs/netlify` adapter and official Netlify MCP (`@netlify/mcp`). Would require adapter swap, new `wrangler.jsonc` removal, and credit-based billing literacy. Runner-up when MCP-first JAMstack DX outweighs zero-migration value.

**Vercel** — Mature `@astrojs/vercel` adapter, excellent preview URLs, docs on GitHub. Hobby tier is non-commercial; commercial MVP expects Pro ($20/seat/month). Vercel MCP is beta. Cold starts on serverless SSR. Third place due to migration cost + licensing.

**Fly.io** — Full Node via `@astrojs/node`, persistent processes, `flyctl` CLI, docs as MDX on GitHub. Overkill for stateless MVP; requires Dockerfile/`fly launch` migration. Scores well on ops but loses to pre-configured Cloudflare.

**Railway** — Fast Git-push DX, managed Postgres co-location, usage-based pricing (~$5/month Hobby credit). No official MCP; adapter swap to Node required. Better if team prioritizes integrated DB over edge Workers.

**Render** — Predictable $7/month Starter for always-on SSR, but free tier cold starts (30–50s) are unusable for SSR. Weaker CLI/agent story. Dropped from shortlist due to MVP friction.

### Hard filters applied

- Persistent connections required (Q1 = No): no platforms dropped.
- Runtime support: all six support Astro SSR with the correct adapter; this project already uses the Cloudflare adapter.

### Interview weighting

| Answer                        | Effect                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| Q1: No persistent connections | No Fly/Railway advantage needed; serverless Workers sufficient. |
| Q2: Cost ≈ DX                 | No strong penalty; Cloudflare Free tier competitive.            |
| Q3: Cloudflare familiarity    | Tie-break toward Cloudflare.                                    |
| Q4: Single region             | Edge global network is nice-to-have, not decisive.              |
| Q5: Data layer undecided      | External Supabase fits; D1/R2 remain optional later.            |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins because the repo is already wired: `adapter: cloudflare()`, Workers `main` entrypoint, `nodejs_compat`, observability enabled. Agent loop is `npm run dev` → `npm run build` → `npx wrangler deploy` → `npx wrangler tail`. Lowest migration risk for a 3-week after-hours MVP.

#### 2. Netlify

Second when official Netlify MCP and credit-based JAMstack hosting outweigh staying on Workers. Gap vs. recommendation: full adapter/config migration, new pricing model to monitor, no existing project wiring.

#### 3. Vercel

Third for teams already deep in Vercel CI/CD. Gap vs. recommendation: `@astrojs/vercel` swap, Hobby non-commercial restriction, serverless cold starts, beta MCP.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Adapter lock-in** — Moving off `@astrojs/cloudflare` requires adapter swap, new deploy pipeline, and secrets re-wiring.
2. **workerd ≠ Node** — `nodejs_compat` covers many packages, but heavy AI SDKs or native modules can still fail at runtime despite a green build.
3. **Per-environment builds (Astro 6)** — Staging and production need separate `CLOUDFLARE_ENV=… astro build` artifacts; one build cannot target multiple Wrangler environments.
4. **Split vendor billing** — Cloudflare + Supabase + LLM API are independent cost centers; D1 co-location would require a deliberate migration.
5. **CI deploy not wired yet** — `.github/workflows/ci.yml` builds only; auto-deploy on merge from `tech-stack.md` still needs a deploy step.

### Pre-Mortem — How This Could Fail

The team shipped RafcioCzyta on Cloudflare Workers with Supabase auth and AI flashcard generation. For three weeks it felt fast. By month six, flashcard generation intermittently timed out: the parent-facing NFR was under 10 seconds, but Workers CPU billing and subrequest limits punished larger prompts, and the team had no queue for retries. Staging broke silently because someone deployed a production build to preview without rebuilding with `CLOUDFLARE_ENV=staging`. Supabase session cookies misbehaved behind preview URLs until middleware was fixed. When traffic spiked after a school newsletter mention, they hit Workers Paid overages they had not budgeted for. The “we'll add D1 later” decision never happened, so reporting queries hammered Supabase row limits. The MVP shipped, but the team spent the next quarter moving long-running AI work off Workers — the migration they thought edge compute would avoid.

### Unknown Unknowns

- **`npm run dev` already uses workerd** — Astro 6 + `@astrojs/cloudflare` v13 runs the Cloudflare Vite plugin locally; no separate `wrangler dev` is required for day-to-day SSR development.
- **Pages is not the deploy target** — `@astrojs/cloudflare` v13+ deploys to Workers only; `tech-stack.md` mentions `cloudflare-pages` as a hint, but this project's adapter targets Workers ([adapter migration notes](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)).
- **Auto-provisioned bindings** — First deploy may create KV/Images bindings (e.g. `SESSION`, `IMAGES`) not yet listed in `wrangler.jsonc`; review the dashboard after deploy.
- **Image service default changed** — Default `imageService` is now `cloudflare-binding` (not `compile`); affects image-heavy routes if you add them later.
- **Rollback does not revert Supabase** — `wrangler versions deploy` rolls back Worker code only; database migrations are out of band.

## Operational Story

- **Preview deploys**: Connect the GitHub repo in Cloudflare Workers Builds (or add a `deploy` job to GitHub Actions). Each PR/branch can produce a preview URL on `*.workers.dev` or a preview hostname. Protect preview URLs with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) if the app handles parent accounts. Fork PR previews depend on Cloudflare/GitHub permission settings — verify before relying on them.
- **Secrets**: Production/staging secrets live in the Cloudflare dashboard (Workers → Settings → Variables) or via `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY`. Local dev uses `.dev.vars` (gitignored, copy from `.env.example`). CI uses GitHub repository secrets (`SUPABASE_URL`, `SUPABASE_KEY`) passed to `wrangler deploy` or the Cloudflare Git integration. Rotation: update dashboard/CLI secrets, redeploy; no secret is committed to git.
- **Rollback**: `npx wrangler versions list` then `npx wrangler versions deploy <VERSION_ID> --message "rollback reason"`. Typical revert is minutes (propagation), not instant globally. Supabase schema/data changes are not rolled back automatically.
- **Approval**: Human should approve production deploys, primary secret rotation, and any destructive Supabase migration. An agent may run `npm run build`, `npx wrangler deploy` to a named preview environment, and `npx wrangler tail` read-only without approval.
- **Logs**: Runtime: `npx wrangler tail` (live) or Cloudflare dashboard Observability (enabled in `wrangler.jsonc`). Builds: Workers Builds log in dashboard or GitHub Actions job output. MCP: `https://observability.mcp.cloudflare.com/mcp` and `https://builds.mcp.cloudflare.com/mcp` for structured agent access.

## Risk Register

| Risk                                               | Source           | Likelihood | Impact | Mitigation                                                                                                                                                 |
| -------------------------------------------------- | ---------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI flashcard generation exceeds 10s NFR under load | Devil's advocate | M          | H      | Keep LLM calls as external fetch; avoid heavy in-Worker processing; add timeout + retry UX; move batch generation to a queue only if profiling proves need |
| npm package incompatible with workerd              | Devil's advocate | M          | M      | Pin dependencies; test `npm run dev` (workerd) before merge; enable `nodejs_compat` (already set); fail CI on build                                        |
| Wrong build deployed to staging                    | Pre-mortem       | M          | M      | Use `CLOUDFLARE_ENV=staging npm run build` in CI; separate Wrangler environments; document deploy matrix in README                                         |
| Supabase session/cookie issues on preview URLs     | Pre-mortem       | M          | M      | Configure Supabase redirect URLs for preview domains; test auth on preview before sharing                                                                  |
| Unexpected Workers Paid charges                    | Unknown unknowns | L          | M      | Stay on Free tier during MVP; set account spend notifications; monitor request/CPU dashboards weekly                                                       |
| Auto-provisioned bindings surprise                 | Unknown unknowns | L          | L      | Review Cloudflare dashboard after first deploy; commit explicit bindings to `wrangler.jsonc` when added                                                    |
| CI builds but does not deploy                      | Research finding | H          | M      | Add deploy workflow step (`npm run build && npx wrangler deploy`) with `CLOUDFLARE_API_TOKEN` secret                                                       |
| Adapter Pages vs Workers naming confusion          | Unknown unknowns | M          | L      | Treat deploy target as Workers; update team docs to say Workers, not Pages                                                                                 |

## Getting Started

1. **Local secrets** — Copy `.env.example` to `.dev.vars` and set `SUPABASE_URL` and `SUPABASE_KEY` for Cloudflare local dev (Wrangler reads `.dev.vars`).
2. **Develop locally** — `npm run dev` (Astro 6 runs workerd via `@astrojs/cloudflare` v13; no separate Wrangler dev server needed for daily work).
3. **Authenticate Wrangler** — `npx wrangler login` (one-time per machine).
4. **First production deploy** — `npm run build` then `npx wrangler deploy` (uses existing `wrangler.jsonc` and `@astrojs/cloudflare/entrypoints/server`).
5. **Wire CI deploy** — Extend `.github/workflows/ci.yml` with a deploy job on `master` merge: set `CLOUDFLARE_API_TOKEN` in GitHub secrets, run `npm run build && npx wrangler deploy`, matching `tech-stack.md` auto-deploy-on-merge intent.

For a staging environment later: `CLOUDFLARE_ENV=staging npm run build && npx wrangler deploy` (separate build per environment — Astro 6 requirement).

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (noted as gap; not fully implemented)
- Production-scale architecture (multi-region HA, DR)
