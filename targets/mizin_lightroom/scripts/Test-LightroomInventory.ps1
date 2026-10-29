[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$target = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $target ('evidence\qa-fixtures\' + [Guid]::NewGuid().ToString('N'))
$source = Join-Path $fixture 'source'
$catalogs = Join-Path $source 'catalogs'
$plugins = Join-Path $source 'plugins'
$deep = Join-Path $catalogs 'level1\level2'
foreach ($dir in @($catalogs, $plugins, $deep, (Join-Path $plugins 'Neurapix.lrplugin'), (Join-Path $catalogs 'Test Smart Previews.lrdata'))) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
foreach ($name in @('Test.lrcat', 'Test.lrcat-data', 'Test.lrcat-wal', 'Test.lrcat-shm', 'Test.lrcat.lock', 'image.acr', 'original.CR3')) {
    [IO.File]::WriteAllText((Join-Path $catalogs $name), 'SYNTHETIC_TEST_DATA_NO_REAL_CATALOG')
}
[IO.File]::WriteAllText((Join-Path $deep 'Deep.lrcat'), 'SYNTHETIC_DEEP_TEST')
[IO.File]::WriteAllText((Join-Path $plugins 'Neurapix.lrplugin\Info.lua'), 'SYNTHETIC_PLUGIN_NOT_EXECUTED')
function Source-State {
    @(Get-ChildItem -LiteralPath $source -Recurse -Force -File | Sort-Object FullName | ForEach-Object {
        '{0}|{1}|{2}|{3}' -f $_.FullName, $_.Length, $_.LastWriteTimeUtc.Ticks, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }) -join "`n"
}
$before = Source-State
$inventory = Join-Path $PSScriptRoot 'Get-LightroomInventory.ps1'
$out = Join-Path $fixture 'report'
$null = & $inventory -CatalogDirectory $catalogs -PluginDirectory $plugins -OutputDirectory $out -MaxDepth 0 -SkipApplicationInfo
$report = Get-Content -LiteralPath (Join-Path $out 'inventory.json') -Raw | ConvertFrom-Json
$checks = [ordered]@{}
$checks['catalog_discovered'] = @($report.Records | Where-Object Kind -eq 'CATALOG_METADATA_ONLY').Count -eq 1
$checks['ai_companion_discovered'] = @($report.Records | Where-Object Kind -eq 'CATALOG_AI_COMPANION_METADATA_ONLY').Count -eq 1
$checks['runtime_companions_discovered'] = @($report.Records | Where-Object Kind -eq 'CATALOG_RUNTIME_COMPANION_METADATA_ONLY').Count -eq 3
$checks['plugin_discovered'] = @($report.Records | Where-Object Kind -eq 'PLUGIN_DIRECTORY_METADATA_ONLY').Count -eq 1
$checks['preview_discovered'] = @($report.Records | Where-Object Kind -eq 'PREVIEW_COMPANION_METADATA_ONLY').Count -eq 1
$checks['acr_companion_discovered'] = @($report.Records | Where-Object Kind -eq 'ACR_SIDECAR_METADATA_ONLY').Count -eq 1
$checks['depth_limit_reported'] = $report.SearchTruncated -and -not @($report.Records | Where-Object Path -like '*Deep.lrcat').Count
$reportHash = (Get-FileHash -LiteralPath (Join-Path $out 'inventory.json') -Algorithm SHA256).Hash
$rejected = $false
try { $null = & $inventory -CatalogDirectory $catalogs -PluginDirectory $plugins -OutputDirectory $out -SkipApplicationInfo } catch { $rejected = $true }
$checks['existing_report_preserved'] = $rejected -and ((Get-FileHash -LiteralPath (Join-Path $out 'inventory.json') -Algorithm SHA256).Hash -eq $reportHash)
$limitedOut = Join-Path $fixture 'limited-report'
$null = & $inventory -CatalogDirectory $catalogs -PluginDirectory $plugins -OutputDirectory $limitedOut -MaxDirectories 1 -SkipApplicationInfo
$limited = Get-Content -LiteralPath (Join-Path $limitedOut 'inventory.json') -Raw | ConvertFrom-Json
$checks['directory_budget_enforced'] = $limited.SearchTruncated -and $limited.ProcessedDirectories -eq 1
$missingOut = Join-Path $fixture 'missing-report'
$null = & $inventory -CatalogDirectory (Join-Path $fixture 'missing') -PluginDirectory $plugins -OutputDirectory $missingOut -SkipApplicationInfo
$missing = Get-Content -LiteralPath (Join-Path $missingOut 'inventory.json') -Raw | ConvertFrom-Json
$checks['missing_path_reported'] = @($missing.Issues | Where-Object Status -eq 'UNAVAILABLE').Count -eq 1
$checks['source_bytes_and_timestamps_preserved'] = $before -ceq (Source-State)
$result = [ordered]@{
    GeneratedUtc = [DateTime]::UtcNow.ToString('o'); PowerShell = $PSVersionTable.PSVersion.ToString()
    Status = $(if (@($checks.Values | Where-Object { -not $_ }).Count) { 'FAIL' } else { 'PASS' })
    Checks = $checks; Scope = 'SYNTHETIC_LOCAL_FIXTURE'; LightroomHostTested = $false; RemoteCatalogTested = $false
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target 'evidence\qa-inventory.json') -Encoding utf8
$result | ConvertTo-Json -Depth 6
if ($result.Status -ne 'PASS') { throw 'Falha no QA do inventario.' }
