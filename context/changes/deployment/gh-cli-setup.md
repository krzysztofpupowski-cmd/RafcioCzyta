# GitHub CLI setup (Phase 4)

Companion to [deployment-plan.md](./deployment-plan.md). Use `gh` to authenticate, create/link the repo, and set Actions secrets without the GitHub web UI.

## 1. Install (done)

```powershell
winget install --id GitHub.cli -e
```

Verify: `gh --version` (expected: 2.92+).

## 2. Authenticate (one-time, interactive)

In a terminal where you can use the browser:

```powershell
gh auth login
```

Recommended answers:

| Prompt               | Choice                                    |
| -------------------- | ----------------------------------------- |
| What account?        | `GitHub.com`                              |
| Preferred protocol   | `HTTPS`                                   |
| Authenticate Git?    | `Yes` (stores credentials for `git push`) |
| How to authenticate? | `Login with a web browser`                |

Verify:

```powershell
gh auth status
```

## 3. Create or link the GitHub repo

This project has no `origin` yet. Pick one path.

### A — New repo on GitHub (typical for first push)

From the project root, after an initial commit:

```powershell
git add .
git commit -m "Initial commit"
gh repo create rafcio-czyta --private --source=. --remote=origin --push
```

Adjust visibility (`--public`) and name if your GitHub org/username differs.

### B — Existing empty repo on GitHub

```powershell
git remote add origin https://github.com/YOUR_USER/rafcio-czyta.git
git push -u origin main
```

Confirm `gh` sees the repo:

```powershell
gh repo view
```

## 4. Set Actions secrets (Phase 4 checklist)

Required for CI build + Cloudflare deploy (see deployment-plan Phase 4):

| Secret                  | Source                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | **Edit Cloudflare Workers** template (must include **Workers KV Storage** write; error `10023` = missing KV scope) |
| `CLOUDFLARE_ACCOUNT_ID` | Workers & Pages → Overview → Account ID (sidebar)                           |
| `SUPABASE_URL`          | Supabase project → Settings → API → Project URL                             |
| `SUPABASE_KEY`          | Supabase → anon/public key (same as `.dev.vars`)                            |

Set each secret (prompts for value; input is hidden):

```powershell
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set SUPABASE_URL
gh secret set SUPABASE_KEY
```

Or from env vars in the same shell session (no value echoed):

```powershell
$env:CLOUDFLARE_API_TOKEN = "paste-token-here"
gh secret set CLOUDFLARE_API_TOKEN --body $env:CLOUDFLARE_API_TOKEN
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

List secrets (names only):

```powershell
gh secret list
```

## 5. Operate workflows from the CLI

After [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) includes `workflow_dispatch` and a `deploy` job:

```powershell
# Manual production deploy
gh workflow run ci.yml

# Watch the latest run
gh run list --workflow=ci.yml --limit 3
gh run watch
```

## 6. Troubleshooting

| Issue                                      | Fix                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| `gh: command not found`                    | Restart the terminal (PATH updated by winget).          |
| `You are not logged into any GitHub hosts` | Run `gh auth login`.                                    |
| `failed to set secret` / 404               | Run from repo root; confirm `gh repo view` works.       |
| Secret set but CI fails auth               | Re-check token scopes (Edge Case E in deployment-plan). |

## Quick verification script

From repo root (after auth + remote):

```powershell
.\scripts\gh-verify-setup.ps1
```
