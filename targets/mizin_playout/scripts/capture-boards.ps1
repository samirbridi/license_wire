param([string]$Directory,[int]$Width=1600,[int]$Height=1000,[switch]$MultiOutput)
$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$playoutExe=Join-Path $playoutRoot 'dist\MizinPlayout.exe'
$boards=Join-Path $playoutRoot 'design\boards'
if($Directory){$boards=$Directory}
$state=Join-Path $playoutRoot 'binaries\board-state'
New-Item -ItemType Directory -Path $boards -Force | Out-Null
# A fresh native window per board avoids stale backing-store capture artifacts.
foreach($board in @(@{page=0;lang='en'},@{page=3;lang='en'},@{page=2;lang='en'},@{page=0;lang='pt-BR'},@{page=1;lang='en'},@{page=1;lang='pt-BR'},@{page=4;lang='en'},@{page=4;lang='pt-BR'},@{page=3;lang='en';digital=$true},@{page=3;lang='pt-BR';digital=$true})){
    $captureArgs='--board --lang '+$board.lang+' --capture-page '+$board.page+' --capture-size '+$Width+'x'+$Height+' --capture-dir "'+$boards+'" --state-dir "'+$state+'"'
    if($board.digital){$captureArgs+=' --capture-digital'}
    if($MultiOutput){$captureArgs+=' --board-multi-output'}
    $capture=Start-Process -FilePath $playoutExe -ArgumentList $captureArgs -WindowStyle Hidden -Wait -PassThru
    if($capture.ExitCode -ne 0){throw "Native capture failed: $($capture.ExitCode)"}
}
foreach($locale in @('en','pt-BR')){
    $captureArgs='--board --lang '+$locale+' --capture-diagnostics --capture-size '+$Width+'x'+$Height+' --capture-dir "'+$boards+'" --state-dir "'+$state+'"'
    if($MultiOutput){$captureArgs+=' --board-multi-output'}
    $capture=Start-Process -FilePath $playoutExe -ArgumentList $captureArgs -WindowStyle Hidden -Wait -PassThru
    if($capture.ExitCode -ne 0){throw "Native diagnostics capture failed: $($capture.ExitCode)"}
}
Get-ChildItem -LiteralPath $boards -Filter '*.png' | Select-Object Name,Length
