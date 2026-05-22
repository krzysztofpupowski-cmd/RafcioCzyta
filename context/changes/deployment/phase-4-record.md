---
change_id: deployment
phase: 4
status: deploy-blocked-kv-token-scope
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
| (latest) | workflow_dispatch | ✅ | ❌ | `kv bindings require kv write perms [code: 10023]` |

## Fix — API token must include Workers KV (current blocker)

Deploy uploads the Worker then fails binding `env.SESSION` (KV namespace in [wrangler.jsonc](../../../wrangler.jsonc)). Astro sessions require KV; the CI token must be able to **write** KV bindings on deploy.

**Error:** `kv bindings require kv write perms [code: 10023]`

### Option A — Template (preferred)

1. Cloudflare → **My Profile** → **API Tokens** → **Create Token**
2. Template: **Edit Cloudflare Workers** (includes **Workers KV Storage** write on the account)
3. **Account Resources** → Include → account `2c788d5ea383324e978394f1cda7696a`
4. Create token → copy once

### Option B — Custom token (if template still fails)

Create **Custom token** with these **Account** permissions:

| Permission | Access |
|------------|--------|
| Workers Scripts | Edit |
| Workers KV Storage | Edit |
| Account Settings | Read |

Plus **User** permissions: User Details Read, Memberships Read.

Account Resources: **Include** → your account only.

### Re-set GitHub secret and re-run

1. Cloudflare → **My Profile** → **API Tokens** → **Create Token** (see above)
2. Copy token once

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
| `CLOUDFLARE_API_TOKEN` | Set — **re-issue** with **Workers Scripts Edit + Workers KV Storage Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_KEY` | ✅ |

Verify: `.\scripts\gh-verify-setup.ps1`

## After deploy succeeds

- [ ] Confirm production URL still works: `https://rafcio-czyta.krzysztof-pupowski.workers.dev`
- [ ] Phase 3: Supabase Site URL + auth round-trip ([phase-3-record.md](./phase-3-record.md))
- [ ] PR test: open PR → `ci` only; merge → `ci` + `deploy`
