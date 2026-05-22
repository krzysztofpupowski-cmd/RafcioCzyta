---
change_id: deployment
phase: 2
status: complete
updated_at: 2026-05-22
---

# Phase 2 — Deploy record

## Production URL

**https://rafcio-czyta.krzysztof-pupowski.workers.dev**

Version ID: `9335ad39-4075-4342-974c-13f39091a55c`

## Completed

| Step                    | Result                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `wrangler whoami`       | Logged in; Account ID `2c788d5ea383324e978394f1cda7696a`                                                                             |
| `wrangler secret put`   | `SUPABASE_URL`, `SUPABASE_KEY` on Worker `rafcio-czyta`                                                                              |
| `npm run build`         | Success → `dist/`                                                                                                                    |
| `npx wrangler deploy`   | Published to workers.dev (subdomain `krzysztof-pupowski`)                                                                            |
| Edge Case A             | SESSION KV: `72e67c7a3d0049568d33b924cd94d90f` (`rafcio-czyta-session`); IMAGES binding in [wrangler.jsonc](../../../wrangler.jsonc) |
| Smoke-test `/`          | HTTP 200                                                                                                                             |
| Smoke-test `/dashboard` | HTTP 302 → `/auth/signin` (middleware gate)                                                                                          |

## Next — Phase 3

1. Supabase dashboard → Authentication → URL Configuration:
   - **Site URL**: `https://rafcio-czyta.krzysztof-pupowski.workers.dev`
   - **Redirect URLs**: same URL (add custom domain later when attached)
2. Manual auth round-trip on production: signup → confirm-email → signin → `/dashboard`
