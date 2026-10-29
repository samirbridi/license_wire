<#
.SYNOPSIS
    Inventario local e limitado para preparar integracao com Lightroom Classic.
.DESCRIPTION
    Le apenas metadados. Nao abre catalogos, executa plugins ou copia fotos.
    OutputDirectory deve ser nova. Compativel com PowerShell 5.1+.
#>
[CmdletBinding()]
param(
    [string[]]$CatalogDirectory,
    [string[]]$PluginDirectory,
    [string]$OutputDirectory,
    [ValidateRange(0, 4)][int]$MaxDepth = 2,
    [ValidateRange(1, 2000)][int]$MaxDirectories = 150,
    [switch]$SkipApplicationInfo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $CatalogDirectory) {
    $CatalogDirectory = @(
        (Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Lightroom'),
        (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Lightroom')
    )
}
if (-not $PluginDirectory) {
    $PluginDirectory = @((Join-Path $env:APPDATA 'Adobe\Lightroom\Modules'))
}
if (-not $OutputDirectory) {
    $runName = 'Inventario-{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
    $OutputDirectory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('MizinLightroom\' + $runName)
}
$outputFull = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputFull) { throw 'A pasta de saida ja existe. Escolha uma pasta nova para preservar os relatorios.' }

$records = [Collections.Generic.List[object]]::new()
$issues = [Collections.Generic.List[object]]::new()
$visited = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$queue = [Collections.Generic.Queue[object]]::new()
foreach ($entry in @($CatalogDirectory) + @($PluginDirectory)) {
    $queue.Enqueue([pscustomobject]@{ Path = $entry; Depth = 0 })
}
$processedDirectories = 0
$truncated = $false
while ($queue.Count -gt 0) {
    $work = $queue.Dequeue()
    if (-not $visited.Add([IO.Path]::GetFullPath($work.Path))) { continue }
    if ($processedDirectories -ge $MaxDirectories) { $truncated = $true; break }
    try {
        $directory = Get-Item -LiteralPath $work.Path -Force
        if (-not $directory.PSIsContainer) { throw 'O caminho informado nao e uma pasta.' }
        if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            $issues.Add([pscustomobject]@{ Path = $work.Path; Status = 'SKIPPED_REPARSE_POINT' })
            continue
        }
        $processedDirectories++
        # Cada nivel e validado antes de ler seus filhos; nao usa -Recurse.
        $children = @(Get-ChildItem -LiteralPath $work.Path -Force)
        foreach ($child in $children) {
            if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                $issues.Add([pscustomobject]@{ Path = $child.FullName; Status = 'SKIPPED_REPARSE_POINT' })
                continue
            }
            $kind = $null
            if ($child.Name -match '\.lrcat$') { $kind = 'CATALOG_METADATA_ONLY' }
            elseif ($child.Name -match '\.lrcat-data$') { $kind = 'CATALOG_AI_COMPANION_METADATA_ONLY' }
            elseif ($child.Name -match '\.lrcat(?:-wal|-shm|\.lock)$') { $kind = 'CATALOG_RUNTIME_COMPANION_METADATA_ONLY' }
            elseif ($child.Name -match '\.lrdata$') { $kind = 'PREVIEW_COMPANION_METADATA_ONLY' }
            elseif ($child.Name -match '\.acr$') { $kind = 'ACR_SIDECAR_METADATA_ONLY' }
            elseif ($child.Name -match '\.(?:lrdevplugin|lrplugin)$') { $kind = 'PLUGIN_DIRECTORY_METADATA_ONLY' }
            if ($kind) {
                $records.Add([pscustomobject]@{
                    Kind = $kind; Path = $child.FullName; IsDirectory = [bool]$child.PSIsContainer
                    Bytes = $(if ($child.PSIsContainer) { $null } else { $child.Length })
                    LastWriteUtc = $child.LastWriteTimeUtc.ToString('o')
                })
            }
            if ($child.PSIsContainer -and $child.Name -notmatch '\.(?:lrdata|lrcat-data|lrdevplugin|lrplugin)$') {
                if ($work.Depth -lt $MaxDepth) {
                    $queue.Enqueue([pscustomobject]@{ Path = $child.FullName; Depth = ($work.Depth + 1) })
                } else { $truncated = $true }
            }
        }
    } catch {
        $issues.Add([pscustomobject]@{ Path = $work.Path; Status = 'UNAVAILABLE'; Reason = $_.Exception.Message })
    }
}

$application = $null
if (-not $SkipApplicationInfo) {
    $exePath = Join-Path $env:ProgramFiles 'Adobe\Adobe Lightroom Classic\Lightroom.exe'
    if (Test-Path -LiteralPath $exePath -PathType Leaf) {
        $exe = Get-Item -LiteralPath $exePath
        $application = [pscustomobject]@{ Path = $exe.FullName; FileVersion = $exe.VersionInfo.FileVersion; ProductVersion = $exe.VersionInfo.ProductVersion }
    }
}
$report = [ordered]@{
    Schema = 'mizin-lightroom.inventory/1'; GeneratedUtc = [DateTime]::UtcNow.ToString('o')
    Computer = $env:COMPUTERNAME; UserProfile = $env:USERPROFILE; PowerShell = $PSVersionTable.PSVersion.ToString()
    Scope = 'FILE_METADATA_ONLY'; SourceFilesModified = $false; CatalogContentsRead = $false
    PhotoContentsRead = $false; AccountSettingsRead = $false; NetworkDiscoveryPerformed = $false
    CatalogDirectories = @($CatalogDirectory); PluginDirectories = @($PluginDirectory)
    MaxDepth = $MaxDepth; MaxDirectories = $MaxDirectories; ProcessedDirectories = $processedDirectories
    SearchTruncated = $truncated; Application = $application; Records = @($records.ToArray()); Issues = @($issues.ToArray())
    Limitations = @('Caminhos padrao podem nao ser os usados pelo editor.', 'Nao comprova completude nem consistencia de uma copia de catalogo.', 'Nao exporta estilo, fotos ou modelo do Neurapix.')
}
# Escrita apenas na pasta nova de relatorio; nunca nos caminhos examinados.
[IO.Directory]::CreateDirectory($outputFull) | Out-Null
$jsonPath = Join-Path $outputFull 'inventory.json'
$bytes = [Text.UTF8Encoding]::new($false).GetBytes(($report | ConvertTo-Json -Depth 8))
$stream = [IO.File]::Open($jsonPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
Write-Output $jsonPath
