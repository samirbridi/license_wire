-- Learning is resumed explicitly through the menu, never silently on startup.
-- Do not reset busy flags: plugin reload may overlap an existing task.
-- The watched folder resumes only if the user turned it on and did not pause it.
local Paths=import 'LrPathUtils'
local ok=pcall(function() dofile(Paths.child(_PLUGIN.path,'AutoEdit.lua')).resumeIfEnabled() end)

-- Refreshes the informational GPU/hardware detection shown in PluginInfoProvider.lua.
-- Detached, non-blocking, best-effort: a failure here must never affect plugin startup.
-- gpu_detector.py only writes gpu_status.json; it does not touch anything else and is
-- not wired into culling/inference yet (see note 45 and PluginInfoProvider.lua).
pcall(function()
    local Tasks=import 'LrTasks'
    local FileUtils=import 'LrFileUtils'
    Tasks.startAsyncTask(function()
        local function quote(path)
            if path:find('[%%!"%z\1-\31]') then error('Caminho incompativel com o Windows.') end
            return '"'..path..'"'
        end
        local runtimePython=Paths.child(Paths.child(_PLUGIN.path,'Runtime'),'pythonw.exe')
        if not FileUtils.exists(runtimePython) then return end
        local detector=Paths.child(Paths.child(_PLUGIN.path,'Engine'),'gpu_detector.py')
        if not FileUtils.exists(detector) then return end
        local cacheFile=Paths.child(Paths.child(Paths.getStandardFilePath('appData'),'MizinLightroomLocal'),'gpu_status.json')
        -- Whole command line wrapped in one extra outer pair of quotes: cmd.exe needs
        -- this when the executable's own path contains a space (see CheckUpdates.lua's
        -- wrapAsCmdLine for the confirmed failure mode without it).
        local cmd='"'..quote(runtimePython)..' -I '..quote(detector)..' --cache-file '..quote(cacheFile)..'"'
        Tasks.pcall(function() Tasks.execute(cmd) end)
    end)
end)

-- Pos-atualizacao: CheckUpdates.lua grava este marcador antes de fechar o Lightroom
-- para trocar os arquivos (Update-CrispixPlugin.ps1 reabre o Lightroom em seguida).
-- A janela de conclusao com a identidade visual so pode aparecer aqui, depois que o
-- plugin novo carrega de verdade -- nao antes de fechar, quando a troca ainda nao
-- tinha acontecido.
pcall(function()
    local Dialogs=import 'LrDialogs'
    local FileUtils=import 'LrFileUtils'
    local Tasks=import 'LrTasks'
    local Json=dofile(Paths.child(_PLUGIN.path,'Json.lua'))
    local marker=Paths.child(Paths.child(Paths.getStandardFilePath('appData'),'MizinLightroomLocal'),'pending-update-notice.json')
    if not FileUtils.exists(marker) then return end
    local f=io.open(marker,'rb');if not f then return end
    local text=f:read(64*1024);f:close()
    local parseOk,info=pcall(Json.decode,text or '')
    FileUtils.delete(marker)
    if not parseOk or type(info)~='table' or type(info.toVersion)~='string' then return end
    Tasks.startAsyncTask(function()
        local View=import 'LrView'
        local headerPath=Paths.child(_PLUGIN.path,'Branding/crispix-header.png')
        local f=View:defaultFactory()
        local contents=f:column{spacing=f:control_spacing(),
            f:row{fill_horizontal=1,alignment='center',
                f:spacer{fill_horizontal=1},
                f:picture{value=headerPath,width=340,height=92},
                f:spacer{fill_horizontal=1}},
            f:static_text{title='Atualizacao concluida com sucesso!',font='<system/bold>',alignment='center',fill_horizontal=1},
            f:static_text{title='O CRISPIX foi atualizado para a versao '..tostring(info.toVersion)..'.\n'..
                'Seus estilos aprendidos, acervo e historico foram mantidos intactos.',
                height_in_lines=2,fill_horizontal=1}}
        Dialogs.presentModalDialog{title='CRISPIX - Bem-vindo de volta',contents=contents,actionVerb='OK',cancelVerb='<exclude>'}
    end)
end)
