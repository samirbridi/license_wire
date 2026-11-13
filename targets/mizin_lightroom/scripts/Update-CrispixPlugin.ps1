<#
.SYNOPSIS
    Atualizador de um clique para o CRISPIX (Lightroom Classic).
    Nao apaga dados de aprendizado nem configuracoes (ficam em %AppData%\MizinLightroomLocal\).
    Nao exige desinstalar/reinstalar no Gerenciador de plug-ins: atualiza no mesmo lugar.

.DESCRIPTION
    1. Tenta o manifesto latest.json pela internet (Cloudflare Pages); se a internet estiver
       indisponivel, cai para a pasta de rede/publicacao local como no comportamento anterior.
    2. Compara com a versao instalada na pasta fixa do plugin.
    3. Se houver versao nova:
       - Confirma com o usuario (ou roda automatico com -NonInteractive);
       - Fecha o Lightroom de forma limpa (se aberto);
       - Cria backup da versao anterior (.bak);
       - Baixa (internet) ou copia (rede) o pacote e valida o hash SHA-256 ANTES de extrair;
       - Extrai o novo pacote sobre a pasta fixa do plugin;
       - Reabre o Lightroom.

.PARAMETER ManifestUrl
    Endereço do manifesto na internet.
    Padrao: https://crispixlr.pages.dev/latest.json

.PARAMETER ChannelPath
    Pasta de rede ou local, usada somente se a internet estiver indisponivel.
    Padrao: \\192.168.1.58\Users\Public\Documents\MizinLightroomPilot

.PARAMETER InstallDirectory
    Pasta permanente onde o CRISPIX.lrplugin fica instalado.
    Padrao: C:\Users\$env:USERNAME\Documents\CRISPIX.lrplugin (pasta fixa recomendada).

.PARAMETER Force
    Atualiza mesmo se a versao instalada for igual ou mais nova que a do canal.

.PARAMETER NonInteractive
    Nao pede confirmacao; fecha o Lightroom e atualiza direto.
#>

[CmdletBinding()]
param(
    [string]$ManifestUrl = 'https://crispixlr.pages.dev/latest.json',
    [string]$ChannelPath = '\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot',
    [string]$InstallDirectory = "$env:USERPROFILE\Documents\CRISPIX.lrplugin",
    [switch]$Force,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) {
    Write-Host "[CRISPIX] $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "[CRISPIX] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "[CRISPIX] AVISO: $msg" -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host "[CRISPIX] ERRO: $msg" -ForegroundColor Red
}

