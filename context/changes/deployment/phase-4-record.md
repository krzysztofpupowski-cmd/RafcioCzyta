---
change_id: deployment
phase: 4
status: workflow-ready-secrets-pending
updated_at: 2026-05-22
---

# Phase 4 — GitHub Actions deploy

## Done in repo

- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml): `workflow_dispatch`, `deploy` job (`needs: ci`), `cloudflare/wrangler-action@v3`
- Deploy runs on `push` to `main` and manual `workflow_dispatch`; skipped on `pull_request` (workflow branch: `main`, not `master`)

## You still need (one-time)

### 1. Cloudflare API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** → template **Edit Cloudflare Workers**.

### 2. GitHub repository secrets

Repo: `https://github.com/krzysztofpupowski-cmd/RafcioCzyta`

| Secret                  | Value                                      |
| ----------------------- | ------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Token from step 1                          |
| `CLOUDFLARE_ACCOUNT_ID` | `2c788d5ea383324e978394f1cda7696a`         |
| `SUPABASE_URL`          | Already used by CI build — confirm present |
| `SUPABASE_KEY`          | Anon key — confirm present                 |

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
