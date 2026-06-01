---
change_id: deployment
phase: 4
status: complete
updated_at: 2026-05-22
production_url: https://rafcio-czyta.krzysztof-pupowski.workers.dev
---

# Phase 4 — GitHub Actions deploy

## Complete

| Item                                            | Status                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GitHub secrets (all 4)                          | ✅                                                                                              |
| `ci.yml` — lint, build, deploy on `main`        | ✅                                                                                              |
| `wrangler.jsonc` `account_id` + KV token scopes | ✅                                                                                              |
| Manual `workflow_dispatch` deploy               | ✅ [26290469829](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/actions/runs/26290469829) |
| Production smoke-test                           | ✅ `/` 200, `/dashboard` → `/auth/signin`                                                       |

## Token note (resolved)

Deploy failed until the API token included **Workers KV Storage Edit** (error `10023` for `SESSION` binding). **Edit Cloudflare Workers** template (or custom token with KV Edit) fixes it.

## CI commands

```powershell
& "$env:ProgramFiles\GitHub CLI\gh.exe" workflow run ci.yml -R krzysztofpupowski-cmd/RafcioCzyta
& "$env:ProgramFiles\GitHub CLI\gh.exe" run watch -R krzysztofpupowski-cmd/RafcioCzyta
```

## Optional validation

- [ ] PR: open a trivial PR → `ci` only; merge → `ci` + `deploy`

## Next

Phase 3 — [phase-3-record.md](./phase-3-record.md) (Supabase Site URL + auth round-trip on production).
