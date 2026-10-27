<#
.SYNOPSIS
    Guardião Permanente do Mizin Home Portal (Independente de IDE / Antigravity)
    Mantém o servidor Node.js (19860), a ponte Xiaomi go2rtc (19843) e o Cloudflare Tunnel
    ativos continuamente em segundo plano no Windows, mesmo se o Antigravity for fechado.
#>

$ErrorActionPreference = "SilentlyContinue"
$workspace = "d:\REA - ENGENHARIA REVERSA"
$portalDir = Join-Path $workspace "targets\tuya_smartlife\reconstructed\mizin-portal"
$serverMjs = Join-Path $portalDir "server.mjs"
$runtimeDir = Join-Path $workspace "targets\tuya_smartlife\runtime"
$pidFile = Join-Path $runtimeDir "guardian.pid"

if (-not (Test-Path $runtimeDir)) {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
}

# Evita múltiplos guardiões duplicados
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($oldPid -and ($oldPid -ne $PID)) {
        $oldProc = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
        if ($oldProc -and $oldProc.ProcessName -match "powershell|pwsh") {
            exit 0
        }
    }
}
Set-Content -Path $pidFile -Value $PID -Encoding ascii

while ($true) {
    # Verifica se a porta 19860 do Mizin Home Portal está respondendo
    $listening = Get-NetTCPConnection -LocalPort 19860 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        $cmdLine = "cmd.exe /c `"cd /d `"$portalDir`" && node `"$serverMjs`"`""
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine = $cmdLine
            CurrentDirectory = $portalDir
        } | Out-Null
        Start-Sleep -Seconds 5
    }
    Start-Sleep -Seconds 8
}
