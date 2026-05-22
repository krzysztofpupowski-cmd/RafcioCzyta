# Verifies GitHub CLI auth, repo linkage, and Actions secrets for deployment Phase 4.
# Usage: .\scripts\gh-verify-setup.ps1

$ErrorActionPreference = "Stop"
$requiredSecrets = @(
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "SUPABASE_URL",
    "SUPABASE_KEY"
)

function Require-Gh {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        return
    }
    $ghExe = "${env:ProgramFiles}\GitHub CLI\gh.exe"
    if (Test-Path $ghExe) {
        $script:GhCmd = $ghExe
        return
    }
    Write-Error "GitHub CLI (gh) is not on PATH. Install: winget install --id GitHub.cli -e"
}

$script:GhCmd = "gh"
Require-Gh

Write-Host "==> gh version"
& $script:GhCmd --version

Write-Host "`n==> auth status"
& $script:GhCmd auth status
if ($LASTEXITCODE -ne 0) {
    Write-Error "Run: gh auth login"
}

Write-Host "`n==> git remote"
$remote = git remote get-url origin 2>$null
if (-not $remote) {
    Write-Warning "No origin remote. Create/link repo first (see context/changes/deployment/gh-cli-setup.md)."
} else {
    Write-Host "origin: $remote"
}

Write-Host "`n==> GitHub repo (gh)"
& $script:GhCmd repo view 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "gh cannot resolve this directory to a GitHub repo yet."
}

Write-Host "`n==> Actions secrets"
$listed = & $script:GhCmd secret list --json name -q ".[].name" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not list secrets (repo missing or insufficient permissions)."
} else {
    $names = @($listed)
    foreach ($secret in $requiredSecrets) {
        if ($names -contains $secret) {
            Write-Host "[ok] $secret"
        } else {
            Write-Host "[missing] $secret  ->  gh secret set $secret"
        }
    }
}

Write-Host "`nDone. See context/changes/deployment/gh-cli-setup.md for full setup steps."
