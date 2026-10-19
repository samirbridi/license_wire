$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$playoutExe=Join-Path $playoutRoot 'dist\MizinPlayout.exe'
$boards=Join-Path $playoutRoot 'design\boards'
$state=Join-Path $playoutRoot 'binaries\board-state'
New-Item -ItemType Directory -Path $boards -Force | Out-Null
$captureArgs='--board --lang en --capture-dir "'+$boards+'" --state-dir "'+$state+'"'
$capture=Start-Process -FilePath $playoutExe -ArgumentList $captureArgs -WindowStyle Hidden -Wait -PassThru
if($capture.ExitCode -ne 0){throw "Native capture failed: $($capture.ExitCode)"}
Get-ChildItem -LiteralPath $boards -Filter '*.png' | Select-Object Name,Length
