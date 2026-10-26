param([switch]$Restart, [switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$xiaomiTarget = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$xiaomiRuntime = Join-Path $xiaomiTarget 'runtime/central'
$xiaomiProcessFile = Join-Path $xiaomiRuntime 'process.json'
$xiaomiTools = Get-Content -LiteralPath (Join-Path $xiaomiRuntime 'tool-paths.json') -Raw | ConvertFrom-Json
$xiaomiNodePath = (Get-Command node.exe).Source
& (Join-Path $PSScriptRoot 'start-bridge.ps1')
& $xiaomiNodePath (Join-Path $PSScriptRoot 'restore-bridge-streams.mjs')
if ($LASTEXITCODE -ne 0) { throw 'As fontes locais nao foram restauradas; a central atual foi preservada.' }
$xiaomiExisting = $null
if (Test-Path -LiteralPath $xiaomiProcessFile) {
    $xiaomiMetadata = Get-Content -LiteralPath $xiaomiProcessFile -Raw | ConvertFrom-Json
    $xiaomiExisting = Get-Process -Id $xiaomiMetadata.pid -ErrorAction SilentlyContinue
    if ($xiaomiExisting) {
        $xiaomiExpectedTime = ([datetimeoffset]$xiaomiMetadata.started).UtcDateTime
        if ($xiaomiExisting.Path -ne $xiaomiNodePath -or [math]::Abs(($xiaomiExisting.StartTime.ToUniversalTime() - $xiaomiExpectedTime).TotalSeconds) -gt 3) {
            throw 'O PID registrado foi reutilizado. Nao sera encerrado.'
        }
        if ($Restart) { Stop-Process -Id $xiaomiExisting.Id; $xiaomiExisting.WaitForExit(5000) | Out-Null; $xiaomiExisting = $null }
    }
}
if (-not $xiaomiExisting) {
    Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:19843/api/streams' -TimeoutSec 5 | Out-Null
    $xiaomiRelease = Get-Content -LiteralPath (Join-Path $xiaomiTarget 'release-state.json') -Raw | ConvertFrom-Json
    if ($xiaomiRelease.status -ne 'built') { throw 'Nao existe build concluido.' }
    $xiaomiEntry = Join-Path $xiaomiTarget ($xiaomiRelease.artifact + '/server.mjs')
    $xiaomiPreviousTarget = $env:MIZIN_CAMERAS_TARGET
    $xiaomiPreviousFfmpeg = $env:MIZIN_CAMERAS_FFMPEG
    try {
        $env:MIZIN_CAMERAS_TARGET = $xiaomiTarget
        $env:MIZIN_CAMERAS_FFMPEG = $xiaomiTools.ffmpeg
        $xiaomiStarted = Start-Process -FilePath $xiaomiNodePath -ArgumentList ('"' + $xiaomiEntry + '"') -WorkingDirectory $xiaomiTarget -WindowStyle Hidden -RedirectStandardOutput (Join-Path $xiaomiRuntime 'stdout.log') -RedirectStandardError (Join-Path $xiaomiRuntime 'stderr.log') -PassThru
        [pscustomobject]@{pid=$xiaomiStarted.Id;port=19845;started=$xiaomiStarted.StartTime.ToUniversalTime().ToString('o');script=$xiaomiRelease.artifact+'/server.mjs'} | ConvertTo-Json | Set-Content -LiteralPath $xiaomiProcessFile -Encoding utf8
    } finally { $env:MIZIN_CAMERAS_TARGET = $xiaomiPreviousTarget; $env:MIZIN_CAMERAS_FFMPEG = $xiaomiPreviousFfmpeg }
    $xiaomiReady = $false
    for ($xiaomiAttempt = 0; $xiaomiAttempt -lt 20; $xiaomiAttempt++) {
        try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:19845/' -TimeoutSec 1 | Out-Null; $xiaomiReady = $true; break } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $xiaomiReady) { throw 'A central nao respondeu. Consulte o log privado.' }
}
if ($OpenBrowser) {
    $xiaomiAccess = Get-Content -LiteralPath (Join-Path $xiaomiRuntime 'local-access.json') -Raw | ConvertFrom-Json
    if ([long]$xiaomiAccess.expires -lt [datetimeoffset]::UtcNow.ToUnixTimeMilliseconds()) { throw 'O link inicial expirou. O navegador ja autorizado pode usar a URL local.' }
    Start-Process -FilePath $xiaomiAccess.url
}
Write-Output 'Central disponivel em http://127.0.0.1:19845/ (acesso local autenticado).'
