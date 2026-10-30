local LrApplication = import 'LrApplication'
local LrBinding = import 'LrBinding'
local LrDialogs = import 'LrDialogs'
local LrFileUtils = import 'LrFileUtils'
local LrFunctionContext = import 'LrFunctionContext'
local LrPathUtils = import 'LrPathUtils'
local LrPrefs = import 'LrPrefs'
local LrTasks = import 'LrTasks'
local LrUUID = import 'LrUUID'
local LrView = import 'LrView'
local Json = dofile(LrPathUtils.child(_PLUGIN.path, 'Json.lua'))
local Engine = dofile(LrPathUtils.child(_PLUGIN.path, 'LocalAnalysis.lua'))
local M = {}
local targets = {'Exposure2012','Temperature','Tint','Contrast2012','Highlights2012','Shadows2012','Whites2012','Blacks2012','Saturation','Vibrance'}
local function child(p,n) return LrPathUtils.child(p,n) end
local function queueRoot() return child(child(LrPathUtils.getStandardFilePath('appData'),'MizinLightroomLocal'),'acervo') end
local function catalogPath(catalog) return catalog:getPath() end
local function writeJson(path,value)
    local text = Json.encode(value)
    if #text > 8*1024*1024 then error('A fila excede o limite desta versao; importe uma selecao menor.') end
    local f,e = io.open(path,'wb'); if not f then error(tostring(e)) end
    local ok,err=f:write(text);f:close();if not ok then error(tostring(err)) end
end
local function readJson(path)
    local f=io.open(path,'rb');if not f then return nil end
    local text=f:read(8*1024*1024+1);f:close();return Json.decode(text)
end
local function readQueue(path)
    local queue=readJson(path)
    local journal=io.open(path..'.journal','rb')
    if journal then
        local text=journal:read(4*1024*1024+1);journal:close()
        if #text>4*1024*1024 then error('Historico da fila excede o limite') end
        for line in text:gmatch('[^\r\n]+') do
            local ok,record=pcall(Json.decode,line)
            if ok and record.schema=='mizin-lightroom.queue-checkpoint/1' then
                for _,key in ipairs({'nextIndex','collected','failed','changedAfterApproval','paused','finished','lastError'}) do
                    queue[key]=record[key]
                end
            end
        end
    end
    return queue
end
local function saveQueue(path,queue)
    local record={schema='mizin-lightroom.queue-checkpoint/1'}
    for _,key in ipairs({'nextIndex','collected','failed','changedAfterApproval','paused','finished','lastError'}) do record[key]=queue[key] end
    local f,e=io.open(path..'.journal','ab');if not f then error(tostring(e)) end
    local ok,err=f:write('\n'..Json.encode(record)..'\n');f:close();if not ok then error(tostring(err)) end
end
local function header(operation)
    return {schema='mizin-lightroom.selection-request/1',operation=operation,
        jobId=LrUUID.generateUUID(),lightroomVersion=tostring(LrApplication.versionString())}
end
function M.snapshot(photo)
    local path=photo:getRawMetadata('path')
    if type(path)~='string' or not path:lower():match('%.cr3$') then return nil,'Formato fora do piloto CR3' end
    if photo:getRawMetadata('isVirtualCopy')~=false then return nil,'Copia virtual' end
    if photo:getRawMetadata('pickStatus')==-1 then return nil,'Foto rejeitada' end
    local settings=photo:getDevelopSettings()
    if settings.ConvertToGrayscale==true then return nil,'Foto P&B' end
    local current={}
    for _,key in ipairs(targets) do
        local n=settings[key]
        if type(n)~='number' or n~=n or math.abs(n)==math.huge then return nil,'Ajustes incompletos' end
        current[key]=n
    end
    local event=Engine.suggestEventName(path)
    if not event or event=='' then return nil,'Trabalho nao identificado' end
    return {id=tostring(photo.localIdentifier),path=path,current=current,treatment='color',isVirtualCopy=false,eventName=event}
