# One-shot roadmap -> GitHub issues migration
$ErrorActionPreference = "Stop"
$repo = "krzysztofpupowski-cmd/RafcioCzyta"
$root = $PSScriptRoot
$bodies = Join-Path $root "bodies"
$config = Get-Content (Join-Path $root "issues.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$map = @{}

foreach ($item in $config) {
  $bodyPath = Join-Path $bodies $item.body
  if (-not (Test-Path $bodyPath)) { throw "Missing body: $bodyPath" }
  $url = (gh issue create --repo $repo --title $item.title --body-file $bodyPath --label $item.labels 2>&1 | Select-Object -Last 1).Trim()
  if ($url -notmatch '/issues/(\d+)$') { throw "Unexpected gh output for $($item.key): $url" }
  $num = [int]$Matches[1]
  $map[$item.key] = @{ number = $num; url = $url }
  Write-Host "$($item.key) -> #$num $url"
}

$map | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $root "issue-map.json") -Encoding UTF8
