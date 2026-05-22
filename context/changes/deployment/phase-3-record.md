---
change_id: deployment
phase: 3
status: awaiting-supabase-dashboard-and-auth-test
updated_at: 2026-05-22
production_url: https://rafcio-czyta.krzysztof-pupowski.workers.dev
---

# Phase 3 — Supabase auth on production

## Dashboard steps (required)

In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**:

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| **Site URL**      | `https://rafcio-czyta.krzysztof-pupowski.workers.dev`    |
| **Redirect URLs** | `https://rafcio-czyta.krzysztof-pupowski.workers.dev/**` |

Use `https` only, no trailing slash on Site URL. Add a custom domain to Redirect URLs later when attached.

## Manual auth round-trip (after URL config)

1. Open `https://rafcio-czyta.krzysztof-pupowski.workers.dev/auth/signup` and create a test account.
2. Open the confirmation email; the link must point at the workers.dev host (built from Site URL), not `localhost`.
3. Sign in at `/auth/signin` → visit `/dashboard` (should load, not redirect to signin).

If signin succeeds but `/dashboard` still redirects, see **Edge Case B** in [deployment-plan.md](./deployment-plan.md).

## Email template check

If confirmation links fail: **Authentication** → **Email Templates** → **Confirm signup** — link should use `{{ .SiteURL }}` (Supabase default). Stale Site URL is the usual cause.

## Local `config.toml` (unchanged)

[supabase/config.toml](../../../supabase/config.toml) keeps `site_url = "http://127.0.0.1:3000"` for local dev. Production URLs are dashboard-only; do not overwrite local settings with the workers.dev URL.

## Verification checklist

- [ ] Site URL set in Supabase dashboard
- [ ] Redirect URLs include production workers.dev URL
- [ ] Signup → email confirm → signin → `/dashboard` on production
- [ ] `sb-*` cookies visible on workers.dev domain (DevTools → Application → Cookies)
