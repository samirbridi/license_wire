<#
.SYNOPSIS
    Cria uma nova pasta de alvo isolada a partir do template padrão.

.PARAMETER TargetName
    Nome do alvo (ex: photoshop_plugin, spotify_electron, app_android)

.PARAMETER Description
    Breve descrição do software/app/plugin que será analisado

.EXAMPLE
    .\tools\new-target.ps1 -TargetName "spotify_electron" -Description "Cliente desktop Electron do Spotify"
#>

param (
    [Parameter(Mandatory = $true)]
    [string]$TargetName,

    [Parameter(Mandatory = $false)]
    [string]$Description = "Análise de Engenharia Reversa"
)

$targetSafeName = $TargetName.Trim().ToLower() -replace '[^a-z0-9_-]', '_'
$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$templateDir = Join-Path $workspaceRoot "targets\_template"
$destinationDir = Join-Path $workspaceRoot "targets\$targetSafeName"

if (Test-Path $destinationDir) {
    Write-Error "O alvo '$targetSafeName' já existe em $destinationDir!"
    exit 1
}

if (-not (Test-Path $templateDir)) {
    Write-Error "Diretório de template não encontrado em $templateDir!"
    exit 1
}

Write-Host "Criando estrutura do alvo '$targetSafeName'..." -ForegroundColor Cyan
Copy-Item -Path $templateDir -Destination $destinationDir -Recurse

$currentDate = Get-Date -Format "yyyy-MM-dd"

# Substitui placeholders nos arquivos do alvo
$filesToProcess = @("README.md", "CHANGELOG.md")
foreach ($file in $filesToProcess) {
    $filePath = Join-Path $destinationDir $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        $content = $content -replace '\{\{TARGET_NAME\}\}', $targetSafeName
        $content = $content -replace '\{\{TARGET_DESCRIPTION\}\}', $Description
        $content = $content -replace '\{\{DATE\}\}', $currentDate
        Set-Content -Path $filePath -Value $content -Encoding UTF8
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Alvo '$targetSafeName' criado com sucesso!" -ForegroundColor Green
Write-Host "Local: $destinationDir" -ForegroundColor White
Write-Host ""
Write-Host "Proximos passos recomendados:" -ForegroundColor Yellow
Write-Host "1. Copie os binarios para: targets\$targetSafeName\binaries\"
Write-Host "2. Calcule os hashes SHA256 em: targets\$targetSafeName\binaries\SHA256SUMS.txt"
Write-Host "3. Execute o REA para varredura preliminar:"
Write-Host "   npx -y rea-agents analyze targets/$targetSafeName/binaries/<arquivo> --provider ghidra --json"
Write-Host "4. Abra no Ghidra se for binario nativo ou use REA para Electron/JS/Android."
Write-Host "==========================================================" -ForegroundColor Green
