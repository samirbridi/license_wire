param([Parameter(Mandatory=$true)][string]$FFmpeg)
$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'binaries\fixtures'
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$cases = @(
    @{name='01-h264.mp4';codec='libx264';extra=@('-preset','ultrafast','-pix_fmt','yuv420p')},
    @{name='02-hevc.mp4';codec='libx265';extra=@('-preset','ultrafast','-pix_fmt','yuv420p','-x265-params','log-level=error:pools=1:frame-threads=1')},
    @{name='03-h264.mkv';codec='libx264';extra=@('-preset','ultrafast','-pix_fmt','yuv420p')},
    @{name='04-mjpeg.avi';codec='mjpeg';extra=@('-pix_fmt','yuvj420p')},
    @{name='05-prores.mov';codec='prores_ks';extra=@('-profile:v','2','-pix_fmt','yuv422p10le')}
)
foreach($case in $cases){
    $fixtureArgs=@('-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v',$case.codec)
    $fixtureArgs+=$case.extra
    $fixtureArgs+=@('-c:a','pcm_s16le')
    if($case.name -match '\.(mp4|mkv)$'){$fixtureArgs=$fixtureArgs[0..($fixtureArgs.Length-3)]+@('-c:a','aac')}
    $fixtureArgs+=Join-Path $fixtureRoot $case.name
    & $FFmpeg @fixtureArgs
    if($LASTEXITCODE -ne 0){throw "Fixture failed: $($case.name)"}
}
Get-ChildItem -File -LiteralPath $fixtureRoot | ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  fixtures/$($_.Name)"} | Set-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'binaries\SHA256SUMS.txt') -Encoding utf8
Write-Output "Created $($cases.Count) synthetic fixtures."
