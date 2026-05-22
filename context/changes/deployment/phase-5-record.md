---
change_id: deployment
phase: 5
status: complete
updated_at: 2026-05-22
production_url: https://rafcio-czyta.krzysztof-pupowski.workers.dev
---

# Phase 5 — Observability & rollback

## Done in repo

- Rollback + `wrangler tail` documented in [README.md](../../../README.md#deployment)
- `observability.enabled` in [wrangler.jsonc](../../../wrangler.jsonc)
- CI deploy live — versions managed via GitHub Actions + Wrangler

## Manual checklist

| Task | Status |
|------|--------|
| `npx wrangler tail rafcio-czyta` while hitting the site | ✅ (2026-05-22 — JSON request logs on GET `/`) |
| CF dashboard → Workers → `rafcio-czyta` → Observability | optional (recommended) |
| CF Billing → spend notifications ($1 / $5) | optional (recommended) |

## Rollback

```bash
npx wrangler versions list
npx wrangler versions deploy <VERSION_ID> --message "rollback: reason"
```

Worker code only — not Supabase data.

## Live logs

```bash
npx wrangler tail rafcio-czyta
```
