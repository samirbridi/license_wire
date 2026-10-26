<#
.SYNOPSIS
    Inicia o Cloudflare Tunnel para acesso externo seguro ao Mizin Home Portal
    Permite acessar de fora da rede (4G/5G/trabalho/carro) sem abrir portas no roteador.
#>

param (
    [string]$CustomDomain = "",
    [switch]$OpenUrl
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = Split-Path -Parent $scriptDir
$workspace = Split-Path -Parent (Split-Path -Parent $scriptDir)
$binDir = Join-Path $targetDir "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }
$cloudflaredExe = Join-Path $binDir "cloudflared.exe"

# 1. Verifica se cloudflared está instalado ou faz download automático
$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cfCmd) {
    $cloudflaredExe = $cfCmd.Source
} elseif (-not (Test-Path $cloudflaredExe)) {
    Write-Host "[*] Baixando Cloudflare Tunnel oficial (cloudflared.exe)..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        Invoke-WebRequest -Uri $url -OutFile $cloudflaredExe -UseBasicParsing
        Write-Host "[+] Download concluído com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "[-] Falha ao baixar cloudflared via PowerShell. Tentando winget..." -ForegroundColor Yellow
        winget install --id Cloudflare.cloudflared --silent --accept-package-agreements --accept-source-agreements
        $cloudflaredExe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    }
}

if (-not (Test-Path $cloudflaredExe) -and -not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "Não foi possível encontrar ou baixar o cloudflared.exe."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🌐 INICIANDO CLOUDFLARE TUNNEL (ACESSO EXTERNO)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Conectando porta local 19860 à rede Cloudflare..." -ForegroundColor White

$runtimeDir = Join-Path $targetDir "runtime"
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null }
$logFile = Join-Path $runtimeDir "cloudflared.log"

# Encerra túneis anteriores
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Inicia o Quick Tunnel apontando para o Mizin Portal (http://localhost:19860) com HTTP2 (TCP 443)
$args = "tunnel --protocol http2 --url http://127.0.0.1:19860 --no-autoupdate"
$proc = Start-Process -FilePath $cloudflaredExe -ArgumentList $args -RedirectStandardError $logFile -PassThru

Write-Host "[*] Aguardando atribuição do endereço público HTTPS..." -ForegroundColor Yellow

$tunnelUrl = $null
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
            $tunnelUrl = $matches[1]
            break
        }
    }
}

if ($tunnelUrl) {
    Set-Content -Path (Join-Path $runtimeDir "public_tunnel_url.txt") -Value $tunnelUrl -Encoding utf8
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "🎉 TÚNEL ATIVO COM SUCESSO!" -ForegroundColor Green
    Write-Host "Endereço Externo Seguro (HTTPS):" -ForegroundColor White
    Write-Host "👉 $tunnelUrl" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "[+] Você já pode acessar este link do seu celular (4G/5G) de qualquer lugar!" -ForegroundColor Yellow
    Write-Host "[+] O Watchdog de energia/internet está ativado." -ForegroundColor White
    
    if ($OpenUrl) {
        Start-Process $tunnelUrl
    }
} else {
    Write-Host "[!] Túnel iniciado em segundo plano (PID: $($proc.Id)). Verifique o log em: $logFile" -ForegroundColor Yellow
}
