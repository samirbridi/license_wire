<#
.SYNOPSIS
    Publica o build mais recente do CRISPIX no canal de rede E no canal de internet
    (Cloudflare R2 + Pages). Permite que o atualizador detecte e instale a nova versao
    de qualquer lugar com internet, com a rede local como reserva.

.DESCRIPTION
    1. Le private\deliveries\latest.json (gerado pelo build_lightroom_local.py).
    2. Canal de rede (como antes): copia ZIP, SHA256SUMS.txt, LEIA-ME.md e latest.json
       para \\192.168.1.58\Users\Public\Documents\MizinLightroomPilot; valida o hash no
       destino antes de considerar publicado.
    3. Canal de internet (novo, pulado com -SkipInternet): envia o ZIP para o bucket R2
       crispix-updates via wrangler, monta um latest.json com downloadUrl apontando para
       o arquivo publico do R2, e publica esse manifesto em https://crispixlr.pages.dev
       via 'wrangler pages deploy' -- sem reenviar o site inteiro, so o manifesto.

.PARAMETER Destination
    Caminho do canal de rede.
    Padrao: \\192.168.1.58\Users\Public\Documents\MizinLightroomPilot

.PARAMETER R2Bucket
    Bucket R2 publico onde o ZIP e hospedado para download pela internet.
    Padrao: crispix-updates

.PARAMETER R2PublicUrl
    URL publica (r2.dev) do bucket acima.
    Padrao: https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev

.PARAMETER PagesProject
    Projeto Cloudflare Pages onde o manifesto da internet e publicado.
    Padrao: crispixlr

.PARAMETER SiteSourceDir
    Pasta com os arquivos atuais do site (index.html etc.), copiada junto com o manifesto
    na publicacao -- cada deploy do Pages substitui TODO o conteudo do projeto, entao nunca
    publicar so o latest.json sozinho ou o deploy anterior (o site) desaparece.
    Padrao: reconstructed\branding\site (relativo a raiz deste alvo)

.PARAMETER SkipInternet
    Publica somente no canal de rede local, sem tocar em R2/Pages.
#>

[CmdletBinding()]
param(
    [string]$Destination = '\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot',
    [string]$R2Bucket = 'crispix-updates',
    [string]$R2PublicUrl = 'https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev',
    [string]$PagesProject = 'crispixlr',
    [string]$SiteSourceDir = '',
    [switch]$SkipInternet,
    # Versao do wrangler ja instalada/logada. Sem fixar, 'npx --no-install' tenta a mais nova
    # do npm e falha quando ela nao esta no cache (ocorreu na publicacao do build 0037).
    [string]$WranglerVersion = '4.152.0'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$targetRoot = Split-Path -Parent $PSScriptRoot
$deliveriesRoot = Join-Path $targetRoot 'private\deliveries'
$latestPath = Join-Path $deliveriesRoot 'latest.json'

if (-not (Test-Path -LiteralPath $latestPath)) {
    throw "Nenhum manifesto latest.json encontrado em $deliveriesRoot. Gere uma versao primeiro com build_lightroom_local.py."
}

$latest = Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $latest.version
$folderName = $latest.deliveryFolder
$archiveName = $latest.archiveName
$expectedSha = $latest.archiveSha256

$sourceDir = Join-Path $deliveriesRoot $folderName
$sourceArchive = Join-Path $sourceDir $archiveName

if (-not (Test-Path -LiteralPath $sourceArchive)) {
    throw "Arquivo do pacote nao encontrado em $sourceArchive."
}

Write-Host "[PUBLICACAO] Publicando CRISPIX $version ..." -ForegroundColor Cyan
Write-Host "[PUBLICACAO] Origem:  $sourceArchive"
Write-Host "[PUBLICACAO] Destino: $Destination"

if (-not (Test-Path -LiteralPath $Destination)) {
    throw "Destino inacessivel: $Destination. Verifique a rede local."
}

# Criar subpasta com o nome da entrega no destino
$destFolder = Join-Path $Destination $folderName
if (-not (Test-Path -LiteralPath $destFolder)) {
    New-Item -ItemType Directory -Path $destFolder -Force | Out-Null
}

# Copiar arquivos da entrega
foreach ($name in @($archiveName, 'LEIA-ME.md', 'SHA256SUMS.txt', 'package.json')) {
    $src = Join-Path $sourceDir $name
    if (Test-Path -LiteralPath $src) {
        Write-Host "  Copiando $name ..."
        Copy-Item -LiteralPath $src -Destination (Join-Path $destFolder $name) -Force
    }
}

# Copiar o ZIP tambem para a raiz do canal como fallback
Write-Host "  Copiando $archiveName para raiz do canal ..."
Copy-Item -LiteralPath $sourceArchive -Destination (Join-Path $Destination $archiveName) -Force

# Validar hash no destino
Write-Host "  Validando SHA-256 no destino ..." -ForegroundColor Cyan
$copiedArchive = Join-Path $destFolder $archiveName
$destSha = (Get-FileHash -LiteralPath $copiedArchive -Algorithm SHA256).Hash.ToLower()
if ($destSha -ne $expectedSha.ToLower()) {
    throw "Hash no destino diverge! Esperado: $expectedSha, Obtido: $destSha"
}

# Copiar o manifesto latest.json para a raiz do canal por ultimo (ato atomico de publicacao)
Write-Host "  Atualizando latest.json no canal ..."
Copy-Item -LiteralPath $latestPath -Destination (Join-Path $Destination 'latest.json') -Force

Write-Host ""
Write-Host "[PUBLICACAO] Canal de rede concluido!" -ForegroundColor Green
Write-Host "  Versao publicada (rede): $version" -ForegroundColor Green

if ($SkipInternet) {
    Write-Host ""
    Write-Host "[PUBLICACAO] Canal de internet pulado (-SkipInternet)." -ForegroundColor Yellow
    Write-Host "  O plugin instalado detectara esta versao via 'Verificar atualizacoes' (rede local)." -ForegroundColor Green
    return
}

Write-Host ""
Write-Host "[PUBLICACAO] Publicando no canal de internet (R2 + Pages) ..." -ForegroundColor Cyan

# Enviar o ZIP ao bucket R2 publico. --remote e obrigatorio: sem ele o wrangler grava
# no simulador de desenvolvimento local, nao no bucket real da nuvem.
Write-Host "  Enviando $archiveName para o bucket R2 '$R2Bucket' (pode levar alguns minutos) ..."
& npx --no-install "wrangler@$WranglerVersion" r2 object put "$R2Bucket/$archiveName" --file="$sourceArchive" --content-type="application/zip" --remote
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao enviar o pacote para o R2. O canal de rede ja foi publicado; o canal de internet ficou desatualizado."
}

