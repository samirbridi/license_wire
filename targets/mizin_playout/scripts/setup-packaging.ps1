$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$toolRoot=Join-Path $playoutRoot 'binaries/packaging'
$archive=Join-Path $toolRoot 'nsis-3.13.zip'
$expected='ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
if(-not(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){
    # SourceForge may return an HTML mirror selector. Verify before extraction.
    $download=Join-Path $toolRoot 'nsis-download.tmp'
    Invoke-WebRequest -Uri 'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.13/nsis-3.13.zip' -OutFile $download
    if((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){
        $html=Get-Content -LiteralPath $download -Raw
        $mirror=[System.Net.WebUtility]::HtmlDecode([regex]::Match($html,'https://downloads\.sourceforge\.net/project/nsis/NSIS%203/3\.13/nsis-3\.13\.zip\?ts=[^"<> ]+').Value)
        if(-not $mirror){throw 'Official NSIS download did not return the pinned archive.'}
        Invoke-WebRequest -Uri $mirror -OutFile $download
    }
    if((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'NSIS archive SHA-256 mismatch; nothing executed.'}
    Copy-Item -LiteralPath $download -Destination $archive -Force
}
$expanded=Join-Path $toolRoot 'nsis-3.13-tool'
if(-not(Test-Path -LiteralPath $expanded)){Expand-Archive -LiteralPath $archive -DestinationPath $expanded}
& (Join-Path $expanded 'nsis-3.13/makensis.exe') /VERSION
if($LASTEXITCODE -ne 0){throw 'NSIS compiler unavailable.'}
