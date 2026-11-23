param(
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_-]+$')][string]$Product,
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_-]+$')][string]$Release,
    [string]$DataDirectory=(Join-Path (Split-Path $PSScriptRoot -Parent) 'runtime')
)
$ErrorActionPreference='Stop'
$source=Get-Item -LiteralPath $Project
if ($source.Extension -ne '.wire') { throw 'Selecione o projeto editável .wire.' }
$wire=Get-Item -LiteralPath (Join-Path $env:ProgramFiles 'Resolume Wire/Wire.exe')
$releases=New-Item -ItemType Directory -Force (Join-Path $DataDirectory 'wire-releases' $Product)
$destination=Join-Path $releases.FullName $Release
if (Test-Path -LiteralPath $destination) {throw 'Esta versão já existe. Escolha um novo identificador.'}
$run=[guid]::NewGuid().ToString('N')
$work=New-Item -ItemType Directory (Join-Path $releases.FullName ('.build-'+$run))
$stage=New-Item -ItemType Directory (Join-Path $work.FullName 'publish')
$probe=Join-Path $work.FullName 'prototype.wire'
# Keep derived sources beside the original so Wire resolves all relative resources.
$demoSource=Join-Path $source.DirectoryName ('.mizin-demo-'+$run+'.wire')
$licensedSource=Join-Path $source.DirectoryName ('.mizin-licensed-'+$run+'.wire')
$channel=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16)).ToLowerInvariant()
try {
    & (Join-Path $PSScriptRoot 'make-probe.ps1') -OutputPath $probe
    & node (Join-Path $PSScriptRoot 'prepare-edition.mjs') $source.FullName $probe $Product $Release $channel $demoSource $licensedSource
    if ($LASTEXITCODE -ne 0) {throw 'Falha ao preparar o grafo de distribuição.'}
    $manifest=[ordered]@{product=$Product;release=$Release;channel=$channel;sourceSha256=(Get-FileHash -LiteralPath $source.FullName).Hash;compiler=$wire.VersionInfo.FileVersion}
    foreach($kind in 'demo','licensed') {
        $inputPath=if ($kind -eq 'demo') {$demoSource} else {$licensedSource}
        $artifact=Join-Path $stage.FullName ($kind+'.cwired')
        $proc=Start-Process -FilePath $wire.FullName -ArgumentList ('compile "'+$inputPath+'" --output "'+$artifact+'"') -PassThru -WindowStyle Hidden
        if (!$proc.WaitForExit(180000)) {$proc.Kill();throw 'Tempo de compilação excedido.'}
        if ($proc.ExitCode -ne 0 -or !(Test-Path -LiteralPath $artifact) -or (Get-Item -LiteralPath $artifact).Length -lt 128) {throw "Falha ao compilar $kind."}
        $manifest[$kind+'Sha256']=(Get-FileHash -LiteralPath $artifact).Hash
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage.FullName 'manifest.json') -Encoding utf8
    [IO.Directory]::Move($stage.FullName,$destination)
    Get-Item -LiteralPath $destination
} finally {
    foreach($temporary in $demoSource,$licensedSource,$probe) {
        if(Test-Path -LiteralPath $temporary) {Remove-Item -LiteralPath $temporary}
    }
    # Remove only this run's known intermediates, never a prior published edition.
    foreach($file in 'demo.cwired','licensed.cwired','manifest.json') {
        $partial=Join-Path $stage.FullName $file
        if(Test-Path -LiteralPath $partial) {Remove-Item -LiteralPath $partial}
    }
    if ([IO.Directory]::Exists($stage.FullName)) { [IO.Directory]::Delete($stage.FullName) }
    [IO.Directory]::Delete($work.FullName)
}
