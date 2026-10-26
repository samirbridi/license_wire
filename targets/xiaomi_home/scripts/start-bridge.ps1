$ErrorActionPreference = 'Stop'
$bridgeTarget = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:19843/api/streams' -TimeoutSec 2 | Out-Null; return } catch {}
$bridgeMetadataPath = Join-Path $bridgeTarget 'runtime/qr-login/process.json'
$bridgeMetadata = Get-Content -LiteralPath $bridgeMetadataPath -Raw | ConvertFrom-Json
$bridgeExecutable = (Resolve-Path -LiteralPath $bridgeMetadata.executable).Path
$bridgeConfigPath = (Resolve-Path -LiteralPath $bridgeMetadata.config).Path
foreach ($bridgePath in @($bridgeExecutable, $bridgeConfigPath)) {
    if (-not $bridgePath.StartsWith($bridgeTarget + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho da ponte fora do alvo Xiaomi.' }
}
$bridgeConfig = Get-Content -LiteralPath $bridgeConfigPath -Raw | ConvertFrom-Json
if ($bridgeConfig.api.listen -ne '127.0.0.1:19843' -or $bridgeConfig.webrtc.listen -ne '127.0.0.1:19844' -or $bridgeConfig.rtsp.listen -ne '') { throw 'A ponte exige configuracao restrita ao computador local.' }
# Never stop another process or displace a listener on these ports.
foreach ($bridgePort in @(19843, 19844)) {
    $bridgeProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $bridgePort)
    try { $bridgeProbe.Start() } finally { $bridgeProbe.Stop() }
}
$bridgeLogBase = Join-Path $bridgeTarget ('runtime/qr-login/restart-' + [datetime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
$bridgeProcess = Start-Process -FilePath $bridgeExecutable -ArgumentList @('-config', ('"' + $bridgeConfigPath + '"')) -WorkingDirectory (Split-Path -Parent $bridgeConfigPath) -WindowStyle Hidden -RedirectStandardOutput ($bridgeLogBase + '.log') -RedirectStandardError ($bridgeLogBase + '.stderr.log') -PassThru
$bridgeMetadata.pid = $bridgeProcess.Id
$bridgeMetadata.started_utc_epoch = [datetimeoffset]::UtcNow.ToUnixTimeMilliseconds() / 1000
[IO.File]::WriteAllText($bridgeMetadataPath, ($bridgeMetadata | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
for ($bridgeAttempt = 0; $bridgeAttempt -lt 20; $bridgeAttempt++) {
    if ($bridgeProcess.HasExited) { throw 'A ponte encerrou. Confira o log privado.' }
    try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:19843/api/streams' -TimeoutSec 1 | Out-Null; return } catch { Start-Sleep -Milliseconds 250 }
}
throw 'A ponte nao respondeu. Confira o log privado.'
