param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]+$')][string]$RunId)
$ErrorActionPreference = 'Stop'
$probeRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$probePrivate = Join-Path $probeRoot 'evidence/private'
$probeRelease = Get-Content -Raw -LiteralPath (Join-Path $probeRoot 'release-state.json') | ConvertFrom-Json
$probeBuild = Get-Content -Raw -LiteralPath (Join-Path $probeRoot ('evidence/builds/' + $RunId + '-readonly.json')) | ConvertFrom-Json
$probeExe = [IO.Path]::GetFullPath((Join-Path $probeRoot ($probeRelease.artifact + '/diagnostics/xiaomi-readonly.exe')))
if (-not $probeExe.StartsWith($probeRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Executavel fora do alvo.' }
if (-not $probeBuild.pass -or $probeBuild.sourceCommit -ne $probeRelease.sourceCommit -or (Get-FileHash -LiteralPath $probeExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $probeBuild.sha256) { throw 'Build ou integridade diferente do esperado.' }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Este teste temporario precisa da confirmacao UAC do proprietario.' }
$probeScope = Get-Content -Raw -LiteralPath (Join-Path $probePrivate 'firewall-scope.json') | ConvertFrom-Json
$probeInventory = Get-Content -Raw -LiteralPath (Join-Path $probePrivate 'camera-sources-cn.json') | ConvertFrom-Json
$probeCameras = Get-Content -Raw -LiteralPath (Join-Path $probeRoot 'runtime/central/cameras.json') | ConvertFrom-Json
$probeCamera = @($probeCameras | Where-Object id -eq 'outdoor_pro_poste')
if ($probeCamera.Count -ne 1) { throw 'Camera nao identificada.' }
function Normalize-ProbeName([string]$Value) { return ($Value.ToLowerInvariant() -replace '[^\p{L}\p{N}]', '') }
$probeSources = @($probeInventory.sources | Where-Object { (Normalize-ProbeName $_.name) -eq (Normalize-ProbeName $probeCamera[0].name) })
if ($probeSources.Count -ne 1) { throw 'Fonte nao identificada.' }
$probeSource = [uri]$probeSources[0].url
$probeAddress = $probeSource.Host
$probeParsed = [Net.IPAddress]::Parse($probeAddress)
if ($probeParsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or -not $probeAddress.StartsWith([string]$probeScope.cameraPrefix) -or $probeSource.Query -notmatch 'model=xiaomi.camera.cw701(?:&|$)') { throw 'Endereco ou modelo fora do escopo existente.' }
$probeProfile = Get-NetConnectionProfile -InterfaceAlias $probeScope.interfaceAlias
if ($probeProfile.NetworkCategory -ne 'Private') { throw 'A interface nao esta em perfil privado; nada foi alterado.' }
if ($probeScope.localAddress -notin (Get-NetIPAddress -InterfaceAlias $probeScope.interfaceAlias -AddressFamily IPv4).IPAddress) { throw 'IP local mudou; nada foi alterado.' }
$probeRule = 'Codex-Xiaomi-ReadOnly-Temporary-' + [guid]::NewGuid().ToString('N')
$probeCreated = $false
$probeProcess = $null
$probeStamp = [datetimeoffset]::UtcNow.ToUnixTimeMilliseconds()
$probeReceipt = [ordered]@{ temporaryRule=$probeRule; sourceCommit=$probeBuild.sourceCommit; programSha256=$probeBuild.sha256; remoteCount=1; operation='device-info'; profile='Private'; removed=$false; exitCode=$null; error=$null }
try {
    New-NetFirewallRule -Name $probeRule -DisplayName 'Xiaomi read-only temporary diagnostic' -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol UDP -Program $probeExe -LocalAddress $probeScope.localAddress -RemoteAddress $probeAddress -InterfaceAlias $probeScope.interfaceAlias -EdgeTraversalPolicy Block | Out-Null
    $probeCreated = $true
    $probeProcess = Start-Process -FilePath $probeExe -ArgumentList ('--target "' + $probeRoot + '" --camera outdoor_pro_poste --read device-info') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $probePrivate ('firewall-probe-' + $probeStamp + '.stdout.json')) -RedirectStandardError (Join-Path $probePrivate ('firewall-probe-' + $probeStamp + '.stderr.log')) -PassThru
    if (-not $probeProcess.WaitForExit(45000)) { $probeProcess.Kill(); $probeProcess.WaitForExit(); throw 'Prazo do diagnostico atingido.' }
    $probeProcess.Refresh()
    $probeReceipt.exitCode = $probeProcess.ExitCode
} catch { $probeReceipt.error = $_.Exception.Message }
finally {
    if ($probeProcess -and -not $probeProcess.HasExited) { $probeProcess.Kill(); $probeProcess.WaitForExit() }
    if ($probeCreated) { Remove-NetFirewallRule -Name $probeRule; $probeReceipt.removed = $true }
    $probeReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $probePrivate ('firewall-probe-' + $probeStamp + '.receipt.json')) -Encoding utf8
}
if ($probeReceipt.error -or $probeReceipt.exitCode -ne 0) { exit 1 }
