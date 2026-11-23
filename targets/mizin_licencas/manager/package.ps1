param(
    [uri]$Origin = 'http://127.0.0.1:4381',
    [string]$DataDirectory,
    [switch]$IncludeTestEffect
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if (!$DataDirectory) { $DataDirectory=Join-Path $root 'runtime' }
$base=$Origin.GetLeftPart([UriPartial]::Authority)
if ($Origin.Scheme -ne 'https' -and !($Origin.Scheme -eq 'http' -and $Origin.IsLoopback)) { throw 'Use HTTPS ou localhost.' }
if ($Origin.UserInfo) { throw 'Use uma origem sem credenciais.' }
$key=(Invoke-RestMethod "$base/api/wire/issuer").publicBlob
if ([Convert]::FromBase64String($key).Length -ne 72) { throw 'Chave CNG inesperada.' }
$sha=[Security.Cryptography.SHA256]::Create()
$tag=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($base+'|'+$key))).ToLowerInvariant()
$work=New-Item -ItemType Directory -Force (Join-Path $DataDirectory ('build-wire-'+[guid]::NewGuid().ToString('N')))
$version=(Get-Content "$root/VERSION" -Raw).Trim()
if ($version -notmatch '^v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)$') { throw 'Versão inválida.' }
$numeric=([int]$Matches[1],[int]$Matches[2],[int]$Matches[3],[int]$Matches[4]) -join '.'
$config=Join-Path $work 'BuildConfig.cs'
@"
using System.Reflection;
[assembly: AssemblyVersion("$numeric")]
[assembly: AssemblyInformationalVersion("$version")]
namespace Mizin.Wire {
    internal static class BuildConfig {
        internal const string Origin="$base";
        internal const string PublicKey="$key";
    }
}
"@ | Set-Content -LiteralPath $config -Encoding utf8
$out=Join-Path $work 'Mizin Wire.exe'
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /utf8output /target:winexe /optimize+ /r:System.Net.Http.dll /r:System.Security.dll /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll "/out:$out" $config (Join-Path $PSScriptRoot 'Manager.cs')
if ($LASTEXITCODE -ne 0) {throw 'Falha ao compilar o gerenciador.'}
$guide=Join-Path $PSScriptRoot 'USO.txt'
$tempZip=Join-Path $work 'manager.zip'
Compress-Archive -LiteralPath $out,$guide -DestinationPath $tempZip
$package=Join-Path $DataDirectory ("Mizin-Wire-$tag.zip")
if ($IncludeTestEffect) {
    if (!$Origin.IsLoopback) {throw 'O efeito de homologação deve ser gerado para a loja local.'}
    $wire=Join-Path $env:ProgramFiles 'Resolume Wire/Wire.exe'
    $source=Join-Path $work 'Mizin Wire Check.wire'
    $bundle=Join-Path $work 'Mizin Wire Check.cwired'
    & (Join-Path $PSScriptRoot 'make-probe.ps1') -OutputPath $source
    $process=Start-Process $wire -ArgumentList ('compile "'+$source+'" --output "'+$bundle+'"') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $bundle) -or (Get-Item $bundle).Length -lt 128) {throw 'Wire não produziu o efeito compilado.'}
    $plugins=New-Item -Type Directory -Force (Join-Path $DataDirectory 'wire-plugins')
    [IO.File]::Move($bundle,(Join-Path $plugins 'outliner--wire-preview-1.cwired'),$true)
}
[IO.File]::Move($tempZip,$package,$true)
Get-Item $package | Select-Object FullName,Length
