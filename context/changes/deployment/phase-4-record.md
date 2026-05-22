---
change_id: deployment
phase: 4
status: ci-green-deploy-blocked-api-token
updated_at: 2026-05-22
---

# Phase 4 — GitHub Actions deploy

## Done in repo

- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml): `workflow_dispatch`, `deploy` job (`needs: ci`), `cloudflare/wrangler-action@v3`
- Deploy runs on `push` to `main` and manual `workflow_dispatch`; skipped on `pull_request` (workflow branch: `main`, not `master`)

## CI status (2026-05-22)

| Job | Run | Result |
|-----|-----|--------|
| `ci` | [26288901045](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/actions/runs/26288901045) | ✅ lint + build |
| `deploy` | same run | ❌ missing `CLOUDFLARE_API_TOKEN` |

## You still need (one-time)

### 1. Cloudflare API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** → template **Edit Cloudflare Workers**.

Then:

```powershell
& "$env:ProgramFiles\GitHub CLI\gh.exe" secret set CLOUDFLARE_API_TOKEN -R krzysztofpupowski-cmd/RafcioCzyta
gh workflow run ci.yml -R krzysztofpupowski-cmd/RafcioCzyta
```

### 2. GitHub repository secrets

Repo: `https://github.com/krzysztofpupowski-cmd/RafcioCzyta`

| Secret                  | Value                                      |
| ----------------------- | ------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Token from step 1                          |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ set |
| `SUPABASE_URL`          | ✅ set |
| `SUPABASE_KEY`          | ✅ set |
| `CLOUDFLARE_API_TOKEN`  | ❌ **required** — create token, then `gh secret set` |

Set via GitHub → Settings → Secrets and variables → Actions, or install `gh` and run `gh secret set …` (see [gh-cli-setup.md](./gh-cli-setup.md)).

Verify (after `gh` install): `.\scripts\gh-verify-setup.ps1`

### 3. Validation

```powershell
# Manual deploy (after secrets exist)
gh workflow run ci.yml
gh run watch

# PR: ci only; merge to master: ci + deploy
```

Push to `main` (empty remote repo — first push establishes default branch) so Actions picks up the `deploy` job.
