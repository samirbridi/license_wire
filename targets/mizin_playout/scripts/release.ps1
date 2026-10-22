# Full release: every published update goes through the same gates, then the feed and the site
# (download links + What's new) are updated together. Run after committing the changes.
# Requires: release-notes.json updated (EN/PT) for this version before the build.
param([switch]$SkipPublish)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$python='C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$wrangler=Get-Item -Path (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx\*
ode_modules\wranglerin\wrangler.js') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if(-not $wrangler){throw 'wrangler not found: run "npx wrangler --version" once.'}
foreach($step in 'build','package','test-package','test-update-install'){
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "$step.ps1")
  if($LASTEXITCODE -ne 0){throw "$step failed; nothing was published."}
}
if($SkipPublish){Write-Output 'Validated; publication skipped.';return}
& $python (Join-Path $PSScriptRoot 'updates.py') publish --node (Get-Command node).Source --wrangler $wrangler.FullName
if($LASTEXITCODE -ne 0){throw 'Update publication failed.'}
& $python (Join-Path $PSScriptRoot 'site-shots.py')
if($LASTEXITCODE -ne 0){throw 'Site screenshots failed.'}
& $python (Join-Path $PSScriptRoot 'site.py')
if($LASTEXITCODE -ne 0){throw 'Site generation failed.'}
Push-Location $root
try{& node $wrangler.FullName pages deploy --branch main --commit-dirty=true;if($LASTEXITCODE -ne 0){throw 'Site deploy failed.'}}finally{Pop-Location}
Write-Output 'Published: https://playoutmizin.pages.dev (feed /updates/preview/latest.json, What''s new /changelog)'
