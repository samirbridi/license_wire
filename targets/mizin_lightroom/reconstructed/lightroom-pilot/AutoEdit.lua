-- Watched-folder automatic editing. Opt-in, one folder per catalog, new imports only.
-- Never changes the user's selection or module; edits in place with the restore journal.
local App=import 'LrApplication'
local Date=import 'LrDate'
local Dialogs=import 'LrDialogs'
local Files=import 'LrFileUtils'
local Paths=import 'LrPathUtils'
local Tasks=import 'LrTasks'
local Json=dofile(Paths.child(_PLUGIN.path,'Json.lua'))
local M={}
M.INTERVAL=60
M.MAX_BATCH=100
local SCHEMA='crispix.autoedit-watch/1'

local function root() return Paths.child(Paths.child(Paths.getStandardFilePath('appData'),'MizinLightroomLocal'),'autoedit') end
local function statePath() return Paths.child(root(),'watch.json') end
local function editor() return dofile(Paths.child(_PLUGIN.path,'PhotoEditor.lua')) end

function M.load()
    local f=io.open(statePath(),'rb');if not f then return nil end
    local text=f:read(8*1024*1024+1);f:close()
    local ok,state=pcall(Json.decode,text)
    if not ok or type(state)~='table' or state.schema~=SCHEMA then return nil end
    for _,key in ipairs({'sightings','processed','skipped','runs'}) do if type(state[key])~='table' then state[key]={} end end
    return state
end
-- Write-then-rename keeps the previous state if Lightroom closes mid-write.
function M.save(state)
    Files.createAllDirectories(root())
    local text=Json.encode(state)
    if #text>8*1024*1024 then error('Registro da pasta vigiada excede 8 MiB; desligue e ligue novamente a vigilancia.') end
    local temporary=statePath()..'.tmp'
    local f,e=io.open(temporary,'wb');if not f then error(tostring(e)) end
    local ok,err=f:write(text);local closed=f:close()
    if not ok or not closed then error(tostring(err or 'Falha ao gravar a pasta vigiada')) end
    os.remove(statePath())
    local moved,moveError=os.rename(temporary,statePath())
    if not moved then error(tostring(moveError)) end
end

local function numericId(photo) return tonumber(photo.localIdentifier) end
local function isRaw(path) return type(path)=='string' and path:lower():match('%.cr3$')~=nil end

-- Baseline over the WHOLE catalog: photos later moved into the folder are never "new imports".
function M.enable(catalog,folderPath)
    local folder=catalog:getFolderByPath(folderPath)
    if not folder then error('A pasta nao esta no catalogo: '..tostring(folderPath)) end
    local maximum=0
    for index,photo in ipairs(catalog:getAllPhotos() or {}) do
        local id=numericId(photo);if id and id>maximum then maximum=id end
        if index%500==0 then Tasks.yield() end
    end
    local state={schema=SCHEMA,catalogPath=catalog:getPath(),folderPath=folderPath,enabled=true,paused=false,
        baselineMaxId=maximum,startedAt=Date.currentTime(),lastScanCount=#(folder:getPhotos(false) or {}),
        sightings={},processed={},skipped={},runs={}}
    M.save(state)
    return state
end

