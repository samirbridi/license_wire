-- Learning is resumed explicitly through the menu, never silently on startup.
-- Do not reset busy flags: plugin reload may overlap an existing task.
-- The watched folder resumes only if the user turned it on and did not pause it.
local Paths=import 'LrPathUtils'
local ok=pcall(function() dofile(Paths.child(_PLUGIN.path,'AutoEdit.lua')).resumeIfEnabled() end)

-- Escolha da aceleracao por IA (NVIDIA CUDA > DirectML > CPU), em segundo plano e sem bloquear
-- a abertura. Usa o cache; so testa a GPU de novo quando placa, driver, componentes ou
-- preferencia mudaram (Engine/accelerator.py). Uma falha aqui nunca afeta o plugin.
pcall(function()
    local Tasks=import 'LrTasks'
    Tasks.startAsyncTask(function()
        Tasks.pcall(function() dofile(Paths.child(_PLUGIN.path,'Acceleration.lua')).refresh(false) end)
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
        local f=View.osFactory()
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