try {
    Write-Step "Consultando canal de atualizacao pela internet ($ManifestUrl) ..."
    $manifest = $null
    $usingInternet = $false
    try {
        $response = Invoke-WebRequest -Uri $ManifestUrl -TimeoutSec 15 -UseBasicParsing
        $manifest = $response.Content | ConvertFrom-Json
        $usingInternet = $true
        Write-Success "Canal de internet acessivel."
    } catch {
        Write-Warn "Canal de internet indisponivel ($($_.Exception.Message)). Tentando rede local..."
    }

    if (-not $manifest) {
        Write-Step "Consultando canal de rede local em $ChannelPath ..."
        if (-not (Test-Path -LiteralPath $ChannelPath)) {
            throw "Nenhum canal disponivel: internet indisponivel e pasta de rede inacessivel ($ChannelPath)."
        }
        $manifestPath = Join-Path $ChannelPath 'latest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) {
            throw "Nenhum manifesto latest.json encontrado nem pela internet nem em $ChannelPath."
        }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }

    $remoteVersion = $manifest.version
    $remoteBuild   = [int]$manifest.build
    $archiveName   = $manifest.archiveName
    $archiveSha256 = $manifest.archiveSha256
    $deliveryFolder = $manifest.deliveryFolder
    $downloadUrl   = $manifest.downloadUrl

    Write-Step "Versao mais recente disponivel: $remoteVersion (build $remoteBuild) via $(if ($usingInternet) {'internet'} else {'rede local'})"

    # Checar versao instalada
    $installedVersion = 'nenhuma (primeira instalacao)'
    $installedBuild   = 0
    $buildInfoPath = Join-Path $InstallDirectory 'BuildInfo.json'
    if (Test-Path -LiteralPath $buildInfoPath) {
        try {
            $info = Get-Content -LiteralPath $buildInfoPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $installedVersion = $info.version
            if ($installedVersion -match 'build (\d+)') {
                $installedBuild = [int]$Matches[1]
            }
        } catch {
            Write-Warn "Nao foi possivel ler a versao instalada; assumindo desatualizada."
        }
    }

    Write-Step "Versao atualmente instalada:  $installedVersion"

    if (-not $Force -and ($installedBuild -ge $remoteBuild) -and ($installedBuild -gt 0)) {
        Write-Success "O CRISPIX ja esta na versao mais recente ($installedVersion). Nenhuma atualizacao necessaria."
        return
    }

    Write-Host ""
    Write-Host "--------------------------------------------------------" -ForegroundColor White
    Write-Host " Atualizacao disponivel: $installedVersion -> $remoteVersion" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------" -ForegroundColor White
    Write-Host ""

    if (-not $NonInteractive) {
        $confirm = Read-Host "Deseja atualizar agora? (S/N)"
        if ($confirm -notmatch '^[sSyY]') {
            Write-Warn "Atualizacao cancelada pelo usuario."
            return
        }
    }

    # Obter o pacote: baixar por HTTP quando o manifesto veio da internet (downloadUrl
    # aponta para o bucket R2 publico), ou copiar da pasta de rede como antes.
    $downloadDir = Join-Path $env:TEMP ("crispix-download-" + [Guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
    if ($usingInternet -and $downloadUrl) {
        Write-Step "Baixando $archiveName pela internet ($downloadUrl) ..."
        $archivePath = Join-Path $downloadDir $archiveName
        Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -TimeoutSec 600
    } else {
        Write-Step "Copiando $archiveName da pasta de rede ..."
        $networkArchive = Join-Path (Join-Path $ChannelPath $deliveryFolder) $archiveName
        if (-not (Test-Path -LiteralPath $networkArchive)) {
            $networkArchive = Join-Path $ChannelPath $archiveName
            if (-not (Test-Path -LiteralPath $networkArchive)) {
                throw "Arquivo de pacote nao encontrado: $archiveName (nem em $deliveryFolder nem na raiz do canal de rede)."
            }
        }
        $archivePath = Join-Path $downloadDir $archiveName
        Copy-Item -LiteralPath $networkArchive -Destination $archivePath -Force
    }

    # Validar integridade do ZIP antes de tocar em qualquer coisa
    Write-Step "Validando hash SHA-256 do pacote obtido..."
    $computedSha = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower()
    if ($computedSha -ne $archiveSha256.ToLower()) {
        throw "Hash do pacote remoto nao confere! Esperado: $archiveSha256, Obtido: $computedSha. Download pode estar corrompido; nada foi alterado."
    }
    Write-Success "Integridade confirmada (SHA-256 confere)."

    # Fechar Lightroom Classic de forma limpa se estiver rodando
    $lrProcesses = Get-Process -Name 'Lightroom' -ErrorAction SilentlyContinue
    if ($lrProcesses) {
        Write-Step "Lightroom Classic em execucao. Fechando de forma limpa para liberar os arquivos..."
        $lrProcesses | ForEach-Object {
            $_.CloseMainWindow() | Out-Null
        }
        # Ao fechar, o Lightroom pode perguntar sobre o backup do catalogo, fazer o backup,
        # otimizar e gravar XMP: isso leva bem mais que 15 s. Encerrar o processo nesse meio
        # pode corromper o catalogo, entao espera ate 3 minutos e NUNCA forca sem o usuario.
        Write-Step "Aguardando o Lightroom terminar de fechar (se aparecer a janela de backup do catalogo, conclua-a)..."
        $lrProcesses | Wait-Process -Timeout 180 -ErrorAction SilentlyContinue
        $remaining = Get-Process -Name 'Lightroom' -ErrorAction SilentlyContinue
        if ($remaining) {
            if ($NonInteractive) {
                throw "O Lightroom continua aberto apos 3 minutos. Feche-o manualmente e rode o atualizador de novo; nada foi alterado."
            }
            Write-Warn "Forcar o encerramento durante backup/gravacao do catalogo pode corrompe-lo."
            $kill = Read-Host "O Lightroom ainda esta aberto. Ele terminou o backup e voce quer forcar o encerramento? (S/N)"
            if ($kill -notmatch '^[sSyY]') {
                throw "Atualizacao interrompida porque o Lightroom ainda esta em execucao; nada foi alterado."
            }
            $remaining | Stop-Process -Force
            Start-Sleep -Seconds 2
        }
        Write-Success "Lightroom Classic fechado."
    }

    # Preparar pasta temporaria de extracao
    $tempExtract = Join-Path $env:TEMP ("crispix-update-" + [Guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

    try {
        Write-Step "Extraindo $archiveName para pasta temporaria..."
        Expand-Archive -LiteralPath $archivePath -DestinationPath $tempExtract -Force

        # Localizar a pasta .lrplugin dentro do ZIP extraido
        $extractedPlugin = Get-ChildItem -LiteralPath $tempExtract -Directory -Filter '*.lrplugin' | Select-Object -First 1
        if (-not $extractedPlugin) {
            throw "O pacote nao contem uma pasta *.lrplugin valida!"
        }

        # Backup da instalacao anterior
        if (Test-Path -LiteralPath $InstallDirectory) {
            $backupPath = "$InstallDirectory.bak"
            if (Test-Path -LiteralPath $backupPath) {
                Remove-Item -LiteralPath $backupPath -Recurse -Force
            }
            Write-Step "Criando backup da versao anterior em $backupPath ..."
            Move-Item -LiteralPath $InstallDirectory -Destination $backupPath -Force
        }

        # Mover a nova versao para a pasta fixa de instalacao
        Write-Step "Instalando nova versao em $InstallDirectory ..."
        Move-Item -LiteralPath $extractedPlugin.FullName -Destination $InstallDirectory -Force
        Write-Success "Nova versao instalada com sucesso!"

        # Limpar backup antigo se der tudo certo
        if (Test-Path -LiteralPath "$InstallDirectory.bak") {
            Remove-Item -LiteralPath "$InstallDirectory.bak" -Recurse -Force -ErrorAction SilentlyContinue
        }
    } finally {
        if (Test-Path -LiteralPath $tempExtract) {
            Remove-Item -LiteralPath $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $downloadDir) {
            Remove-Item -LiteralPath $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host ""
    Write-Success "Atualizacao concluida com sucesso para o CRISPIX $remoteVersion!"
    Write-Host "Seus dados de aprendizado e configuracoes em AppData foram preservados intactos." -ForegroundColor Green
    Write-Host ""

    # Perguntar se quer reabrir o Lightroom
    if (-not $NonInteractive) {
        $reopen = Read-Host "Deseja reabrir o Lightroom Classic agora? (S/N)"
        if ($reopen -match '^[sSyY]') {
            $lrExe = "C:\Program Files\Adobe\Adobe Lightroom Classic\Lightroom.exe"
            if (Test-Path -LiteralPath $lrExe) {
                Start-Process -FilePath $lrExe
                Write-Success "Lightroom Classic iniciado."
            } else {
                Write-Warn "Lightroom.exe nao encontrado no caminho padrao; abra-o manualmente."
            }
        }
    }
} catch {
    Write-Err "Falha na atualizacao: $_"
    # Tentar restaurar o backup se a instalacao nova falhou
    if ((-not (Test-Path -LiteralPath $InstallDirectory)) -and (Test-Path -LiteralPath "$InstallDirectory.bak")) {
        Write-Warn "Restaurando backup da versao anterior..."
        Move-Item -LiteralPath "$InstallDirectory.bak" -Destination $InstallDirectory -Force
        Write-Warn "Backup restaurado. O Lightroom continua na versao anterior."
    }
    exit 1
}