-- A photo is edited only after the import settled (stable folder count) and its settings
-- stayed identical between two scans. Any change in between means the photographer
-- touched it: it is skipped permanently.
function M.scan(state,catalog)
    local folder=catalog:getFolderByPath(state.folderPath)
    if not folder then return {},'FOLDER_MISSING' end
    local photos=folder:getPhotos(false) or {}
    local settled=state.lastScanCount==#photos
    state.lastScanCount=#photos
    if not settled then return {},'IMPORT_IN_PROGRESS' end
    local Editor=editor();local ready,expected={},{}
    for index,photo in ipairs(photos) do
        local number=numericId(photo);local id=tostring(photo.localIdentifier)
        if number and number>state.baselineMaxId and not state.processed[id] and not state.skipped[id] then
            if photo:getRawMetadata('isVirtualCopy')==true then state.skipped[id]='VIRTUAL_COPY'
            elseif not isRaw(photo:getRawMetadata('path')) then state.skipped[id]='NOT_CR3'
            else
                local settings=photo:getDevelopSettings();local hash=Editor.fingerprint(settings)
                local seen=state.sightings[id]
                if not seen then state.sightings[id]={hash=hash}
                elseif not Editor.matches(settings,seen.hash) then state.skipped[id]='CHANGED_BEFORE_AUTOMATIC_EDIT';state.sightings[id]=nil
                elseif #ready<M.MAX_BATCH then ready[#ready+1]=photo;expected[id]=hash end
            end
        end
        if index%50==0 then Tasks.yield() end
    end
    return ready,(#ready>0 and 'READY' or 'WAITING'),expected
end

local function busy()
    return _G.MizinAcervoBusy or _G.MizinEngineBusy or _G.MizinEditorBusy
end
local function remember(state,run)
    table.insert(state.runs,1,run)
    while #state.runs>20 do table.remove(state.runs) end
end

function M.tick()
    local state=M.load()
    if not state or not state.enabled or state.paused or busy() then return 'IDLE' end
    local catalog=App.activeCatalog()
    if catalog:getPath()~=state.catalogPath then return 'OTHER_CATALOG' end
    local ready,phase,expected=M.scan(state,catalog)
    if #ready==0 then M.save(state);return phase end
    local label='Auto '..Date.timeToUserFormat(Date.currentTime(),'%Y-%m-%d %H%M%S')..' - '..tostring(Paths.leafName(state.folderPath))
    local ok,result=Tasks.pcall(function() return editor().autoEdit(ready,label,expected) end)
    if not ok then
        -- Stop on errors instead of retrying the same photos every minute.
        state.paused=true;state.lastError=tostring(result)
        remember(state,{time=Date.currentTime(),status='FAILED',error=tostring(result):sub(1,500),photos=#ready})
        M.save(state);return 'PAUSED_AFTER_ERROR'
    end
    if result.status=='CANCELLED' then state.paused=true end
    local edited={}
    local finished=result.status=='COMPLETED' or result.status=='COMPLETED_WITH_ERRORS'
    for _,record in ipairs(result.records or {}) do edited[record.id]=true end
    for _,photo in ipairs(ready) do
        local id=tostring(photo.localIdentifier)
        if edited[id] then state.processed[id]=true
        elseif finished then state.skipped[id]='NOT_CONFIRMED' end
        if state.processed[id] or state.skipped[id] then state.sightings[id]=nil end
    end
    remember(state,{time=Date.currentTime(),status=tostring(result.status),edited=#(result.records or {}),
        notComputed=#(result.failures or {}),session=result.dir,collection=label})
    state.lastError=nil
    M.save(state)
    if finished then
        pcall(function() Dialogs.showBezel('CRISPIX: '..#(result.records or {})..' fotos novas editadas automaticamente') end)
    end
    return tostring(result.status)
end

-- One loop per plugin load; a reload or shutdown bumps the generation and the old loop exits.
function M.startLoop()
    _G.CrispixAutoEditGeneration=(_G.CrispixAutoEditGeneration or 0)+1
    local generation=_G.CrispixAutoEditGeneration
    Tasks.startAsyncTask(function()
        while _G.CrispixAutoEditGeneration==generation do
            Tasks.sleep(M.INTERVAL)
            if _G.CrispixAutoEditGeneration~=generation then break end
            local ok,err=Tasks.pcall(M.tick)
            if not ok then
                local state=M.load()
                if state then state.paused=true;state.lastError=tostring(err);pcall(M.save,state) end
            end
        end
    end)
end
function M.stopLoop() _G.CrispixAutoEditGeneration=(_G.CrispixAutoEditGeneration or 0)+1 end

local function count(map) local n=0;for _ in pairs(map or {}) do n=n+1 end;return n end
function M.describe(state)
    if not state then return 'Edicao automatica desligada.' end
    local last=state.runs[1]
    return 'Pasta: '..tostring(state.folderPath)..'\nCatalogo: '..tostring(state.catalogPath)..
        '\nEstado: '..(not state.enabled and 'desligada' or state.paused and 'PAUSADA' or 'ativa (verifica a cada minuto)')..
        '\nFotos editadas: '..count(state.processed)..' | ignoradas: '..count(state.skipped)..' | aguardando: '..count(state.sightings)..
        (last and ('\nUltima execucao: '..tostring(last.status)..', '..tostring(last.edited or 0)..' editadas') or '')..
        (state.lastError and ('\nUltimo erro: '..tostring(state.lastError):sub(1,300)) or '')
end

function M.menu()
    local state=M.load();local catalog=App.activeCatalog()
    local f=(import 'LrView').osFactory()
    local action=Dialogs.presentModalDialog{title='CRISPIX - edicao automatica',contents=f:column{
        spacing=f:control_spacing(),
        f:static_text{title=M.describe(state),width=520,height_in_lines=7},
        f:static_text{title='Fotos novas importadas na pasta vigiada sao editadas DIRETAMENTE com as opcoes salvas da janela EDITAR FOTOS\n(estilo, intensidade, ajuste fino, preset e horizonte). Mascaras exigem novas copias.\nFotos alteradas por voce antes da edicao automatica sao preservadas. Use RESTAURAR para desfazer a ultima sessao.',width=520,height_in_lines=4}},
        actionVerb=state and state.enabled and (state.paused and 'Retomar' or 'Pausar') or 'Vigiar pasta da foto selecionada',
        otherVerb=state and state.enabled and 'Desligar' or nil,cancelVerb='Fechar'}
    if action=='ok' then
        if state and state.enabled then
            state.paused=not state.paused;if not state.paused then state.lastError=nil end
            M.save(state)
            if not state.paused then M.startLoop() end
            return state
        end
        local photo=catalog:getTargetPhoto()
        if not photo then error('Selecione uma foto da pasta que recebera as novas importacoes.') end
        local folderPath=Paths.parent(photo:getRawMetadata('path'))
        if Dialogs.confirm('CRISPIX - vigiar pasta','A partir de agora, fotos NOVAS importadas em\n'..tostring(folderPath)..
            '\nserao editadas automaticamente (direto, com registro para restauracao). As fotos que ja estao na pasta nao serao alteradas.',
            'Ligar edicao automatica','Cancelar')~='ok' then return state end
        state=M.enable(catalog,folderPath);M.startLoop()
        return state
    elseif action=='other' and state then
        state.enabled=false;M.save(state);M.stopLoop()
        return state
    end
    return state
end

-- Called from plugin init: resumes only a watch the user turned on explicitly.
function M.resumeIfEnabled()
    local state=M.load()
    if state and state.enabled and not state.paused then M.startLoop() end
end

return M
