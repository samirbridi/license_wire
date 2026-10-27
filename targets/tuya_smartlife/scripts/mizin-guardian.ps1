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

$startupInfo = New-CimInstance -ClientOnly -ClassName Win32_ProcessStartup -Property @{
    ShowWindow = [uint16]0
}

while ($true) {
    $listening = Get-NetTCPConnection -LocalPort 19860 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
        if (-not $nodeExe) { $nodeExe = "C:\Program Files\nodejs\node.exe" }
        $cmdLine = "`"$nodeExe`" `"$serverMjs`""
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine = $cmdLine
            CurrentDirectory = $portalDir
            ProcessStartupInformation = $startupInfo
        } | Out-Null
        Start-Sleep -Seconds 5
    }
    Start-Sleep -Seconds 8
}
