---
change_id: deployment
phase: 4
status: deploy-blocked-token-permissions
updated_at: 2026-05-22
---

# Phase 4 — GitHub Actions deploy

## Done in repo

- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml): `workflow_dispatch`, `deploy` job, `wrangler whoami` pre-check
- [wrangler.jsonc](../../../wrangler.jsonc): `account_id` set for CI/non-interactive deploys
- All four GitHub secrets present

## CI runs

| Run | Trigger | `ci` | `deploy` | Notes |
|-----|---------|------|----------|-------|
| [26288901045](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/actions/runs/26288901045) | push | ✅ | ❌ | No `CLOUDFLARE_API_TOKEN` |
| [26289250289](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/actions/runs/26289250289) | workflow_dispatch | ✅ | ❌ | `Authentication error [code: 10000]` |

## Fix — re-create Cloudflare API token

The token secret exists but Cloudflare rejected it (wrong template, account scope, or typo).

1. Cloudflare → **My Profile** → **API Tokens** → **Create Token**
2. Use template **Edit Cloudflare Workers** (not a custom read-only token)
3. **Account Resources** → Include → **your account** (ID `2c788d5ea383324e978394f1cda7696a`)
4. Create and copy the token once

Re-set the GitHub secret (paste only the token, no spaces/newlines):

```powershell
$gh = "$env:ProgramFiles\GitHub CLI\gh.exe"
$token = Read-Host "Paste Cloudflare API token" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
& $gh secret set CLOUDFLARE_API_TOKEN --body $plain -R krzysztofpupowski-cmd/RafcioCzyta
& $gh workflow run ci.yml -R krzysztofpupowski-cmd/RafcioCzyta
& $gh run watch -R krzysztofpupowski-cmd/RafcioCzyta
```

Local sanity check before CI:

```powershell
$env:CLOUDFLARE_API_TOKEN = "paste-token-here"
$env:CLOUDFLARE_ACCOUNT_ID = "2c788d5ea383324e978394f1cda7696a"
npx wrangler whoami
```

Expect your account in the table; then `npm run build` + `npx wrangler deploy` (optional).

## Secrets checklist

| Secret | Status |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Set — **must be re-issued** with Workers edit scopes |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_KEY` | ✅ |

Verify: `.\scripts\gh-verify-setup.ps1`

## After deploy succeeds

- [ ] Confirm production URL still works: `https://rafcio-czyta.krzysztof-pupowski.workers.dev`
- [ ] Phase 3: Supabase Site URL + auth round-trip ([phase-3-record.md](./phase-3-record.md))
- [ ] PR test: open PR → `ci` only; merge → `ci` + `deploy`
