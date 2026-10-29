Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$targetRoot = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $targetRoot ('evidence\qa-fixtures\copy-' + [Guid]::NewGuid().ToString('N'))
$source = Join-Path $fixture 'source'
[IO.Directory]::CreateDirectory((Join-Path $source 'Sample.lrcat-data\nested')) | Out-Null
[IO.File]::WriteAllText((Join-Path $source 'Sample.lrcat'), 'SYNTHETIC_SQLITE_FIXTURE')
[IO.File]::WriteAllText((Join-Path $source 'Sample.lrcat-data\nested\payload.blob'), 'SYNTHETIC_COMPANION')
$copyScript = Join-Path $PSScriptRoot 'Copy-LightroomSnapshot.ps1'
$beforeHash = (Get-FileHash -LiteralPath (Join-Path $source 'Sample.lrcat')).Hash
$checks = [ordered]@{}
$manifestPath = @(& $copyScript -SourceDirectory $source -CatalogName 'Sample.lrcat' -FixtureTest)[-1]
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$checks['verified_copy'] = $manifest.Status -eq 'VERIFIED' -and $manifest.AllCopyHashesVerified -and $manifest.SourceMetadataStable
$checks['companions_preserved'] = @($manifest.Files).Count -eq 2
$checks['sources_unchanged'] = (Get-FileHash -LiteralPath (Join-Path $source 'Sample.lrcat')).Hash -ceq $beforeHash
$checks['copy_marked_readonly'] = [bool]((Get-Item -LiteralPath (Join-Path $manifest.SnapshotRoot 'original\Sample.lrcat')).Attributes -band [IO.FileAttributes]::ReadOnly)
[IO.File]::WriteAllText((Join-Path $source 'Sample.lrcat.lock'), 'SYNTHETIC_LOCK')
$lockRejected = $false
try { $null = & $copyScript -SourceDirectory $source -CatalogName 'Sample.lrcat' -FixtureTest } catch { $lockRejected = $_.Exception.Message -like '*potencialmente em uso*' }
$checks['live_catalog_refused'] = $lockRejected
$checks['source_lock_preserved'] = Test-Path -LiteralPath (Join-Path $source 'Sample.lrcat.lock')
$pathRejected = $false
try { $null = & $copyScript -SourceDirectory $source -CatalogName '..\Sample.lrcat' -FixtureTest } catch { $pathRejected = $true }
$checks['path_traversal_refused'] = $pathRejected
[IO.File]::WriteAllText((Join-Path $source 'Busy.lrcat'), 'SYNTHETIC_OPEN_WRITER')
$openWriter = [IO.FileStream]::new((Join-Path $source 'Busy.lrcat'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite)
$writerRejected = $false
try {
    try { $null = & $copyScript -SourceDirectory $source -CatalogName 'Busy.lrcat' -FixtureTest } catch { $writerRejected = $true }
} finally { $openWriter.Dispose() }
$checks['existing_writer_without_lock_refused'] = $writerRejected
$result = [ordered]@{ GeneratedUtc = [DateTime]::UtcNow.ToString('o'); Status = $(if (@($checks.Values | Where-Object { -not $_ }).Count) { 'FAIL' } else { 'PASS' }); Checks = $checks; Scope = 'SYNTHETIC_COPY_SAFETY'; PowerShell = $PSVersionTable.PSVersion.ToString() }
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $targetRoot 'evidence\qa-snapshot.json') -Encoding utf8
$result | ConvertTo-Json -Depth 6
if ($result.Status -ne 'PASS') { throw 'Falha nos testes de snapshot.' }
