local Dialogs = import 'LrDialogs'
local Http = import 'LrHttp'
local Paths = import 'LrPathUtils'
local Tasks = import 'LrTasks'
local View = import 'LrView'
local FileUtils = import 'LrFileUtils'
local FunctionContext = import 'LrFunctionContext'
local Json = dofile(Paths.child(_PLUGIN.path, 'Json.lua'))

local INTERNET_MANIFEST_URL = 'https://crispixlr.pages.dev/latest.json'
local NETWORK_CHANNEL_PATH = '\\\\192.168.1.58\\Users\\Public\\Documents\\MizinLightroomPilot'

local function stripBom(text)
    return (text:gsub('^\239\187\191', ''))
end

local function validManifest(value)
    if type(value) ~= 'table' or type(value.version) ~= 'string' then return false end
    local build = value.version:match('^v%d+%.%d+%.%d+ %(build (%d+)%)$')
    return build ~= nil and tonumber(build) > 0 and tonumber(value.build) == tonumber(build)
end

local function readLocalFile(path)
    local f = io.open(path, 'rb')
    if not f then return nil end
    local text = f:read(1024 * 1024)
    f:close()
    if type(text) ~= 'string' then return nil end
    local ok, val = pcall(Json.decode, stripBom(text))
    return ok and type(val) == 'table' and val or nil
end

local function fetchManifest(url)
    local ok, body = Tasks.pcall(function() return Http.get(url, nil, 15) end)
    if not ok or type(body) ~= 'string' or #body == 0 then return nil, nil end
    local parseOk, val = pcall(Json.decode, stripBom(body))
    if not parseOk or not validManifest(val) then return nil, nil end
    return val, 'internet'
end

-- Quotes ONE token (an executable path or argument). Using this alone around each
-- token of a multi-token command line passed to cmd.exe /c is not enough when the
-- executable's own path contains a space: cmd then needs the WHOLE command wrapped
-- in one more outer pair of quotes so it treats it as a single command rather than
-- splitting on the first space inside the (quoted) executable path. See wrapAsCmdLine.
local function quote(path)
    if path:find('[%%!"%z\1-\31]') then error('Caminho incompativel com o Windows: %, ! ou aspas.') end
    return '"' .. path .. '"'
end

-- LrTasks.execute runs the string through cmd.exe /c. When the first token (the
-- executable path) contains a space, cmd.exe requires the ENTIRE command line to be
-- wrapped in one extra pair of quotes, or it silently fails to start anything (exit
-- code 0, nothing ran). Verified 2026-11-16: the unwrapped form returned rc=1 and
-- never created its own marker file; the wrapped form below ran correctly.
local function wrapAsCmdLine(commandLine)
    return '"' .. commandLine .. '"'
end

local function localDataRoot()
    return Paths.child(Paths.getStandardFilePath('appData'), 'MizinLightroomLocal')
end

