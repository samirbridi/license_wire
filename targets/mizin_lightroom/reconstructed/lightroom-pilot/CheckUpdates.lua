local Dialogs=import 'LrDialogs'
local Http=import 'LrHttp'
local Paths=import 'LrPathUtils'
local Tasks=import 'LrTasks'
local Json=dofile(Paths.child(_PLUGIN.path,'Json.lua'))

-- Two independent channels, tried in order. The internet channel (Cloudflare Pages) works
-- from anywhere; the network-share channel is kept as a fallback for this machine's local
-- network, so nothing that worked before this build stops working.
local INTERNET_MANIFEST_URL = 'https://crispixlr.pages.dev/latest.json'
local NETWORK_CHANNEL_PATH = '\\\\192.168.1.58\\Users\\Public\\Documents\\MizinLightroomPilot'

-- A UTF-8 BOM before the JSON made Json.decode fail ("Numero JSON invalido"): the internet
-- manifest of builds 0036/0037 was published with one, so the internet channel was never used.
local function stripBom(text)
    return (text:gsub('^\239\187\191',''))
end
local function validManifest(value)
    if type(value)~='table' or type(value.version)~='string' then return false end
    local build=value.version:match('^v%d+%.%d+%.%d+ %(build (%d+)%)$')
    return build~=nil and tonumber(build)>0 and tonumber(value.build)==tonumber(build)
end

local function readLocalFile(path)
    local f=io.open(path,'rb');if not f then return nil end
    local text=f:read(1024*1024);f:close()
    if type(text)~='string' then return nil end
    local ok,val=pcall(Json.decode,stripBom(text))
    -- A manifest is always an object; anything else (number, string) is treated as absent.
    return ok and type(val)=='table' and val or nil
end

-- LrHttp.get returns (body, headers); body is nil on network failure/timeout. Never
-- documented with a worked example in the preserved SDK guide text (only its existence is
-- listed), so this is deliberately defensive: any unexpected shape falls through to nil
-- instead of raising, and the caller falls back to the network-share channel.
local function fetchManifest(url)
    -- LrHttp yields; the Lightroom coroutine-aware pcall is required here (Lua 5.1).
    local ok,body = Tasks.pcall(function() return Http.get(url,nil,15) end)
    if not ok or type(body)~='string' or #body==0 then return nil,nil end
    local parseOk,val = pcall(Json.decode,stripBom(body))
    if not parseOk or not validManifest(val) then return nil,nil end
    return val,'internet'
end

Tasks.startAsyncTask(function()
    if _G.MizinEditorBusy or _G.MizinEngineBusy or _G.MizinAcervoBusy then
        Dialogs.message('CRISPIX - atualizacoes','Aguarde a edicao ou pause o aprendizado antes de atualizar.','info');return
    end
    local localInfo = readLocalFile(Paths.child(_PLUGIN.path,'BuildInfo.json'))
    local currentVersion = localInfo and type(localInfo.version)=='string' and localInfo.version or 'indisponivel'
    local currentBuild = tonumber((currentVersion:match('build (%d+)'))) or 0

    local remoteManifest,channelUsed = fetchManifest(INTERNET_MANIFEST_URL)
    local downloadUrl = nil
    if remoteManifest then
        downloadUrl = remoteManifest.downloadUrl
    else
        remoteManifest = readLocalFile(Paths.child(NETWORK_CHANNEL_PATH,'latest.json'))
        if not validManifest(remoteManifest) then remoteManifest=nil end
        channelUsed = remoteManifest and 'rede local' or nil
    end

    if not remoteManifest then
        Dialogs.message('CRISPIX - atualizacoes',
            'Versao instalada: '..currentVersion..'\n\n'..
            'Nao foi possivel conectar nem pela internet ('..INTERNET_MANIFEST_URL..')\n'..
            'nem pela rede local ('..NETWORK_CHANNEL_PATH..').\n\n'..
            'Verifique sua conexao com a internet ou com a rede local.','info')
        return
    end

    local remoteVersion = remoteManifest.version or 'indisponivel'
    local remoteBuild = tonumber(remoteManifest.build) or 0

    if remoteBuild > currentBuild then
        local action = Dialogs.confirm('CRISPIX - nova versao disponivel!',
            'Existe uma atualizacao pronta (canal: '..channelUsed..'):\n\n'..
            '  • Instalada: '..currentVersion..'\n'..
            '  • Disponivel: '..remoteVersion..'\n\n'..
            'Seus dados de aprendizado e configuracoes serao mantidos.\n'..
            'O Lightroom sera fechado e reaberto. Se aparecer a janela de backup do catalogo, conclua-a.\n'..
            'Deseja baixar e instalar agora?',
            'Atualizar agora','Fechar')
        if action == 'ok' then
            -- Uses the bundled runtime only to detach the installer. No shell-interpolated
            -- PowerShell source; the helper passes paths as data and copies itself outside
            -- the plugin directory before it can be replaced.
            local function quote(path)
                if path:find('[%%!"%z\1-\31]') then error('Caminho incompativel com o Windows: %, ! ou aspas.') end
                return '"'..path..'"'
            end
            local ok,code=Tasks.pcall(function()
                return Tasks.execute('"'..quote(Paths.child(Paths.child(_PLUGIN.path,'Runtime'),'pythonw.exe'))..
                    ' -I '..quote(Paths.child(_PLUGIN.path,'Launch-CrispixUpdate.py'))..' --plugin '..quote(_PLUGIN.path)..'"')
            end)
            if not ok or code~=0 then
                Dialogs.message('CRISPIX - atualizacoes','Nao foi possivel iniciar o atualizador.\n'..tostring(code)..
                    '\nExecute Atualizar-CRISPIX.cmd na pasta do plugin.','critical')
            elseif Dialogs.showBezel then
                -- Non-modal on purpose: a modal dialog would keep Lightroom from closing for the update.
                pcall(Dialogs.showBezel,'CRISPIX: baixando a atualizacao. O Lightroom sera fechado em instantes.',6)
            end
        end
    else
        Dialogs.message('CRISPIX - atualizacoes',
            'Voce ja esta usando a versao mais recente!\n\n'..
            '  • Versao ativa: '..currentVersion..'\n'..
            '  • Canal ('..channelUsed..'): '..remoteVersion..' (atualizado).','info')
    end
end)