end
function M.signature(row)
    local values={row.path,row.treatment}
    for _,key in ipairs(targets) do values[#values+1]=key..'='..string.format('%.17g',row.current[key]) end
    return table.concat(values,'|')
end
local function approve(rows,scope)
    local approved=false
    LrFunctionContext.callWithContext('MizinApproveAcervo',function(context)
        local props=LrBinding.makePropertyTable(context);props.approved=false
        local f=LrView.osFactory()
        local action=LrDialogs.presentModalDialog{title='Mizin Lightroom - aprender com edicoes prontas',
            contents=f:column{bind_to_object=props,spacing=f:control_spacing(),
                f:static_text{title=tostring(#rows)..' fotos em cor serao processadas em lotes automaticos.\n'..
                    'Os ajustes atuais precisam estar finais e aprovados. RAWs, catalogo e modelo anterior sao preservados.',width_in_chars=95,height_in_lines=2},
                f:checkbox{title='Confirmo que estas edicoes ja estao prontas para ensinar meu estilo.',value=LrView.bind('approved'),checked_value=true,unchecked_value=false},
                f:static_text{title='Fotos alteradas depois desta confirmacao ficam para uma nova revisao.\n'..
                    'O aprendizado e local e compartilhado entre os catalogos importados.',width_in_chars=95,height_in_lines=2}},
            actionVerb=scope=='catalog' and 'Aprender com este catalogo' or 'Registrar evento concluido',cancelVerb='Cancelar'}
        approved=action=='ok' and props.approved==true
    end)
    return approved
end
local function remember(path,catalog)
    local prefs=LrPrefs.prefsForPlugin();local queues=prefs.learningQueues or {}
    queues[catalog]=path;prefs.learningQueues=queues
end
local function queuePathFor(catalog)
    return (LrPrefs.prefsForPlugin().learningQueues or {})[catalog]
end
local function validQueuePath(path)
    if type(path)~='string' then return false end
    local normal=function(p) return p:gsub('\\','/'):lower() end
    return normal(path):sub(1,#normal(queueRoot())+1)==normal(queueRoot())..'/' and
        not normal(path):find('/%.%./',1) and normal(path):match('/[%w%-]+%.json$')~=nil
end
function M.process(path,auto)
    if _G.MizinAcervoBusy or _G.MizinEditorBusy then return end
    if not validQueuePath(path) then error('Fila de aprendizado invalida') end
    local queue=readQueue(path)
    if not queue or queue.schema~='mizin-lightroom.acervo-queue/1' then error('Fila de aprendizado incompativel') end
    if queue.catalogPath~=catalogPath(LrApplication.activeCatalog()) then return end
    if auto and (queue.paused or queue.finished) then return end
    _G.MizinAcervoBusy=true;_G.MizinLearningStop=false;queue.paused=false
    local ok,err=LrTasks.pcall(function()
        while queue.nextIndex<=#queue.photos do
            if _G.MizinLearningStop or queue.catalogPath~=catalogPath(LrApplication.activeCatalog()) then queue.paused=true;break end
            local catalog=LrApplication.activeCatalog()
            local batch,positions={},{};local cursor=queue.nextIndex
            local event=queue.photos[cursor].eventName
            while cursor<=#queue.photos and #batch<25 and queue.photos[cursor].eventName==event do
                local approved=queue.photos[cursor]
                local photo=catalog:findPhotoByPath(approved.path)
                local success,current=LrTasks.pcall(function() return photo and M.snapshot(photo) end)
                if success and current and M.signature(current)==M.signature(approved) then
                    batch[#batch+1]=approved;positions[#positions+1]=cursor
                else queue.changedAfterApproval=queue.changedAfterApproval+1 end
                cursor=cursor+1
            end
            if #batch>0 then
                local request=header('collect');request.photos=batch;request.eventName=event
                request.referencesApproved=true;request.referenceApprovalScope=queue.scope
                request.learnFromReferences=true;request.catalogIdentity=queue.catalogPath
                local report=Engine.run('collect',request,true)
                if not report or report.status=='FAILED' then error('Nao foi possivel concluir a etapa do aprendizado') end
                queue.collected=queue.collected+(report.collectedReferences or 0)
                queue.failed=queue.failed+(report.failedPhotos or 0)
                if report.status=='CANCELLED' then
                    queue.nextIndex=positions[#report.results+1] or cursor;queue.paused=true;saveQueue(path,queue);break
                end
            end
            queue.nextIndex=cursor;saveQueue(path,queue);LrTasks.yield()
        end
        queue.finished=queue.nextIndex>#queue.photos
        if queue.finished then Engine.run('learning-update',nil,true) end
        saveQueue(path,queue)
    end)
    _G.MizinAcervoBusy=false
    if not ok then queue.paused=true;queue.lastError=tostring(err);saveQueue(path,queue);error(tostring(err)) end
    if not auto then
        LrDialogs.message('Mizin Lightroom - acervo',
            (queue.finished and 'Importacao concluida.' or 'Importacao pausada; use Continuar aprendizado.')..'\n'..
            'Referencias coletadas: '..tostring(queue.collected)..'\nFalhas: '..tostring(queue.failed)..
            '\nFotos alteradas depois da aprovacao: '..tostring(queue.changedAfterApproval)..
            '\nUse Meu aprendizado para consultar a base e os modelos candidatos.','info')
    end
end
function M.import(scope)
    if _G.MizinAcervoBusy or _G.MizinEditorBusy then error('Ja existe uma tarefa do acervo ou edicao em andamento.') end
    local catalog=LrApplication.activeCatalog();local photos
    if scope=='catalog' then
        photos=catalog:findPhotos{searchDesc={criteria='hasAdjustments',operation='isTrue'}}
    else
        if not catalog:getTargetPhoto() then error('Selecione as fotos finais do evento, usando Ctrl+A na pasta se necessario.') end
        photos=catalog:getTargetPhotos()
    end
    local rows,events={},{}
    for i,photo in ipairs(photos) do
        local ok,row=LrTasks.pcall(function() return M.snapshot(photo) end)
        if ok and row then rows[#rows+1]=row;events[row.eventName]=true end
        if #rows>10000 then error('Mais de 10.000 referencias: importe eventos selecionados separadamente nesta versao.') end
        if i%25==0 then LrTasks.yield() end
    end
    if #rows==0 then error('Nao encontrei RAWs CR3 originais em cor com os dez ajustes disponiveis.') end
    local count=0;for _ in pairs(events) do count=count+1 end
    if scope=='event' and count~=1 then error('A selecao contem varios trabalhos. Use Aprender com catalogo para importar varios eventos.') end
    if not approve(rows,scope) then return end
    table.sort(rows,function(a,b) if a.eventName~=b.eventName then return a.eventName<b.eventName end return a.path<b.path end)
    local identity=catalogPath(catalog)
    local previous=queuePathFor(identity)
    if previous and validQueuePath(previous) then
        local old=readQueue(previous)
        if old and not old.finished then error('Existe uma importacao pendente deste catalogo. Use Continuar aprendizado primeiro.') end
    end
    LrFileUtils.createAllDirectories(queueRoot())
    local path=child(queueRoot(),LrUUID.generateUUID()..'.json')
    writeJson(path,{schema='mizin-lightroom.acervo-queue/1',catalogPath=identity,scope=scope,
        photos=rows,nextIndex=1,collected=0,failed=0,changedAfterApproval=0,paused=false,finished=false})
    remember(path,identity);M.process(path,false)
end
function M.resume(auto)
    if auto and not LrPrefs.prefsForPlugin().learningQueues then return end
    local path=queuePathFor(catalogPath(LrApplication.activeCatalog()))
    if not path then if not auto then error('Nao existe importacao pendente neste catalogo.') end;return end
    M.process(path,auto)
end
function M.feedback()
    local prefs=LrPrefs.prefsForPlugin();local selected=nil
    LrFunctionContext.callWithContext('MizinFeedback',function(context)
        local props=LrBinding.makePropertyTable(context);props.rating='ADJUSTED';props.note='';props.ask=prefs.askLearningFeedback==true
        local f=LrView.osFactory()
        local action=LrDialogs.presentModalDialog{title='Mizin Lightroom - sua opiniao',
            contents=f:column{bind_to_object=props,spacing=f:control_spacing(),
                f:static_text{title='Como ficaram as sugestoes? Sua opiniao ajuda a acompanhar a evolucao.',width_in_chars=85},
                f:popup_menu{value=LrView.bind('rating'),items={{title='Gostei das sugestoes',value='GOOD'},{title='Precisaram de ajustes',value='ADJUSTED'},{title='Nao ficaram boas',value='POOR'}}},
                f:edit_field{value=LrView.bind('note'),width_in_chars=75,height_in_lines=3},
                f:checkbox{title='Perguntar minha opiniao ao concluir uma analise',value=LrView.bind('ask'),checked_value=true,unchecked_value=false},
                f:static_text{title='Esta avaliacao nao transforma previsoes em referencias finais.\nDepois da sua revisao, use Registrar evento concluido para ensinar os ajustes aprovados.',width_in_chars=85,height_in_lines=2}},
            actionVerb='Salvar avaliacao',cancelVerb='Agora nao'}
        if action=='ok' then
            prefs.askLearningFeedback=props.ask==true
            selected={rating=props.rating,note=tostring(props.note or ''),analysisJobId=''}
            if prefs.lastSelectionRun then selected.analysisJobId=prefs.lastSelectionRun:match('([^/\\]+)$') or '' end
        end
    end)
    if selected then local request=header('feedback');request.feedback=selected;Engine.run('feedback',request,false) end
end
return M
