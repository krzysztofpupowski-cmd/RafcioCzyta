---
change_id: deployment
status: complete
completed_at: 2026-05-22
production_url: https://rafcio-czyta.krzysztof-pupowski.workers.dev
repository: https://github.com/krzysztofpupowski-cmd/RafcioCzyta
---

# Deployment complete

Production MVP baseline for **rafcio-czyta** is live and verified.

## Production

| Item | Value |
|------|--------|
| **URL** | https://rafcio-czyta.krzysztof-pupowski.workers.dev |
| **Platform** | Cloudflare Workers (`rafcio-czyta`) |
| **Auth** | Supabase (cookie SSR via `@supabase/ssr`) |
| **CI/CD** | GitHub Actions — lint + build on PR; deploy on push to `main` + `workflow_dispatch` |

## Phases

| Phase | Summary |
|-------|---------|
| 0 | Prerequisites — Cloudflare account, Supabase, Node 22 |
| 1 | `wrangler.jsonc`, `.dev.vars`, local smoke-test |
| 2 | First manual deploy, KV/IMAGES bindings |
| 3 | Supabase Site URL; production signin → `/dashboard` verified |
| 4 | GitHub secrets, CI + `wrangler-action` deploy |
| 5 | `wrangler tail`, rollback docs in README |

## Records

- [deployment-plan.md](./deployment-plan.md) — full checklist
- [phase-2-record.md](./phase-2-record.md) — manual deploy
- [phase-3-record.md](./phase-3-record.md) — Supabase auth
- [phase-4-record.md](./phase-4-record.md) — GitHub Actions
- [phase-5-record.md](./phase-5-record.md) — observability

## Optional follow-ups (non-blocking)

- Cloudflare dashboard → **Observability** on `rafcio-czyta`
- Cloudflare **Billing** → spend notifications ($1 / $5)
- Custom domain (deferred in plan)
- Staging / PR previews (deferred in [infrastructure.md](../../foundation/infrastructure.md))

## Quick commands

```bash
npm run dev                    # local (Cloudflare workerd + .dev.vars)
npm run build && npx wrangler deploy   # manual production deploy
npx wrangler tail rafcio-czyta # live logs
gh workflow run ci.yml         # trigger CI deploy
```
