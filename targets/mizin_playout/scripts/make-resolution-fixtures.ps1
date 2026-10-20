param([Parameter(Mandatory=$true)][string]$FFmpeg)
$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$fixtureRoot=Join-Path $playoutRoot 'binaries/resolution-fixtures'
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
foreach($resolution in @('1920x1080','3840x2160')){
    $fixture=Join-Path $fixtureRoot ('h264-'+$resolution+'.mp4')
    if(Test-Path -LiteralPath $fixture){throw "Preserve existing fixture: $fixture"}
    & $FFmpeg -hide_banner -loglevel error -f lavfi -i "testsrc2=size=$($resolution):rate=30" -f lavfi -i 'sine=frequency=440:sample_rate=48000' -t 2 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac $fixture
    if($LASTEXITCODE -ne 0){throw "Resolution fixture failed: $resolution"}
}
$hashes=@(Get-Content -LiteralPath (Join-Path $playoutRoot 'binaries/SHA256SUMS.txt') -Encoding utf8)
foreach($fixture in Get-ChildItem -LiteralPath $fixtureRoot -File){$hashes+="$((Get-FileHash -LiteralPath $fixture.FullName -Algorithm SHA256).Hash.ToLower())  resolution-fixtures/$($fixture.Name)"}
$hashes | Set-Content -LiteralPath (Join-Path $playoutRoot 'binaries/SHA256SUMS.txt') -Encoding utf8
