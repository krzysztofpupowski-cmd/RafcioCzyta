---
change_id: deployment
phase: 3
status: complete
updated_at: 2026-05-22
production_url: https://rafcio-czyta.krzysztof-pupowski.workers.dev
verified_user: krzysztof.pupowski@gmail.com
---

# Phase 3 — Supabase auth on production

## Complete

Production auth round-trip verified: signed-in user sees dashboard with email and protected-page message (matches [dashboard.astro](../../../src/pages/dashboard.astro)).

| Check | Status |
|-------|--------|
| Supabase Site URL + Redirect URLs (workers.dev) | ✅ (inferred — dashboard loads with session) |
| Signin → `/dashboard` (no redirect to signin) | ✅ |
| Session cookie round-trip on `*.workers.dev` | ✅ |

## Production URLs (reference)

| Field | Value |
|-------|--------|
| **Site URL** | `https://rafcio-czyta.krzysztof-pupowski.workers.dev` |
| **Redirect URLs** | `https://rafcio-czyta.krzysztof-pupowski.workers.dev/**` |

## Local `config.toml` (unchanged)

[supabase/config.toml](../../../supabase/config.toml) keeps `site_url = "http://127.0.0.1:3000"` for local dev only.

## Next

Phase 5 manual items: CF Observability dashboard + billing spend notifications ([phase-5-record.md](./phase-5-record.md)).
