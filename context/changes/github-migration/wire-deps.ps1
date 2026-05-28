$ErrorActionPreference = "Stop"
$repo = "krzysztofpupowski-cmd/RafcioCzyta"
$map = Get-Content (Join-Path $PSScriptRoot "issue-map.json") -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-Num($key) { return $map.$key.number }

$blocked = @{
  "F-02" = @("F-01", "Q-LLM")
  "F-03" = @("F-01", "Q-SRS")
  "S-01" = @("F-01")
  "S-02" = @("F-01", "F-02", "S-01")
  "S-03" = @("S-02")
  "S-04" = @("S-03", "F-03")
  "S-05" = @("S-04")
}

foreach ($key in $blocked.Keys) {
  $issueNum = Get-Num $key
  $refs = ($blocked[$key] | ForEach-Object { "#$(Get-Num $_) ($($_))" }) -join "`n- "
  $section = "`n`n## Blocked by`n`n- $refs"
  $body = gh issue view $issueNum --repo $repo --json body -q .body
  if ($body -match "## Blocked by") { Write-Host "Skip $key (#$issueNum) - already has Blocked by"; continue }
  $newBody = $body + $section
  $tmp = Join-Path $env:TEMP "issue-$issueNum-body.md"
  Set-Content -Path $tmp -Value $newBody -Encoding UTF8 -NoNewline
  gh issue edit $issueNum --repo $repo --body-file $tmp | Out-Null
  Write-Host "Updated $key (#$issueNum)"
}

$downstream = @"
## Roadmap dependency map (migration)

| ID | Issue | Blocks |
|----|-------|--------|
| Q-SRS | #3 | F-03 (#7), S-04 (#11) |
| Q-LLM | #4 | F-02 (#6), S-02 (#9) |
| F-01 | #5 | S-01 (#8), F-02 (#6), F-03 (#7), S-02+ |
| F-02 | #6 | S-02 (#9) |
| F-03 | #7 | S-04 (#11) |
| S-01 | #8 | S-02 (#9) |
| S-02 | #9 | S-03 (#10) |
| S-03 | #10 | S-04 (#11) |
| S-04 | #11 | S-05 (#12) north-star |

**Start here:** F-01 (#5) — only issue with ``10x-plan-ready``.
"@
gh issue comment (Get-Num "F-01") --repo $repo --body $downstream | Out-Null
Write-Host "Added dependency map comment on F-01 (#$(Get-Num 'F-01'))"
