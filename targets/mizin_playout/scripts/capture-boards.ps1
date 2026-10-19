$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$playoutExe=Join-Path $playoutRoot 'dist\MizinPlayout.exe'
$boards=Join-Path $playoutRoot 'design\boards'
$state=Join-Path $playoutRoot 'binaries\board-state'
New-Item -ItemType Directory -Path $boards -Force | Out-Null
# A fresh native window per board avoids stale backing-store capture artifacts.
foreach($board in @(@{page=0;lang='en'},@{page=2;lang='en'},@{page=1;lang='en'},@{page=0;lang='pt-BR'})){
    $captureArgs='--board --lang '+$board.lang+' --capture-page '+$board.page+' --capture-dir "'+$boards+'" --state-dir "'+$state+'"'
    $capture=Start-Process -FilePath $playoutExe -ArgumentList $captureArgs -WindowStyle Hidden -Wait -PassThru
    if($capture.ExitCode -ne 0){throw "Native capture failed: $($capture.ExitCode)"}
}
Get-ChildItem -LiteralPath $boards -Filter '*.png' | Select-Object Name,Length
