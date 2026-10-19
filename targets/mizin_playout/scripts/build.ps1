param(
    [string]$Python = 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe',
    [string]$QtRoot,
    [string]$VcVars = 'C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat'
)
$ErrorActionPreference = 'Stop'
$playoutRoot = Split-Path $PSScriptRoot -Parent
if (-not $QtRoot) { $QtRoot = Join-Path $playoutRoot 'binaries\qt\6.10.2\msvc2022_64' }
$playoutBuild = Join-Path $playoutRoot 'build'
$playoutDist = Join-Path $playoutRoot 'dist'
$env:MIZIN_VCVARS = $VcVars
& $Python (Join-Path $PSScriptRoot 'version.py') --reserve
if ($LASTEXITCODE -ne 0) { throw 'Version reservation failed' }
try {
    & (Join-Path $PSScriptRoot 'compile.cmd') (Join-Path $playoutRoot 'reconstructed') $playoutBuild $QtRoot
    if ($LASTEXITCODE -ne 0) { throw 'Native compilation failed' }
    New-Item -ItemType Directory -Path $playoutDist -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $playoutBuild 'MizinPlayout.exe') -Destination $playoutDist -Force
    & (Join-Path $QtRoot 'bin\windeployqt.exe') --release --no-translations (Join-Path $playoutDist 'MizinPlayout.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Native dependency deployment failed' }
    & $Python (Join-Path $PSScriptRoot 'version.py') --status PASS
    Get-FileHash -LiteralPath (Join-Path $playoutDist 'MizinPlayout.exe') -Algorithm SHA256
} catch {
    & $Python (Join-Path $PSScriptRoot 'version.py') --status FAIL
    throw
}
