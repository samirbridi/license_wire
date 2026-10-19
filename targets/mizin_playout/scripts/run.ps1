param([switch]$Board,[switch]$Cpu,[ValidateSet('en','pt-BR')][string]$Language)
$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$playoutExe=Join-Path $playoutRoot 'dist\MizinPlayout.exe'
if(-not(Test-Path -LiteralPath $playoutExe)){throw 'Build the native application with scripts/build.ps1 first.'}
$playoutArgs=@('--state-dir',(Join-Path $playoutRoot 'binaries\runtime-state'))
if($Board){$playoutArgs+='--board'}
if($Cpu){$playoutArgs+='--cpu'}
if($Language){$playoutArgs+=@('--lang',$Language)}
& $playoutExe @playoutArgs
