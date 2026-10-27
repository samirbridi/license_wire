<#
.SYNOPSIS
    Guardião Permanente Invisível do Mizin Home Portal (Zero Janela CMD)
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
    $listening = Get-NetTCPConnection -LocalPort 19860 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
        if (-not $nodeExe) { $nodeExe = "C:\Program Files\nodejs\node.exe" }
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $nodeExe
        $psi.Arguments = "server.mjs"
        $psi.WorkingDirectory = $portalDir
        $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $psi.CreateNoWindow = $true
        $psi.UseShellExecute = $false
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        Start-Sleep -Seconds 5
    }
    Start-Sleep -Seconds 8
}
