---
change_id: deployment
phase: 5
status: partial
updated_at: 2026-05-22
active_version: 9335ad39-4075-4342-974c-13f39091a55c
---

# Phase 5 — Observability & rollback

## Worker versions (rollback targets)

```text
9335ad39-4075-4342-974c-13f39091a55c  ← current production deploy
021613b5-25f7-481d-8d43-9b2d7836bec1
2acd1335-898f-48ba-9a47-62caa4ee504a
```

Rollback example:

```bash
npx wrangler versions deploy 021613b5-25f7-481d-8d43-9b2d7836bec1 --message "rollback: reason"
```

Reverts Worker code only — not Supabase schema/data.

## Live logs

```bash
npx wrangler tail rafcio-czyta
```

Hit the site in another terminal; expect request logs in the tail stream.

## Dashboard (manual)

- **Workers & Pages → rafcio-czyta → Observability** — confirm metrics/logs (enabled in [wrangler.jsonc](../../../wrangler.jsonc))
- **Manage Account → Billing → Notifications** — set spend alerts at $1 / $5

## README

Rollback, deploy, and `wrangler tail` documented in [README.md](../../../README.md#deployment).
