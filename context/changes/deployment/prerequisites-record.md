---
change_id: deployment
phase: 0
completed_at: 2026-05-22
status: complete
---

# Phase 0 — Prerequisites record

Verification only; no repo code changes. Secrets stay in password manager / dashboard / `.dev.vars` (Phase 1), not in this file.

| Item                        | Status | Notes                                                                                                            |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Cloudflare account          | Done   | Account ID captured for Phase 2 (`wrangler whoami`) and Phase 4 (`CLOUDFLARE_ACCOUNT_ID` GitHub secret).         |
| Supabase production project | Done   | Project URL and anon key ready for `.dev.vars`, `wrangler secret put`, and existing GitHub `SUPABASE_*` secrets. |
| First-deploy hostname       | Done   | `rafcio-czyta.<account-subdomain>.workers.dev` (free Workers subdomain). Custom domain deferred.                 |
| Local toolchain             | Done   | Node `v22.22.0` (`.nvmrc` targets `22.14.0`; same major). Docker not required — hosted Supabase.                 |

## Next

Proceed to [Phase 1](./deployment-plan.md#phase-1--local-config-hygiene) in deployment-plan.md.
