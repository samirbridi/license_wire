param(
    [string]$Python='C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe',
    [string]$QtRoot,
    [string]$VcRedist='C:\Program Files\Microsoft Visual Studio\18\Community\VC\Redist\MSVC\14.51.36231\vc_redist.x64.exe'
)
$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
if(-not $QtRoot){$QtRoot=Join-Path $playoutRoot 'binaries/qt/6.10.2/msvc2022_64'}
$compilerRoot=Join-Path $playoutRoot 'binaries/packaging/nsis-3.13-tool/nsis-3.13'
if(-not(Test-Path -LiteralPath (Join-Path $compilerRoot 'makensis.exe'))){throw 'Run scripts/setup-packaging.ps1 first.'}
$signature=Get-AuthenticodeSignature -LiteralPath $VcRedist
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {throw 'The official Microsoft VC++ redistributable signature is not valid.'}
$release=& $Python (Join-Path $PSScriptRoot 'package.py') stage --qt-root $QtRoot --vc-redist $VcRedist --nsis-root $compilerRoot
if($LASTEXITCODE -ne 0){throw 'Package staging failed.'}
$release=([string]$release).Trim()
& (Join-Path $compilerRoot 'makensis.exe') /WX /V3 "/DGENERATED=$release\payload.nsh" (Join-Path $playoutRoot 'packaging/windows.nsi')
if($LASTEXITCODE -ne 0){throw 'NSIS compilation failed; staged files retained.'}
& $Python (Join-Path $PSScriptRoot 'package.py') finish --release $release
if($LASTEXITCODE -ne 0){throw 'Package inventory validation failed.'}
