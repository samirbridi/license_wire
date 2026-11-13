local App=import 'LrApplication'
local Dialogs=import 'LrDialogs'
local Http=import 'LrHttp'
local Paths=import 'LrPathUtils'
local Shell=import 'LrShell'
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
    local ok,body = pcall(function() return Http.get(url,nil,15) end)
    if not ok or type(body)~='string' or #body==0 then return nil,nil end
    local parseOk,val = pcall(Json.decode,stripBom(body))
    if not parseOk or type(val)~='table' then return nil,nil end
    return val,'internet'
end

Tasks.startAsyncTask(function()
    local localInfo = readLocalFile(Paths.child(_PLUGIN.path,'BuildInfo.json'))
    local currentVersion = localInfo and localInfo.version or 'indisponivel'
    local currentBuild = tonumber((currentVersion:match('build (%d+)'))) or 0

    local remoteManifest,channelUsed = fetchManifest(INTERNET_MANIFEST_URL)
    local downloadUrl = nil
    if remoteManifest then
        downloadUrl = remoteManifest.downloadUrl
    else
        remoteManifest = readLocalFile(Paths.child(NETWORK_CHANNEL_PATH,'latest.json'))
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
        local updaterCmd = Paths.child(_PLUGIN.path,'Atualizar-CRISPIX.cmd')
        local action = Dialogs.confirm('CRISPIX - nova versao disponivel!',
            'Existe uma atualizacao pronta (canal: '..channelUsed..'):\n\n'..
            '  • Instalada: '..currentVersion..'\n'..
            '  • Disponivel: '..remoteVersion..'\n\n'..
            'Seus dados de aprendizado e configuracoes serao mantidos.\n'..
            'Deseja abrir a pasta para executar o atualizador automatico?',
            'Abrir atualizador','Fechar')
        if action == 'ok' then
            pcall(function() Shell.revealInShell(updaterCmd) end)
        end
    else
        Dialogs.message('CRISPIX - atualizacoes',
            'Voce ja esta usando a versao mais recente!\n\n'..
            '  • Versao ativa: '..currentVersion..'\n'..
            '  • Canal ('..channelUsed..'): '..remoteVersion..' (atualizado).','info')
    end
end)