Tasks.startAsyncTask(function()
    if _G.MizinEditorBusy or _G.MizinEngineBusy or _G.MizinAcervoBusy then
        Dialogs.message('CRISPIX - atualizacoes', 'Aguarde a edicao ou pause o aprendizado antes de atualizar.', 'info')
        return
    end

    local localInfo = readLocalFile(Paths.child(_PLUGIN.path, 'BuildInfo.json'))
    local currentVersion = localInfo and type(localInfo.version) == 'string' and localInfo.version or 'indisponivel'
    local currentBuild = tonumber((currentVersion:match('build (%d+)'))) or 0

    local remoteManifest, channelUsed = fetchManifest(INTERNET_MANIFEST_URL)
    local downloadUrl = nil
    if remoteManifest then
        downloadUrl = remoteManifest.downloadUrl
    else
        remoteManifest = readLocalFile(Paths.child(NETWORK_CHANNEL_PATH, 'latest.json'))
        if not validManifest(remoteManifest) then remoteManifest = nil end
        channelUsed = remoteManifest and 'rede local' or nil
    end

    local headerPath = Paths.child(_PLUGIN.path, 'Branding/crispix-header.png')
    local f = View:defaultFactory()

    if not remoteManifest then
        local contents = f:column {
            spacing = f:control_spacing(),
            f:row {
                fill_horizontal = 1,
                alignment = 'center',
                f:spacer { fill_horizontal = 1 },
                f:picture { value = headerPath, width = 340, height = 92 },
                f:spacer { fill_horizontal = 1 },
            },
            f:static_text {
                title = 'Nao foi possivel conectar ao servidor de atualizacoes.',
                font = '<system/bold>',
                alignment = 'center',
                fill_horizontal = 1,
            },
            f:static_text {
                title = 'Versao instalada: ' .. currentVersion .. '\n\n' ..
                        'Canais consultados sem resposta:\n' ..
                        '  • Internet: ' .. INTERNET_MANIFEST_URL .. '\n' ..
                        '  • Rede local: ' .. NETWORK_CHANNEL_PATH .. '\n\n' ..
                        'Por favor, verifique sua conexao com a internet e tente novamente.',
                height_in_lines = 6,
                fill_horizontal = 1,
            },
        }
        Dialogs.presentModalDialog {
            title = 'CRISPIX - Atualizacoes',
            contents = contents,
            actionVerb = 'OK',
            cancelVerb = '<exclude>',
        }
        return
    end

    local remoteVersion = remoteManifest.version or 'indisponivel'
    local remoteBuild = tonumber(remoteManifest.build) or 0

    if remoteBuild > currentBuild then
        -- Janela 1: Notificação de Nova Versão com Identidade Visual
        local contents = f:column {
            spacing = f:control_spacing(),
            f:row {
                fill_horizontal = 1,
                alignment = 'center',
                f:spacer { fill_horizontal = 1 },
                f:picture { value = headerPath, width = 340, height = 92 },
                f:spacer { fill_horizontal = 1 },
            },
            f:static_text {
                title = 'Nova versao do CRISPIX disponivel!',
                font = '<system/bold>',
                alignment = 'center',
                fill_horizontal = 1,
            },
            f:group_box {
                title = 'DETALHES DA ATUALIZACAO',
                spacing = f:control_spacing(),
                fill_horizontal = 1,
                f:row {
                    f:static_text { title = 'Versao instalada:', width = 140 },
                    f:static_text { title = currentVersion, font = '<system/bold>' },
                },
                f:row {
                    f:static_text { title = 'Nova versao:', width = 140 },
                    f:static_text { title = remoteVersion, font = '<system/bold>' },
                },
                f:row {
                    f:static_text { title = 'Canal:', width = 140 },
                    f:static_text { title = channelUsed or 'internet' },
                },
            },
            f:static_text {
                title = 'O pacote sera baixado e conferido com o Lightroom ainda aberto.\n' ..
                        'Em seguida, o Lightroom fecha por alguns instantes para trocar os\n' ..
                        'arquivos com seguranca (com backup automatico) e reabre sozinho.\n' ..
                        'Seus estilos aprendidos, acervo e historico serao mantidos intactos.',
                height_in_lines = 4,
                fill_horizontal = 1,
            },
        }

        local choice = Dialogs.presentModalDialog {
            title = 'CRISPIX - Atualizacao Disponivel',
            contents = contents,
            actionVerb = 'Atualizar agora',
            cancelVerb = 'Mais tarde',
        }

        if choice == 'ok' then
            if not downloadUrl then
                Dialogs.message('CRISPIX - Atualizacoes',
                    'A atualizacao automatica dentro do Lightroom exige o canal de internet.\n' ..
                    'O canal de rede local nao fornece um link de download direto.\n\n' ..
                    'Execute Atualizar-CRISPIX.cmd na pasta do plugin para atualizar pela rede local.',
                    'info')
                return
            end
            local archiveSha256 = remoteManifest.archiveSha256
            if type(archiveSha256) ~= 'string' or not archiveSha256:match('^%x+$') then
                Dialogs.message('CRISPIX - Atualizacoes',
                    'O manifesto de atualizacao nao traz um hash valido para conferencia.\n' ..
                    'Por seguranca, nada foi baixado automaticamente.\n\n' ..
                    'Execute Atualizar-CRISPIX.cmd na pasta do plugin para atualizar.',
                    'critical')
                return
            end

            local stageSuccess = false
            local stageErrorMsg = nil
            local stagedPluginPath, stagedArchivePath = nil, nil

            -- Janela 2: Barra de Progresso Nativa do Lightroom (somente baixa, confere e
            -- extrai para uma pasta temporaria; a pasta do plugin em uso nunca e tocada
            -- aqui, porque e o proprio Runtime/pythonw.exe desta pasta que esta rodando).
            FunctionContext.callWithContext('crispixInAppUpdateStage', function(context)
                local progress = Dialogs.showModalProgressDialog {
                    title = 'CRISPIX - Baixando atualizacao',
                    caption = 'Iniciando download...',
                    cannotCancel = true,
                    functionContext = context,
                }

                local tempDir = Paths.getStandardFilePath('temp')
                local progressFile = Paths.child(tempDir, 'crispix_update_progress.json')
                local stagingDir = Paths.child(tempDir, 'crispix-stage-' .. tostring(remoteBuild))
                if FileUtils.exists(progressFile) then
                    FileUtils.delete(progressFile)
                end

                local runtimePython = Paths.child(Paths.child(_PLUGIN.path, 'Runtime'), 'pythonw.exe')
                local pythonExe = FileUtils.exists(runtimePython) and runtimePython or 'python'

                local stagerScript = Paths.child(_PLUGIN.path, 'Launch-InAppUpdate.py')
                if not FileUtils.exists(stagerScript) then
                    stagerScript = Paths.child(Paths.child(_PLUGIN.path, 'scripts'), 'Launch-InAppUpdate.py')
                end

                local launchCmd = quote(pythonExe) .. ' -I ' .. quote(stagerScript) ..
                    ' --plugin ' .. quote(_PLUGIN.path) ..
                    ' --download-url ' .. quote(downloadUrl) ..
                    ' --sha256 ' .. quote(archiveSha256) ..
                    ' --version ' .. quote(remoteVersion) ..
                    ' --progress-file ' .. quote(progressFile) ..
                    ' --staging-dir ' .. quote(stagingDir)

                Tasks.execute(wrapAsCmdLine(launchCmd))

                local deadline = os.time() + 300
                while os.time() < deadline do
                    Tasks.sleep(0.15)
                    local st = readLocalFile(progressFile)
                    if st then
                        if st.percent then
                            progress:setPortionComplete(tonumber(st.percent) or 0, 1.0)
                        end
                        if st.message then
                            progress:setCaption(tostring(st.message))
                        end
                        if st.stage == 'staged' then
                            stageSuccess = true
                            stagedPluginPath = st.stagedPluginPath
                            stagedArchivePath = st.stagedArchivePath
                            break
                        elseif st.stage == 'error' then
                            stageErrorMsg = st.message or 'Erro desconhecido.'
                            break
                        end
                    end
                end
            end)

            if not stageSuccess then
                Dialogs.message('CRISPIX - Falha na Atualizacao',
                    'Nao foi possivel baixar ou validar a atualizacao:\n' ..
                    tostring(stageErrorMsg or 'Tempo limite esgotado.') .. '\n\n' ..
                    'Nada foi alterado na instalacao atual.\n' ..
                    'Voce tambem pode atualizar executando Atualizar-CRISPIX.cmd na pasta do plugin.',
                    'critical')
                return
            end

            -- Marca para LearningInit.lua mostrar a janela de conclusao com a marca
            -- assim que o Lightroom reabrir (o processo atual sera encerrado antes disso).
            local marker = Paths.child(localDataRoot(), 'pending-update-notice.json')
            FileUtils.createAllDirectories(localDataRoot())
            local mf = io.open(marker, 'wb')
            if mf then
                mf:write(Json.encode({ fromVersion = currentVersion, toVersion = remoteVersion }))
                mf:close()
            end

            -- Janela 3: Aviso honesto de que o Lightroom vai fechar agora para concluir.
            local closingContents = f:column {
                spacing = f:control_spacing(),
                f:row {
                    fill_horizontal = 1,
                    alignment = 'center',
                    f:spacer { fill_horizontal = 1 },
                    f:picture { value = headerPath, width = 340, height = 92 },
                    f:spacer { fill_horizontal = 1 },
                },
                f:static_text {
                    title = 'Pacote baixado e conferido com sucesso!',
                    font = '<system/bold>',
                    alignment = 'center',
                    fill_horizontal = 1,
                },
                f:static_text {
                    title = 'Para instalar a versao ' .. remoteVersion .. ', o Lightroom Classic\n' ..
                            'vai fechar agora (se aparecer a janela de backup do catalogo, conclua-a)\n' ..
                            'e reabrir sozinho em seguida, ja atualizado.',
                    height_in_lines = 3,
                    fill_horizontal = 1,
                },
            }
            Dialogs.presentModalDialog {
                title = 'CRISPIX - Instalando Atualizacao',
                contents = closingContents,
                actionVerb = 'Continuar',
                cancelVerb = '<exclude>',
            }

            local runtimePython = Paths.child(Paths.child(_PLUGIN.path, 'Runtime'), 'pythonw.exe')
            local pythonExe = FileUtils.exists(runtimePython) and runtimePython or 'python'

            -- Hands off to the already-proven one-click path (closes Lightroom, backs up,
            -- swaps files, reopens): the risky part never runs from inside this process.
            local launchCmd = quote(pythonExe) .. ' -I ' ..
                quote(Paths.child(_PLUGIN.path, 'Launch-CrispixUpdate.py')) ..
                ' --plugin ' .. quote(_PLUGIN.path) ..
                ' --prestaged-archive ' .. quote(stagedArchivePath) ..
                ' --prestaged-version ' .. quote(remoteVersion) ..
                ' --prestaged-build ' .. tostring(remoteBuild) ..
                ' --prestaged-sha256 ' .. quote(archiveSha256)

            local ok, code = Tasks.pcall(function() return Tasks.execute(wrapAsCmdLine(launchCmd)) end)
            if not ok or code ~= 0 then
                FileUtils.delete(marker)
                Dialogs.message('CRISPIX - atualizacoes',
                    'Nao foi possivel iniciar o atualizador.\n' .. tostring(code) ..
                    '\nExecute Atualizar-CRISPIX.cmd na pasta do plugin.', 'critical')
            end
        end
    else
        -- Versão já atualizada: Janela com Identidade Visual
        local contents = f:column {
            spacing = f:control_spacing(),
            f:row {
                fill_horizontal = 1,
                alignment = 'center',
                f:spacer { fill_horizontal = 1 },
                f:picture { value = headerPath, width = 340, height = 92 },
                f:spacer { fill_horizontal = 1 },
            },
            f:static_text {
                title = 'Seu CRISPIX ja esta na versao mais recente!',
                font = '<system/bold>',
                alignment = 'center',
                fill_horizontal = 1,
            },
            f:group_box {
                title = 'STATUS DO PLUGIN',
                spacing = f:control_spacing(),
                fill_horizontal = 1,
                f:row {
                    f:static_text { title = 'Versao instalada:', width = 140 },
                    f:static_text { title = currentVersion .. '  ✓', font = '<system/bold>' },
                },
                f:row {
                    f:static_text { title = 'Canal consultado:', width = 140 },
                    f:static_text { title = (channelUsed or 'internet') .. ' (' .. remoteVersion .. ')' },
                },
            },
            f:static_text {
                title = 'Todos os modulos de IA, edicao inteligente e selecao estao atualizados.',
                alignment = 'center',
                fill_horizontal = 1,
            },
        }

        Dialogs.presentModalDialog {
            title = 'CRISPIX - Atualizacoes',
            contents = contents,
            actionVerb = 'OK',
            cancelVerb = '<exclude>',
        }
    end
end)
