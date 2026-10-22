param(
    [string]$Python = 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe',
    [string]$QtRoot,
    [string]$NdiSdkRoot = 'C:\Program Files\NDI\NDI 6 SDK',
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
    Copy-Item -LiteralPath (Join-Path $playoutBuild 'MizinUpdater.exe') -Destination $playoutDist -Force
    & (Join-Path $QtRoot 'bin\windeployqt.exe') --release --no-translations (Join-Path $playoutDist 'MizinPlayout.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Native dependency deployment failed' }
    $ndiDll=Join-Path $NdiSdkRoot 'Bin/x64/Processing.NDI.Lib.x64.dll'
    $ndiSignature=Get-AuthenticodeSignature -LiteralPath $ndiDll
    if($ndiSignature.Status -ne 'Valid' -or $ndiSignature.SignerCertificate.Subject -notmatch 'Newtek|Vizrt|NDI'){throw 'Official NDI runtime signature is not valid.'}
    Copy-Item -LiteralPath $ndiDll -Destination $playoutDist -Force
    $ndiNotices=Join-Path $playoutDist 'licenses/ndi';New-Item -ItemType Directory -Path $ndiNotices -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $NdiSdkRoot 'Bin/x64/Processing.NDI.Lib.Licenses.txt') -Destination $ndiNotices -Force
    Copy-Item -LiteralPath (Join-Path $NdiSdkRoot 'NDI SDK License Agreement.pdf') -Destination $ndiNotices -Force
    $omtRuntime = Join-Path $playoutRoot 'binaries/network-sdk/omt-1.0.0.19/Libraries/Winx64'
    if(Test-Path -LiteralPath $omtRuntime){
        foreach($dll in @('libomt.dll','libvmx.dll')){Copy-Item -LiteralPath (Join-Path $omtRuntime $dll) -Destination $playoutDist -Force}
        $notices=Join-Path $playoutDist 'licenses/omt';New-Item -ItemType Directory -Path $notices -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $playoutRoot 'reconstructed/third_party/omt/LICENSE.txt') -Destination $notices -Force
    } else {Write-Warning 'OMT runtime not installed; run scripts/setup-network-runtime.ps1 to enable OMT.'}
    & $Python (Join-Path $PSScriptRoot 'version.py') --status PASS
    Get-FileHash -LiteralPath (Join-Path $playoutDist 'MizinPlayout.exe') -Algorithm SHA256
} catch {
    & $Python (Join-Path $PSScriptRoot 'version.py') --status FAIL
    throw
}
