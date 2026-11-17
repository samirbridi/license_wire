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

.PARAMETER InPlace
    Instala com o Lightroom ABERTO, como o Neurapix: nao fecha nem reabre o Lightroom.
    Troca arquivo por arquivo (so os que mudaram), guarda os originais em um backup ao
    lado da pasta do plugin e desfaz tudo se qualquer copia falhar. BuildInfo.json e
    gravado por ultimo: uma troca interrompida nunca anuncia a versao nova.
    Funciona porque este instalador e PowerShell: nenhum arquivo do plugin esta em uso
    (o Runtime Python do plugin nao roda durante a troca).

.PARAMETER ProgressFile
    Arquivo JSON {stage, percent, message} lido pela barra de progresso do Lightroom.
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
    [string]$PrestagedSha256 = '',
    [switch]$InPlace,
    [string]$ProgressFile = ''
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

$script:clock = [Diagnostics.Stopwatch]::StartNew()
function Write-Step([string]$msg) {
    Write-Host ("[CRISPIX {0,6:N1}s] {1}" -f $script:clock.Elapsed.TotalSeconds, $msg) -ForegroundColor Cyan
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

# Progresso para a barra nativa do Lightroom (CheckUpdates.lua le este JSON a cada 150 ms).
# Grava em arquivo temporario e substitui: o Lua nunca le um JSON pela metade.
function Write-UpdateProgress([string]$stage, [double]$percent, [string]$message) {
    if (-not $ProgressFile) { return }
    try {
        $payload = @{ stage = $stage; percent = [Math]::Round([Math]::Max(0, [Math]::Min(1, $percent)), 3); message = $message } |
            ConvertTo-Json -Compress
        $tmp = "$ProgressFile.tmp-$PID"
        [IO.File]::WriteAllText($tmp, $payload, (New-Object Text.UTF8Encoding($false)))
        # [NullString]::Value: um $null comum chega ao .NET como "" e Replace() rejeita o caminho.
        if ([IO.File]::Exists($ProgressFile)) { [IO.File]::Replace($tmp, $ProgressFile, [NullString]::Value) }
        else { [IO.File]::Move($tmp, $ProgressFile) }
    } catch { }
}

function Get-RelativeFiles([string]$root) {
    $prefix = $root.TrimEnd('\') + '\'
    $map = @{}
    foreach ($file in [IO.Directory]::EnumerateFiles($root, '*', [IO.SearchOption]::AllDirectories)) {
        $map[$file.Substring($prefix.Length)] = $file
    }
    return $map
}

# Um unico SHA-256 do .NET reaproveitado: Get-FileHash custa ~15 ms por chamada so de
# overhead, o que somava dezenas de segundos nos ~3.500 arquivos comparados.
$script:sha = [Security.Cryptography.SHA256]::Create()
function Get-Sha([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    try { return [BitConverter]::ToString($script:sha.ComputeHash($stream)) } finally { $stream.Dispose() }
}

# Mesmo tamanho e data de gravacao EXATAMENTE igual = mesmo arquivo. O pacote preserva as
# datas reais (build_lightroom_local.py usa copy2/ZipFile.write) e toda instalacao sai de um
# ZIP, entao um arquivo intocado entre dois builds recebe a mesma data exata do ZIP nos dois
# lados: o Runtime inalterado e reconhecido sem abrir ~1.700 arquivos (medido 26 s -> ~2 s; o
# antivirus inspeciona cada .dll/.pyd aberto). Qualquer diferenca de data, mesmo de 1 ms, cai
# no SHA-256. Uma tolerancia de 2 s chegou a declarar iguais dois arquivos diferentes do
# mesmo tamanho gravados no mesmo instante (pego por test_in_place_install_*).
function Test-SameFile([string]$a, [string]$b) {
    $fa, $fb = (New-Object IO.FileInfo($a)), (New-Object IO.FileInfo($b))
    if ($fa.Length -ne $fb.Length) { return $false }
    if ($fa.LastWriteTimeUtc.Ticks -eq $fb.LastWriteTimeUtc.Ticks) { return $true }
    return (Get-Sha $a) -eq (Get-Sha $b)
}

# Copia com novas tentativas: o processo Python que lancou este instalador pode levar
# alguns instantes para terminar e liberar um arquivo do Runtime.
function Copy-WithRetry([string]$source, [string]$target) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    for ($attempt = 1; ; $attempt++) {
        try { [IO.File]::Copy($source, $target, $true); return }
        catch {
            if ($attempt -ge 20) { throw "Arquivo em uso, nao foi possivel substituir: $target ($($_.Exception.Message))" }
            Start-Sleep -Milliseconds 500
        }
    }
}

function Install-InPlace([string]$sourceRoot, [string]$targetRoot, [string]$backupRoot) {
    $new = Get-RelativeFiles $sourceRoot
    $old = if (Test-Path -LiteralPath $targetRoot) { Get-RelativeFiles $targetRoot } else { @{} }
    $replace = New-Object Collections.Generic.List[string]
    $add = New-Object Collections.Generic.List[string]
    $checked = 0
    foreach ($rel in $new.Keys) {
        $checked++
        if ($checked % 100 -eq 0) {
            Write-UpdateProgress 'installing' (0.30 + 0.25 * $checked / $new.Count) "Comparando arquivos ($checked de $($new.Count))..."
        }
        if ($old.ContainsKey($rel)) {
            if (-not (Test-SameFile $new[$rel] $old[$rel])) { $replace.Add($rel) }
        } else { $add.Add($rel) }
    }
    $remove = @($old.Keys | Where-Object { -not $new.ContainsKey($_) })
    # BuildInfo.json por ultimo: se algo falhar no meio, a versao instalada continua a antiga.
    $ordered = @($replace | Where-Object { $_ -ne 'BuildInfo.json' }) + @($add | Where-Object { $_ -ne 'BuildInfo.json' })
    $total = [Math]::Max(1, $ordered.Count + $remove.Count + 1)
    Write-Step "Arquivos alterados: $($replace.Count); novos: $($add.Count); removidos: $($remove.Count); iguais: $($new.Count - $replace.Count - $add.Count)."
    $done = New-Object Collections.Generic.List[object]
    $step = 0
    try {
        foreach ($rel in $ordered) {
            $target = Join-Path $targetRoot $rel
            if ($replace.Contains($rel)) {
                Copy-WithRetry $target (Join-Path $backupRoot $rel)
                $done.Add(@('replace', $rel))
            } else { $done.Add(@('add', $rel)) }
            Copy-WithRetry $new[$rel] $target
            $step++
            if ($step % 25 -eq 0) { Write-UpdateProgress 'installing' (0.55 + 0.40 * $step / $total) "Instalando arquivos ($step de $total)..." }
        }
        foreach ($rel in $remove) {
            $target = Join-Path $targetRoot $rel
            $saved = Join-Path $backupRoot $rel
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($saved)) | Out-Null
            [IO.File]::Move($target, $saved)
            $done.Add(@('remove', $rel))
            $step++
        }
        if ($new.ContainsKey('BuildInfo.json')) {
            $target = Join-Path $targetRoot 'BuildInfo.json'
            if ($old.ContainsKey('BuildInfo.json')) { Copy-WithRetry $target (Join-Path $backupRoot 'BuildInfo.json'); $done.Add(@('replace', 'BuildInfo.json')) }
            else { $done.Add(@('add', 'BuildInfo.json')) }
            Copy-WithRetry $new['BuildInfo.json'] $target
        }
    } catch {
        $failure = $_
        Write-Warn "Falha durante a troca; desfazendo $($done.Count) alteracoes..."
        Write-UpdateProgress 'installing' 0.5 'Falha na troca; restaurando a versao anterior...'
        for ($i = $done.Count - 1; $i -ge 0; $i--) {
            $kind, $rel = $done[$i]
            $target = Join-Path $targetRoot $rel
            $saved = Join-Path $backupRoot $rel
            try {
                if ($kind -eq 'add') { [IO.File]::Delete($target) }
                elseif ($kind -eq 'replace') { [IO.File]::Copy($saved, $target, $true) }
                else { [IO.File]::Move($saved, $target) }
            } catch { Write-Err "Nao foi possivel restaurar ${rel}: $($_.Exception.Message)" }
        }
        Write-Warn 'Backup restaurado. O plugin continua na versao anterior.'
        throw $failure
    }
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
        Write-UpdateProgress 'done' 1.0 "O CRISPIX ja esta na versao $installedVersion."
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
    Write-UpdateProgress 'installing' 0.05 'Conferindo o pacote (SHA-256)...'
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
    # -InPlace: o Lightroom continua aberto (nada do plugin esta em uso por este processo).
    if ($lrProcesses -and -not $InPlace) {
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
        Write-UpdateProgress 'installing' 0.12 'Extraindo o pacote...'
        # ZipFile nativo do .NET: o Expand-Archive do PowerShell 5.1 levava dezenas de segundos
        # nos ~1.750 arquivos do pacote. A pasta de destino e nova e vazia; o .NET recusa
        # entradas que sairiam dela (../).
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $tempExtract)

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

        if ($InPlace) {
            # Backup so dos arquivos substituidos/removidos, ao lado da pasta do plugin.
            $backupPath = "$InstallDirectory.bak-$([Guid]::NewGuid().ToString('n'))"
            Write-Step "Instalando com o Lightroom aberto (backup dos arquivos trocados em $backupPath) ..."
            Write-UpdateProgress 'installing' 0.30 'Comparando arquivos...'
            Install-InPlace $extractedPlugin.FullName $InstallDirectory $backupPath
            Write-Success "Nova versao instalada com sucesso!"
            if (Test-Path -LiteralPath $backupPath) { Write-Step "Arquivos anteriores preservados em $backupPath" }
        } else {
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
        }
    } finally {
        Remove-UpdaterTemp $tempExtract
        Remove-UpdaterTemp $downloadDir
    }

    Write-Host ""
    Write-Success "Atualizacao concluida com sucesso para o CRISPIX $remoteVersion!"
    Write-Host "Seus dados de aprendizado e configuracoes em AppData foram preservados intactos." -ForegroundColor Green
    Write-Host ""
    Write-UpdateProgress 'done' 1.0 "CRISPIX atualizado para $remoteVersion."

    # Perguntar se quer reabrir o Lightroom (no modo -InPlace ele nunca foi fechado)
    if (-not $InPlace -and ($Reopen -or -not $NonInteractive)) {
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
    Write-UpdateProgress 'error' 0 ("$($_.Exception.Message)" + ' Nada foi alterado na versao instalada.')
    throw
} finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
    Remove-UpdaterTemp $tempExtract
    Remove-UpdaterTemp $downloadDir
}
