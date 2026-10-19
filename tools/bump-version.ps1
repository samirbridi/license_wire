<#
.SYNOPSIS
    Calcula e atualiza a versão e o changelog de acordo com a regra global:
    vX.Y.Z (build XXXX)

.PARAMETER Target
    Nome opcional do alvo específico (ex: "photoshop_plugin"). Se omitido, aplica ao workspace global.

.PARAMETER Type
    Tipo explícito de incremento: "break", "feat", "fix", "improve", "perf", "refactor" ou "auto" (lê do git).

.PARAMETER Message
    Descrição resumida da alteração para incluir no changelog.

.EXAMPLE
    .\tools\bump-version.ps1 -Type "feat" -Message "Mapeia protocolo de handshake de rede"
    .\tools\bump-version.ps1 -Target "spotify_electron" -Type "fix" -Message "Corrige offset de criptografia"
#>

param (
    [Parameter(Mandatory = $false)]
    [string]$Target,

    [Parameter(Mandatory = $false)]
    [ValidateSet("auto", "break", "feat", "fix", "improve", "perf", "refactor")]
    [string]$Type = "auto",

    [Parameter(Mandatory = $false)]
    [string]$Message = ""
)

$workspaceRoot = $PSScriptRoot | Split-Path -Parent

if ($Target) {
    $targetDir = Join-Path $workspaceRoot "targets\$Target"
    if (-not (Test-Path $targetDir)) {
        Write-Error "Alvo '$Target' não encontrado em $targetDir"
        exit 1
    }
    $versionFile = Join-Path $targetDir "VERSION"
    $changelogFile = Join-Path $targetDir "CHANGELOG.md"
} else {
    $versionFile = Join-Path $workspaceRoot "VERSION"
    $changelogFile = Join-Path $workspaceRoot "CHANGELOG.md"
}

# 1. Lê a versão atual
$currentVersionStr = "v0.1.0 (build 1)"
if (Test-Path $versionFile) {
    $currentVersionStr = (Get-Content $versionFile -Raw -Encoding UTF8).Trim()
}

# Regex para vX.Y.Z (build XXXX)
if ($currentVersionStr -match 'v(\d+)\.(\d+)\.(\d+)\s*\(build\s*(\d+)\)') {
    $X = [int]$matches[1]
    $Y = [int]$matches[2]
    $Z = [int]$matches[3]
    $build = [int]$matches[4]
} else {
    $X = 0; $Y = 1; $Z = 0; $build = 1
}

# 2. Determina o tipo de incremento
$incrementType = $Type
$commitsList = @()

if ($incrementType -eq "auto") {
    # Tenta ler commits recentes do Git
    try {
        $recentCommits = git log -n 10 --oneline 2>$null
        if ($recentCommits) {
            foreach ($line in $recentCommits) {
                $commitsList += $line
            }
        }
    } catch {}

    # Analisa commits para prioridade
    $hasBreak = $commitsList | Where-Object { $_ -match '\b(break|BREAKING CHANGE)\b' }
    $hasFeat = $commitsList | Where-Object { $_ -match '\bfeat\b' }

    if ($hasBreak) {
        $incrementType = "break"
    } elseif ($hasFeat) {
        $incrementType = "feat"
    } else {
        $incrementType = "fix"
    }
}

# 3. Aplica regra de incremento
# Build sempre incrementa +1
$build += 1

switch ($incrementType) {
    "break" {
        $X += 1
        $Y = 0
        $Z = 0
    }
    "feat" {
        $Y += 1
        $Z = 0
    }
    default {
        $Z += 1
    }
}

$newVersionStr = "v$X.$Y.$Z (build $build)"
$currentDate = Get-Date -Format "yyyy-MM-dd"

# 4. Salva novo VERSION
Set-Content -Path $versionFile -Value $newVersionStr -Encoding UTF8
Write-Host "Versão atualizada: $currentVersionStr -> $newVersionStr" -ForegroundColor Green

# 5. Atualiza CHANGELOG.md se fornecida mensagem ou gerada
if ($Message -or ($commitsList.Count -gt 0)) {
    $itemDesc = if ($Message) { "${incrementType}: $Message" } else { "Atualização automática de análise" }
    
    $sectionHeader = "### ⚡ Improvements"
    if ($incrementType -eq "break") { $sectionHeader = "### 💥 Breaking Changes" }
    elseif ($incrementType -eq "feat") { $sectionHeader = "### ✨ Features" }
    elseif ($incrementType -eq "fix") { $sectionHeader = "### 🐛 Fixes" }

    $newEntry = @"
## $newVersionStr - $currentDate

$sectionHeader
- $itemDesc

"@

    if (Test-Path $changelogFile) {
        $oldChangelog = Get-Content $changelogFile -Raw -Encoding UTF8
        # Se houver cabeçalho # CHANGELOG, insere logo abaixo
        if ($oldChangelog -match '(?s)(#\s+.*?CHANGELOG.*?\r?\n\r?\n)(.*)') {
            $updatedContent = $matches[1] + $newEntry + "`n" + $matches[2]
        } else {
            $updatedContent = "# CHANGELOG`n`n" + $newEntry + "`n" + $oldChangelog
        }
        Set-Content -Path $changelogFile -Value $updatedContent -Encoding UTF8
    } else {
        Set-Content -Path $changelogFile -Value ("# CHANGELOG`n`n" + $newEntry) -Encoding UTF8
    }
    Write-Host "Changelog atualizado em $changelogFile" -ForegroundColor Cyan
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ Sucesso! Versão: $newVersionStr" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
