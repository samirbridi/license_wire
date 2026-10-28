param([Parameter(Mandatory=$true)][string]$Wrangler)
$ErrorActionPreference='Stop'
$target=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release=Get-Content -LiteralPath (Join-Path $target 'release-state.json') -Raw|ConvertFrom-Json
if($release.status -ne 'built'){throw 'Conclua o build automatico antes de publicar.'}
$artifact=(Resolve-Path -LiteralPath (Join-Path $target $release.artifact)).Path
if(-not $artifact.StartsWith($target+[IO.Path]::DirectorySeparatorChar)){throw 'Artefato fora do alvo.'}
$stage=Join-Path $target ('runtime/cloudflare/pages-'+$release.build)
if(Test-Path -LiteralPath $stage){throw 'Diretorio de publicacao ja existe; preserve a tentativa anterior.'}
New-Item -ItemType Directory -Path $stage|Out-Null
Copy-Item -LiteralPath (Join-Path $artifact 'public') -Destination (Join-Path $stage 'public') -Recurse
Copy-Item -LiteralPath (Join-Path $artifact 'cloudflare/pages.mjs') -Destination (Join-Path $stage 'public/_worker.js')
$owner=Get-Content -LiteralPath (Join-Path $target 'evidence/private/cloudflare-whoami-refreshed.json') -Raw|ConvertFrom-Json
$cfg=@{name='homecams';pages_build_output_dir='./public';compatibility_date='2026-10-27';services=@(@{binding='GATEWAY';service='homecams-gateway'})}
[IO.File]::WriteAllText((Join-Path $stage 'wrangler.json'),($cfg|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding $false))
Push-Location $stage
try{
    $env:CLOUDFLARE_ACCOUNT_ID=$owner.accounts[0].id
    $ErrorActionPreference='Continue'
    & node.exe $Wrangler pages deploy public --project-name homecams --branch main --commit-dirty=true *> (Join-Path $target 'evidence/private/cloudflare-pages-deploy.log')
    $ErrorActionPreference='Stop'
    if($LASTEXITCODE -ne 0){throw 'Publicacao falhou; consulte o log privado.'}
}finally{Pop-Location}
Write-Output ('Publicado: https://homecams.pages.dev — '+$release.version)
