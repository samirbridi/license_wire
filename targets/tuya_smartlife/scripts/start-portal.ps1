<#
.SYNOPSIS
    Inicia a Central Unificada Mizin Home (Tuya Local + Xiaomi Câmeras)
#>

param (
    [switch]$OpenBrowser,
    [switch]$Restart
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$portalDir = Join-Path $workspace "targets\tuya_smartlife\reconstructed\mizin-portal"
$serverScript = Join-Path $portalDir "server.mjs"

# Encerra instância anterior se porta 19860 em uso
$existingProc = Get-NetTCPConnection -LocalPort 19860 -ErrorAction SilentlyContinue
if ($existingProc) {
    Write-Host "[*] Encerrando processo anterior na porta 19860..." -ForegroundColor Yellow
    Stop-Process -Id $existingProc.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🏠 INICIANDO CENTRAL UNIFICADA MIZIN HOME" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = "C:\Program Files\nodejs\node.exe" }

$runtimeDir = Join-Path $workspace "targets\tuya_smartlife\runtime"
$stdoutLog = Join-Path $runtimeDir "server_stdout.log"
$stderrLog = Join-Path $runtimeDir "server_stderr.log"

$proc = Start-Process -FilePath $nodeExe -ArgumentList "server.mjs" -WorkingDirectory $portalDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

Write-Host "[+] Central iniciada com PID: $($proc.Id)" -ForegroundColor Green
Write-Host "[+] Acesse localmente em: http://localhost:19860" -ForegroundColor White
Write-Host "[+] Acesse na rede em: http://192.168.1.30:19860" -ForegroundColor White

if ($OpenBrowser) {
    Start-Sleep -Seconds 1
    Start-Process "http://localhost:19860"
}