$downloadUrl = "$R2PublicUrl/$archiveName"

# Confirmar o arquivo no R2 batendo tamanho E hash antes de apontar o manifesto publico
# para ele -- nunca publicar um downloadUrl sem verificar o que ele realmente serve.
Write-Host "  Validando o arquivo publicado no R2 ..." -ForegroundColor Cyan
$r2TempFile = Join-Path $env:TEMP ("crispix-r2-verify-" + [Guid]::NewGuid().ToString('n') + '.zip')
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $r2TempFile -TimeoutSec 300
    $r2Sha = (Get-FileHash -LiteralPath $r2TempFile -Algorithm SHA256).Hash.ToLower()
    if ($r2Sha -ne $expectedSha.ToLower()) {
        throw "Hash no R2 diverge! Esperado: $expectedSha, Obtido: $r2Sha. O canal de internet NAO foi publicado com este manifesto."
    }
    Write-Host "  Integridade confirmada no R2 (SHA-256 confere)." -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $r2TempFile) { Remove-Item -LiteralPath $r2TempFile -Force -ErrorAction SilentlyContinue }
}

# Montar o manifesto publico (mesmo schema do canal de rede, + downloadUrl) e publicar
# no site via wrangler pages deploy, enviando so este arquivo (nao o site inteiro).
$internetManifest = [ordered]@{
    schema = $latest.schema
    version = $version
    build = $latest.build
    publishedUtc = $latest.publishedUtc
    archiveName = $archiveName
    archiveSha256 = $expectedSha
    archiveBytes = $latest.archiveBytes
    deliveryFolder = $folderName
    downloadUrl = $downloadUrl
}
if ([string]::IsNullOrWhiteSpace($SiteSourceDir)) {
    $SiteSourceDir = Join-Path $targetRoot 'reconstructed\branding\site'
}
if (-not (Test-Path -LiteralPath (Join-Path $SiteSourceDir 'index.html'))) {
    throw "SiteSourceDir ($SiteSourceDir) nao contem index.html. Cada deploy do Pages substitui TODO o conteudo do projeto; publicar sem o site junto apagaria a pagina ja no ar. Abortado antes de publicar."
}

$manifestStageDir = Join-Path $env:TEMP ("crispix-manifest-stage-" + [Guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $manifestStageDir -Force | Out-Null
try {
    # Copia o site atual inteiro para a pasta de staging -- NUNCA publicar so o manifesto
    # sozinho, ou o deploy anterior (a pagina) desaparece do projeto.
    Copy-Item -LiteralPath (Join-Path $SiteSourceDir '*') -Destination $manifestStageDir -Recurse -Force
    $manifestStagePath = Join-Path $manifestStageDir 'latest.json'
    # UTF-8 SEM BOM: 'Set-Content -Encoding UTF8' do PowerShell 5.1 grava BOM, e com ele nem o
    # Json.lua do plugin nem o ConvertFrom-Json do atualizador liam o manifesto da internet.
    [System.IO.File]::WriteAllText($manifestStagePath, ($internetManifest | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding $false))

    Write-Host "  Publicando site + manifesto em https://$PagesProject.pages.dev/ ..."
    & npx --no-install "wrangler@$WranglerVersion" pages deploy $manifestStageDir --project-name=$PagesProject --branch=main --commit-dirty=true
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao publicar no Cloudflare Pages. O arquivo ja esta no R2, mas o site ainda aponta para a versao anterior."
    }
} finally {
    if (Test-Path -LiteralPath $manifestStageDir) { Remove-Item -LiteralPath $manifestStageDir -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host "[PUBLICACAO] Concluido com sucesso nos dois canais!" -ForegroundColor Green
Write-Host "  Versao publicada: $version" -ForegroundColor Green
Write-Host "  Internet: https://$PagesProject.pages.dev/latest.json -> $downloadUrl" -ForegroundColor Green
Write-Host "  Rede local: $Destination" -ForegroundColor Green
Write-Host "  O plugin instalado agora detectara esta versao via 'Verificar atualizacoes' (internet, com reserva na rede local)." -ForegroundColor Green
Write-Host "  Para atualizar em 1 clique na maquina de edicao: execute Atualizar-CRISPIX.cmd na pasta do plugin." -ForegroundColor Green
