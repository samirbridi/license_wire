<#
.SYNOPSIS
    Preserva catalogo fechado e lrcat-data sem escrever na origem.
.DESCRIPTION
    Exige ausencia de lock/WAL/SHM, abre todas as fontes sem compartilhar escrita,
    calcula SHA-256 durante a leitura e verifica a copia local. Copias ficam em
    private/snapshots, sem sobrescrever ou apagar arquivos. Nao copia previews/RAWs.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$CatalogName,
    [switch]$FixtureTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$targetRoot = Split-Path -Parent $PSScriptRoot
if ([IO.Path]::GetFileName($CatalogName) -cne $CatalogName -or $CatalogName -notmatch '\.lrcat$' -or $CatalogName.Contains('..')) {
    throw 'Informe somente o nome de arquivo .lrcat, sem componentes de caminho.'
}
$sourceRoot = (Get-Item -LiteralPath $SourceDirectory -Force -ErrorAction Stop).FullName.TrimEnd('\')
if ((Get-Item -LiteralPath $sourceRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Origem reparse point nao suportada.' }
$catalogPath = Join-Path $sourceRoot $CatalogName
$companionPath = $catalogPath + '-data'
function Assert-CatalogClosed {
    foreach ($suffix in @('.lock', '-wal', '-shm')) {
        if (Test-Path -LiteralPath ($catalogPath + $suffix)) { throw "Catalogo potencialmente em uso: $suffix presente. Nenhum lock sera removido." }
    }
}
function Source-Entries {
    $found = [Collections.Generic.List[object]]::new()
    $catalog = Get-Item -LiteralPath $catalogPath -Force -ErrorAction Stop
    if ($catalog.PSIsContainer) { throw 'O arquivo de catalogo e uma pasta.' }
    $found.Add($catalog)
    if (Test-Path -LiteralPath $companionPath) {
        $queue = [Collections.Generic.Queue[string]]::new()
        $companion = Get-Item -LiteralPath $companionPath -Force
        if ($companion.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Companheiro reparse point nao suportado.' }
        if ($companion.PSIsContainer) { $queue.Enqueue($companion.FullName) } else { $found.Add($companion) }
        while ($queue.Count) {
            foreach ($entry in @(Get-ChildItem -LiteralPath ($queue.Dequeue()) -Force -ErrorAction Stop)) {
                if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Encontrado reparse point no pacote; coleta interrompida.' }
                if ($entry.PSIsContainer) { $queue.Enqueue($entry.FullName) } else { $found.Add($entry) }
            }
        }
    }
    foreach ($entry in $found.ToArray() | Sort-Object FullName) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fonte reparse point nao suportada.' }
        [pscustomobject]@{
            Source = $entry.FullName; Relative = $entry.FullName.Substring($sourceRoot.Length + 1)
            Bytes = $entry.Length; LastWriteTicks = $entry.LastWriteTimeUtc.Ticks; LastWriteUtc = $entry.LastWriteTimeUtc.ToString('o')
        }
    }
}
Assert-CatalogClosed
$before = @(Source-Entries)
if (-not $before.Count) { throw 'Nenhum arquivo de origem encontrado.' }
$runName = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$basePath = if ($FixtureTest) { Join-Path $targetRoot 'evidence\qa-fixtures\snapshots' } else { Join-Path $targetRoot 'private\snapshots' }
$snapshotRoot = [IO.Path]::GetFullPath((Join-Path $basePath $runName))
$expectedPrefix = [IO.Path]::GetFullPath($basePath).TrimEnd('\') + '\'
if (-not $snapshotRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino fora da pasta de snapshots.' }
if (Test-Path -LiteralPath $snapshotRoot) { throw 'Destino ja existente; sobrescrita recusada.' }
[IO.Directory]::CreateDirectory((Join-Path $snapshotRoot 'original')) | Out-Null
$handles = [Collections.Generic.List[object]]::new()
$copied = [Collections.Generic.List[object]]::new()
$receipt = [ordered]@{
    Schema = 'mizin-lightroom.snapshot/1'; StartedUtc = [DateTime]::UtcNow.ToString('o'); FinishedUtc = $null
    Status = 'INCOMPLETE'; SourceDirectory = $sourceRoot; CatalogName = $CatalogName; SnapshotRoot = $snapshotRoot
    SourceWriteOperations = 0; ReadOnlySharingHeld = $false; RuntimeFilesAbsentBeforeAndAfter = $false
    SourceMetadataStable = $false; AllCopyHashesVerified = $false; Files = @(); Error = $null
    Excluded = @('Previews.lrdata', 'Smart Previews.lrdata', 'Helper.lrdata', 'Sync.lrdata', 'RAW files')
}
try {
    # Abrir todas as fontes primeiro evita copiar parcialmente um catalogo aberto para escrita.
    foreach ($entry in $before) {
        $reader = [IO.FileStream]::new($entry.Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read, 4194304, [IO.FileOptions]::SequentialScan)
        $handles.Add([pscustomobject]@{ Entry = $entry; Stream = $reader })
    }
    $receipt.ReadOnlySharingHeld = $true
    Assert-CatalogClosed
    $buffer = [byte[]]::new(4194304)
    $progressClock = [Diagnostics.Stopwatch]::StartNew()
    $totalCopied = [long]0
    foreach ($item in $handles) {
        $entry = $item.Entry
        $destination = Join-Path (Join-Path $snapshotRoot 'original') $entry.Relative
        [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
        $writer = [IO.FileStream]::new($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 4194304)
        $sourceHasher = [Security.Cryptography.SHA256]::Create()
        $fileBytes = [long]0
        try {
            while (($bytesRead = $item.Stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $writer.Write($buffer, 0, $bytesRead)
                [void]$sourceHasher.TransformBlock($buffer, 0, $bytesRead, $null, 0)
                $fileBytes += $bytesRead
                $totalCopied += $bytesRead
                if ($progressClock.Elapsed.TotalSeconds -ge 15) {
                    Write-Host ('Copiados {0:N0} MiB; fontes abertas somente para leitura.' -f ($totalCopied / 1MB))
                    $progressClock.Restart()
                }
            }
            [void]$sourceHasher.TransformFinalBlock([byte[]]::new(0), 0, 0)
            $sourceHash = [BitConverter]::ToString($sourceHasher.Hash).Replace('-', '').ToLowerInvariant()
            $writer.Flush($true)
        } finally { $writer.Dispose(); $sourceHasher.Dispose() }
        if ($fileBytes -ne $entry.Bytes) { throw 'O tamanho lido nao corresponde ao inventario inicial.' }
        $copyHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($sourceHash -cne $copyHash) { throw 'SHA-256 da copia nao corresponde aos bytes lidos da origem.' }
        [IO.File]::SetLastWriteTimeUtc($destination, [DateTime]::Parse($entry.LastWriteUtc).ToUniversalTime())
        [IO.File]::SetAttributes($destination, ([IO.File]::GetAttributes($destination) -bor [IO.FileAttributes]::ReadOnly))
        $copied.Add([pscustomobject]@{
            Relative = $entry.Relative; Bytes = $fileBytes; LastWriteUtc = $entry.LastWriteUtc
            SourceStreamSha256 = $sourceHash; CopySha256 = $copyHash; HashMatch = $true
        })
    }
    Assert-CatalogClosed
    $after = @(Source-Entries)
    $beforeFingerprint = @($before | ForEach-Object { '{0}|{1}|{2}' -f $_.Relative, $_.Bytes, $_.LastWriteTicks }) -join "`n"
    $afterFingerprint = @($after | ForEach-Object { '{0}|{1}|{2}' -f $_.Relative, $_.Bytes, $_.LastWriteTicks }) -join "`n"
    if ($beforeFingerprint -cne $afterFingerprint) { throw 'Conjunto ou metadados das fontes mudaram durante a coleta.' }
    $receipt.RuntimeFilesAbsentBeforeAndAfter = $true
    $receipt.SourceMetadataStable = $true
    $receipt.AllCopyHashesVerified = $true
    $receipt.Status = 'VERIFIED'
} catch {
    $receipt.Status = 'FAILED_PRESERVED_PARTIAL_COPY'
    $receipt.Error = $_.Exception.Message
    throw
} finally {
    foreach ($item in $handles) { $item.Stream.Dispose() }
    $receipt.FinishedUtc = [DateTime]::UtcNow.ToString('o')
    $receipt.Files = @($copied.ToArray())
    $receipt | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $snapshotRoot 'snapshot.json') -Encoding utf8
    @($copied.ToArray() | ForEach-Object { '{0} *original/{1}' -f $_.CopySha256, $_.Relative.Replace('\', '/') }) | Set-Content -LiteralPath (Join-Path $snapshotRoot 'SHA256SUMS.txt') -Encoding ascii
    Write-Output (Join-Path $snapshotRoot 'snapshot.json')
}
