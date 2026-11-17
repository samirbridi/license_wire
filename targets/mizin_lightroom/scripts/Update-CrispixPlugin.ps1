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

.PARAMETER PrestagedArchive
    Caminho de um pacote .zip ja baixado e com hash conferido (pelo atualizador dentro
    do Lightroom, InApp-UpdatePlugin.py). Quando informado, pula a consulta ao manifesto
    e o download: ainda assim confere o SHA-256 de novo antes de tocar em qualquer coisa.

.PARAMETER PrestagedVersion
.PARAMETER PrestagedBuild
.PARAMETER PrestagedSha256
    Metadados do pacote pre-baixado, exigidos junto com -PrestagedArchive.
#>

[CmdletBinding()]
param(
    [string]$ManifestUrl = 'https://crispixlr.pages.dev/latest.json',
    [string]$ChannelPath = '\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot',
    [string]$InstallDirectory = "$env:USERPROFILE\Documents\CRISPIX.lrplugin",
    [switch]$Force,
    [switch]$NonInteractive,
    [switch]$Reopen,
    [string]$PrestagedArchive = '',
    [string]$PrestagedVersion = '',
    [int]$PrestagedBuild = 0,
    [string]$PrestagedSha256 = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$backupPath = $null
$backupCreated = $false
$mutex = $null
$ownsMutex = $false
$downloadDir = $null
$tempExtract = $null

function Remove-UpdaterTemp([string]$path) {
    if (-not $path -or -not (Test-Path -LiteralPath $path)) { return }
    $full = [IO.Path]::GetFullPath($path).TrimEnd('\','/')
    $tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\','/')
    if ([IO.Path]::GetDirectoryName($full) -ne $tempRoot -or
        [IO.Path]::GetFileName($full) -notmatch '^crispix-(download|update)-[a-f0-9]{32}$') {
        throw 'Pasta temporaria fora do escopo do atualizador.'
    }
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction SilentlyContinue
}

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
    $InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\','/')
    if ([IO.Path]::GetExtension($InstallDirectory) -ne '.lrplugin') {
        throw 'O destino precisa ser uma pasta .lrplugin; nenhuma pasta foi alterada.'
    }
    if ((Test-Path -LiteralPath $InstallDirectory) -and
        ((Get-Item -LiteralPath $InstallDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'A instalacao nao pode ser um link ou junction.'
    }
    $mutex = New-Object Threading.Mutex($false, 'Local\CRISPIX.PluginUpdater')
    $ownsMutex = $mutex.WaitOne(0)
    if (-not $ownsMutex) { throw 'Ja existe uma atualizacao em andamento.' }

    $usingPrestaged = -not [string]::IsNullOrWhiteSpace($PrestagedArchive)
    $manifest = $null
    $usingInternet = $false

    if ($usingPrestaged) {
        # The in-Lightroom progress dialog (InApp-UpdatePlugin.py) already downloaded and
        # SHA-256-validated this exact file; we re-validate below before touching anything,
        # but skip re-downloading and re-querying the manifest.
        if (-not (Test-Path -LiteralPath $PrestagedArchive)) { throw "Pacote pre-baixado nao encontrado: $PrestagedArchive" }
        if ($PrestagedBuild -le 0 -or $PrestagedSha256 -notmatch '^[a-fA-F0-9]{64}$' -or [string]::IsNullOrWhiteSpace($PrestagedVersion)) {
            throw 'Metadados do pacote pre-baixado incompletos ou invalidos.'
        }
        Write-Step "Usando pacote ja baixado e validado pelo Lightroom: $PrestagedArchive"
        $remoteVersion = $PrestagedVersion
        $remoteBuild = $PrestagedBuild
        $archiveSha256 = $PrestagedSha256
        $archiveName = Split-Path -Leaf $PrestagedArchive
    } else {
        Write-Step "Consultando canal de atualizacao pela internet ($ManifestUrl) ..."
        try {
            $response = Invoke-WebRequest -Uri $ManifestUrl -TimeoutSec 15 -UseBasicParsing
            # Decodifica os bytes como UTF-8 e remove um BOM eventual: o PowerShell 5.1 le o corpo
            # como ISO-8859-1 e o BOM vira "ï»¿", que fazia o ConvertFrom-Json falhar e o canal de
            # internet nunca ser usado (medido na publicacao do build 0037).
            $text = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()).TrimStart([char]0xFEFF)
            $manifest = $text | ConvertFrom-Json
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
        $downloadUrl   = if ($manifest.PSObject.Properties['downloadUrl']) { $manifest.downloadUrl } else { $null }
        if ($remoteBuild -le 0 -or $archiveSha256 -notmatch '^[a-fA-F0-9]{64}$' -or
            $archiveName -notmatch '^[\w.-]+\.zip$' -or $deliveryFolder -notmatch '^[\w.-]+$' -or
            $deliveryFolder -in @('.', '..')) { throw 'Manifesto de atualizacao invalido.' }
        if ($usingInternet -and ([string]$downloadUrl -notmatch '^https://')) { throw 'Download HTTPS ausente no manifesto.' }
    }

    Write-Step "Versao mais recente disponivel: $remoteVersion (build $remoteBuild) via $(if ($usingPrestaged) {'pacote pre-baixado'} elseif ($usingInternet) {'internet'} else {'rede local'})"

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

    # Obter o pacote: ja em staging (download feito pelo dialogo dentro do Lightroom),
    # baixar por HTTP quando o manifesto veio da internet (downloadUrl aponta para o
    # bucket R2 publico), ou copiar da pasta de rede como antes.
    $downloadDir = Join-Path $env:TEMP ("crispix-download-" + [Guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
    if ($usingPrestaged) {
        $archivePath = Join-Path $downloadDir $archiveName
        Copy-Item -LiteralPath $PrestagedArchive -Destination $archivePath -Force
    } elseif ($usingInternet -and $downloadUrl) {
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
    # Reabre o mesmo executavel que estava aberto (instalacoes fora do caminho padrao).
    $runningLrExe = @($lrProcesses | ForEach-Object { try { $_.Path } catch { $null } } | Where-Object { $_ }) | Select-Object -First 1
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

        # Exact extraction root, never a computed arbitrary folder.
        $plugins = @(Get-ChildItem -LiteralPath $tempExtract -Directory -Filter '*.lrplugin')
        if ($plugins.Count -ne 1) {
            throw "O pacote nao contem uma pasta *.lrplugin valida!"
        }
        $extractedPlugin = $plugins[0]
        $newInfo = Get-Content -LiteralPath (Join-Path $extractedPlugin.FullName 'BuildInfo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($newInfo.version -ne $remoteVersion -or -not (Test-Path -LiteralPath (Join-Path $extractedPlugin.FullName 'Info.lua'))) {
            throw 'A versao do pacote nao corresponde ao manifesto.'
        }

        # Backup da instalacao anterior
        if (Test-Path -LiteralPath $InstallDirectory) {
            $backupPath = "$InstallDirectory.bak-$([Guid]::NewGuid().ToString('n'))"
            Write-Step "Criando backup da versao anterior em $backupPath ..."
            Move-Item -LiteralPath $InstallDirectory -Destination $backupPath -Force
            $backupCreated = $true
        }

        # Mover a nova versao para a pasta fixa de instalacao
        Write-Step "Instalando nova versao em $InstallDirectory ..."
        Move-Item -LiteralPath $extractedPlugin.FullName -Destination $InstallDirectory -Force
        Write-Success "Nova versao instalada com sucesso!"

        if ($backupCreated) { Write-Step "Backup anterior preservado em $backupPath" }
    } finally {
        Remove-UpdaterTemp $tempExtract
        Remove-UpdaterTemp $downloadDir
    }

    Write-Host ""
    Write-Success "Atualizacao concluida com sucesso para o CRISPIX $remoteVersion!"
    Write-Host "Seus dados de aprendizado e configuracoes em AppData foram preservados intactos." -ForegroundColor Green
    Write-Host ""

    # Perguntar se quer reabrir o Lightroom
    if ($Reopen -or -not $NonInteractive) {
        $reopenAnswer = if ($Reopen) { 'S' } else { Read-Host "Deseja reabrir o Lightroom Classic agora? (S/N)" }
        if ($reopenAnswer -match '^[sSyY]') {
            $lrExe = if ($runningLrExe) { $runningLrExe } else { "C:\Program Files\Adobe\Adobe Lightroom Classic\Lightroom.exe" }
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
    if ($backupCreated -and (-not (Test-Path -LiteralPath $InstallDirectory)) -and (Test-Path -LiteralPath $backupPath)) {
        Write-Warn "Restaurando backup da versao anterior..."
        Move-Item -LiteralPath $backupPath -Destination $InstallDirectory -Force
        Write-Warn "Backup restaurado. O Lightroom continua na versao anterior."
    }
    throw
} finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
    Remove-UpdaterTemp $tempExtract
    Remove-UpdaterTemp $downloadDir
}
