# Empacota o app nativo PLUGNEX (Plugnex.exe, C++/Win32) para distribuição
# pela própria loja, no mesmo padrão de nome (hash de origem+chave) que
# server.mjs espera em `managerFile` para liberar o link de download.
#
# Sucede o antigo package.ps1, que compilava o Gerenciador Mizin Wire em
# C#/.NET Framework (manager/Manager.cs + ManagerPanel.cs, via csc.exe).
# Esses arquivos .cs permanecem no repositório como referência histórica
# da reversão de engenharia original, mas não são mais o cliente
# distribuído -- o build atual é reconstructed/plugnex-app/build.ps1.
#
# Requer PowerShell 7+ ([Convert]::ToHexString abaixo não existe no
# Windows PowerShell 5.1) -- mesmo requisito do script original, só agora
# verificado explicitamente. A etapa de compilação em si
# (reconstructed/plugnex-app/build.ps1, chamada abaixo) funciona em
# PowerShell 5.1 e pode ser executada standalone nesse caso.
param(
    [uri]$Origin = 'http://127.0.0.1:4381',
    [string]$DataDirectory,
    [switch]$IncludeTestEffect
)
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Este script requer PowerShell 7+ (pwsh). Em PowerShell 5.1, compile diretamente com reconstructed\plugnex-app\build.ps1.' }
$root=Split-Path $PSScriptRoot -Parent
if (!$DataDirectory) { $DataDirectory=Join-Path $root 'runtime' }
$base=$Origin.GetLeftPart([UriPartial]::Authority)
if ($Origin.Scheme -ne 'https' -and !($Origin.Scheme -eq 'http' -and $Origin.IsLoopback)) { throw 'Use HTTPS ou localhost.' }
if ($Origin.UserInfo) { throw 'Use uma origem sem credenciais.' }
$key=(Invoke-RestMethod "$base/api/wire/issuer").publicBlob
if ([Convert]::FromBase64String($key).Length -ne 72) { throw 'Chave CNG inesperada.' }
$sha=[Security.Cryptography.SHA256]::Create()
$tag=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($base+'|'+$key))).ToLowerInvariant()
$work=New-Item -ItemType Directory -Force (Join-Path $DataDirectory ('build-plugnex-'+[guid]::NewGuid().ToString('N')))

$appRoot = Join-Path $root 'reconstructed\plugnex-app'
& (Join-Path $appRoot 'build.ps1') -Origin $Origin -OutDir $work
$out = Join-Path $work 'Plugnex.exe'
if (!(Test-Path -LiteralPath $out)) { throw 'build.ps1 não produziu Plugnex.exe.' }

$guide=Join-Path $PSScriptRoot 'PLUGNEX-APP-USO.txt'
$tempZip=Join-Path $work 'app.zip'
Compress-Archive -LiteralPath $out,$guide -DestinationPath $tempZip
$package=Join-Path $DataDirectory ("Plugnex-App-$tag.zip")
if ($IncludeTestEffect) {
    if (!$Origin.IsLoopback) {throw 'O efeito de homologação deve ser gerado para a loja local.'}
    $wire=Join-Path $env:ProgramFiles 'Resolume Wire/Wire.exe'
    $source=Join-Path $work 'Plugnex Check.wire'
    $bundle=Join-Path $work 'Plugnex Check.cwired'
    & (Join-Path $PSScriptRoot 'make-probe.ps1') -OutputPath $source
    $process=Start-Process $wire -ArgumentList ('compile "'+$source+'" --output "'+$bundle+'"') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $bundle) -or (Get-Item $bundle).Length -lt 128) {throw 'Wire não produziu o efeito compilado.'}
    $plugins=New-Item -Type Directory -Force (Join-Path $DataDirectory 'wire-plugins')
    [IO.File]::Move($bundle,(Join-Path $plugins 'outliner--wire-preview-1.cwired'),$true)
}
[IO.File]::Move($tempZip,$package,$true)
Get-Item $package | Select-Object FullName,Length
