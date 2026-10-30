-- Independent application of our numeric predictions to verified NEW virtual copies.
local App=import 'LrApplication'
local View=import 'LrApplicationView'
local Binding=import 'LrBinding'
local Date=import 'LrDate'
local Digest=import 'LrDigest'
local Dialogs=import 'LrDialogs'
local Files=import 'LrFileUtils'
local Context=import 'LrFunctionContext'
local Paths=import 'LrPathUtils'
local Prefs=import 'LrPrefs'
local Progress=import 'LrProgressScope'
local Tasks=import 'LrTasks'
local UUID=import 'LrUUID'
local UI=import 'LrView'
local Json=dofile(Paths.child(_PLUGIN.path,'Json.lua'))
local Engine=dofile(Paths.child(_PLUGIN.path,'LocalAnalysis.lua'))
local M={}
local limits={Exposure2012={-5,5},Temperature={2000,50000},Tint={-150,150},Contrast2012={-100,100},
    Highlights2012={-100,100},Shadows2012={-100,100},Whites2012={-100,100},Blacks2012={-100,100},Saturation={-100,100},Vibrance={-100,100}}
local baseNumbers={SplitToningBalance={-100,100},SplitToningHighlightHue={0,360},SplitToningHighlightSaturation={0,100},
    SplitToningShadowHue={0,360},SplitToningShadowSaturation={0,100},ColorGradeBlending={0,100},ColorGradeGlobalHue={0,360},
    ColorGradeGlobalLum={-100,100},ColorGradeGlobalSat={0,100},ColorGradeHighlightLum={-100,100},ColorGradeMidtoneHue={0,360},
    ColorGradeMidtoneLum={-100,100},ColorGradeMidtoneSat={0,100},ColorGradeShadowLum={-100,100}}
local curves={'ToneCurvePV2012','ToneCurvePV2012Red','ToneCurvePV2012Green','ToneCurvePV2012Blue'}
local function child(p,n)return Paths.child(p,n) end
local function finite(n)return type(n)=='number' and n==n and math.abs(n)~=math.huge end
local function normal(p)return tostring(p):gsub('\\','/'):lower() end
local function editingRoot()return child(child(Paths.getStandardFilePath('appData'),'MizinLightroomLocal'),'editing') end
local function read(path)
    local f=io.open(path,'rb');if not f then return nil end
    local text=f:read(8*1024*1024+1);f:close();return Json.decode(text)
end
local function writeNew(path,value)
    if Files.exists(path) then error('Registro de edicao ja existe: '..path) end
    local text=Json.encode(value);if #text>1024*1024 then error('Registro de edicao excede o limite') end
    local f,e=io.open(path,'wb');if not f then error(tostring(e)) end
    local ok,err=f:write(text);local flushed,flushError=f:flush();local closed,closeError=f:close()
    if not ok or not flushed or not closed then error(tostring(err or flushError or closeError)) end
    local check=io.open(path,'rb');if not check then error('Nao foi possivel reler o registro de recuperacao') end
    local saved=check:read(#text+1);check:close()
    if saved~=text then error('O registro de recuperacao nao foi confirmado em disco') end
end
local function checkpoint(dir,index,stage,value)
    writeNew(child(dir,string.format('%03d-%s.json',index,stage)),value)
end
local function recorded(dir,index,stage)return read(child(dir,string.format('%03d-%s.json',index,stage))) end

function M.canonical(value)
    local active={};local total=0
    local function encode(v,depth)
        if depth>40 then error('Ajustes muito profundos para verificar com seguranca') end
        local kind=type(v)
        if v==nil then return 'nil;' end
        if kind=='number' then if not finite(v) then error('Ajuste numerico invalido') end;return 'n'..string.format('%.17g',v)..';' end
        if kind=='string' then return 's'..#v..':'..v end
        if kind=='boolean' then return v and 'true;' or 'false;' end
        if kind~='table' or active[v] then error('Formato dos ajustes nao suportado para verificacao') end
        active[v]=true;local keys={}
        for key in pairs(v) do
            if type(key)~='string' and type(key)~='number' then error('Chave de ajuste invalida') end
            keys[#keys+1]=key
        end
        table.sort(keys,function(a,b)return type(a)==type(b) and a<b or type(a)<type(b) end)
        local parts={'{'}
        for _,key in ipairs(keys) do
            total=total+1;if total>100000 then error('Quantidade de ajustes excede o limite') end
            parts[#parts+1]=encode(key,depth+1);parts[#parts+1]=encode(v[key],depth+1)
        end
        parts[#parts+1]='}';active[v]=nil;return table.concat(parts)
    end
    local result=encode(value,0);if #result>2*1024*1024 then error('Ajustes excedem o limite de verificacao') end;return result
end
function M.fingerprint(value)return Digest.SHA256.digest(M.canonical(value)) end
local function without(settings,excluded)
    local output={};for k,v in pairs(settings) do if excluded[k]==nil then output[k]=v end end;return output
end
local function affected(settings)
    local keys={};for key in pairs(settings) do keys[key]=true end
    if keys.Temperature then keys.CustomTemperature=true end
    if keys.Tint then keys.CustomTint=true end
    if keys.SplitToningBalance then keys.ColorGradeBalance=true end
    for _,part in ipairs({'Highlight','Shadow'}) do
        if keys['SplitToning'..part..'Hue'] then keys['ColorGrade'..part..'Hue']=true end
        if keys['SplitToning'..part..'Saturation'] then keys['ColorGrade'..part..'Sat']=true end
    end
    return keys
end
local function preserved(settings,planned)
    local out={};local changed=affected(planned)
    for key,value in pairs(settings) do
        if type(key)=='string' and not changed[key] and (key:match('^Crop') or key:match('^Mask') or key:match('^EnableMask') or
            key:match('Corrections$') or key:match('^Retouch') or key:match('^Lens') or key:match('^ColorNoise') or
            key:match('^Luminance') or key:match('^Sharp') or key:match('^HueAdjustment') or key:match('^SaturationAdjustment') or
            key:match('^ColorGrade') or key:match('^SplitToning') or key:match('^Grain') or key=='Look' or key=='CameraProfile' or
            key=='ProcessVersion' or key=='Clarity2012' or key=='Texture' or key=='Dehaze' or key=='ConvertToGrayscale') then out[key]=value end
    end
    return out
end
local function deepCopy(value)
    if type(value)~='table' then return value end
    local copy={};for k,v in pairs(value) do copy[k]=deepCopy(v) end;return copy
end

function M.settings(predictions,base,before)
    local settings={WhiteBalance='Custom'};local omitted={}
    for key,bound in pairs(limits) do
        local n=predictions and predictions[key]
        if not finite(n) or n<bound[1] or n>bound[2] then error('Sugestao invalida ou ausente: '..key) end
        local scale=key=='Exposure2012' and 100 or 1
        settings[key]=math.floor(n*scale+.5)/scale
    end
    if base then
        if base.schema~='mizin-lightroom.fixed-style-base/1' or base.supportedTreatment~='color' or base.completeStyle~=false then error('Base de estilo incompativel') end
        for _,key in ipairs(curves) do
            local curve=base.settings[key]
            if type(curve)~='table' or #curve<4 or #curve>64 or #curve%2~=0 or type(before[key])~='table' then error('Curva indisponivel/incompativel: '..key) end
            local x=-1
            for i=1,#curve,2 do
                if not finite(curve[i]) or not finite(curve[i+1]) or curve[i]<=x or curve[i]<0 or curve[i]>255 or curve[i+1]<0 or curve[i+1]>255 then error('Curva invalida') end
                x=curve[i]
            end
            if curve[1]~=0 or curve[#curve-1]~=255 then error('Curva sem extremos completos') end
            settings[key]=deepCopy(curve)
        end
        settings.ToneCurveName2012='Custom'
        for key,bound in pairs(baseNumbers) do
            local n=base.settings[key]
            if not finite(n) or n<bound[1] or n>bound[2] then error('Tonalidade invalida: '..key) end
            if finite(before[key]) then settings[key]=n else omitted[#omitted+1]=key end
        end
    end
    return settings,omitted
end
local function verifyApplied(actual,expected)
    for key,value in pairs(expected) do
        local got=actual[key]
        if type(value)=='number' then
            local tolerance=key=='Temperature' and 1 or key=='Exposure2012' and .011 or .01
            if not finite(got) or math.abs(got-value)>tolerance then return false,key end
        elseif M.canonical(got)~=M.canonical(value) then return false,key end
    end
    return true
end
local function exactlyPlanned(actual,expected)
    for key,value in pairs(expected) do if M.canonical(actual[key])~=M.canonical(value) then return false end end
    return true
end
local function sameCatalog(catalog,path)
    if App.activeCatalog():getPath()~=path or catalog:getPath()~=path then error('O catalogo ativo mudou; edicao interrompida.') end
end
local function sourceFor(catalog,record)
    local photo=catalog:findPhotoByPath(record.path)
    if not photo or tostring(photo.localIdentifier)~=record.id or photo:getRawMetadata('isVirtualCopy')~=false then error('Identidade da foto de origem mudou') end
    return photo
end
local function selectOnly(catalog,photo,module)
    View.switchToModule(module)
    catalog:setSelectedPhotos(photo,{photo});Tasks.yield()
    local selected=catalog:getTargetPhotos()
    if View.getCurrentModuleName()~=module or #selected~=1 or tostring(selected[1].localIdentifier)~=tostring(photo.localIdentifier) then
        error('Nao foi possivel isolar a foto. Confira filtros e selecao no Lightroom.')
    end
end
local function verifiedCopy(copy,source,record)
    if not copy or copy:getRawMetadata('isVirtualCopy')~=true or tostring(copy.localIdentifier)==record.id or
        normal(copy:getRawMetadata('path'))~=normal(record.path) then error('Lightroom nao retornou uma nova copia virtual valida') end
    local master=copy:getRawMetadata('masterPhoto')
    if not master or tostring(master.localIdentifier)~=tostring(source.localIdentifier) then error('Copia pertence a outra foto; nenhum ajuste foi aplicado') end
end
local function copyFor(catalog,record,copyId)
    local source=sourceFor(catalog,record)
    for _,copy in ipairs(source:getRawMetadata('virtualCopies') or {}) do
        if tostring(copy.localIdentifier)==tostring(copyId) then verifiedCopy(copy,source,record);return copy,source end
    end
    error('A copia virtual desta edicao nao foi localizada')
end
local function gate(catalog,title,fn)
    local done=false
    catalog:withWriteAccessDo(title,function()fn();done=true end,{timeout=20})
    if not done then error('O Lightroom nao liberou a gravacao. A etapa ficou interrompida.') end
end
local function snapshotId(source,name)
    for attempt=1,10 do
        local found=nil
        for _,snapshot in ipairs(source:getDevelopSnapshots() or {}) do
            if snapshot.name==name then
                if found or type(snapshot.snapshotID)~='string' or snapshot.snapshotID=='' then error('Identidade do snapshot ambigua') end
                found=snapshot.snapshotID
            end
        end
        if found then return found end
        Tasks.sleep(.2)
    end
    error('Lightroom nao confirmou o snapshot; ajustes nao serao aplicados')
end
local function options(count)
    local result=nil
    Context.callWithContext('MizinEditOptions',function(context)
        local props=Binding.makePropertyTable(context);props.base=true;props.variant='pilot'
        local f=UI.osFactory()
        local choice=Dialogs.presentModalDialog{title='Mizin Lightroom - editar copias virtuais',contents=f:column{bind_to_object=props,spacing=f:control_spacing(),
            f:static_text{title=tostring(count)..' fotos. O Lightroom criara uma nova copia virtual para cada original.\nO modelo calcula dez controles por foto; voce podera comparar a edicao com a origem.',width_in_chars=100,height_in_lines=2},
            f:popup_menu{value=UI.bind('variant'),items={{title='Piloto atual',value='pilot'},{title='Candidato do acervo (se ja treinado)',value='candidate'}}},
            f:checkbox{title='Incluir minhas curvas e tonalidade constantes do acervo aprovado',value=UI.bind('base')},
            f:static_text{title='As copias partem dos ajustes atuais. Perfil, HSL, mascaras, lentes e cortes sao mantidos.\nO modelo e experimental; para avaliar o estilo em fotos novas, use originais ainda nao editados.\nA ultima edicao pode ser restaurada enquanto as copias nao receberem novas alteracoes.',width_in_chars=100,height_in_lines=3}},
            actionVerb='Calcular e editar copias',cancelVerb='Cancelar'}
        if choice=='ok' then result={useBase=props.base==true,variant=props.variant} end
    end)
    return result
end
local function styleBase()
    local info=read(child(_PLUGIN.path,'BuildInfo.json'))
    local path=child(_PLUGIN.path,'StyleBase.lua');local f=io.open(path,'rb')
    if not f then error('Base de estilo ausente no pacote') end
    local text=f:read(128*1024+1);f:close()
    if #text>128*1024 or not info or Digest.SHA256.digest(text)~=info.styleBaseLuaSha256 then error('A base de estilo difere da incluida no pacote') end
    return dofile(path)
end
function M.capture(catalog)
    if not catalog:getTargetPhoto() then error('Selecione explicitamente de 1 a 25 RAWs originais em cor.') end
    local selected=catalog:getTargetPhotos();if #selected<1 or #selected>25 then error('A edicao inicial aceita de 1 a 25 fotos por vez.') end
    local records,photos={},{};local seen={}
    for _,photo in ipairs(selected) do
        local path=photo:getRawMetadata('path');local id=tostring(photo.localIdentifier)
        if seen[id] or type(path)~='string' or not path:lower():match('%.cr3$') or photo:getRawMetadata('isVirtualCopy')~=false then error('Selecione somente RAWs CR3 originais, sem copias virtuais.') end
        local settings=photo:getDevelopSettings()
        if settings.ConvertToGrayscale==true then error('O modelo de edicao atual aceita somente fotos em cor') end
        local current={};for key in pairs(limits) do if not finite(settings[key]) then error('Controle atual indisponivel: '..key) end;current[key]=settings[key] end
        records[#records+1]={id=id,path=path,beforeHash=M.fingerprint(settings),current=current}
        photos[#photos+1]={id=id,path=path,current=current,treatment='color',isVirtualCopy=false};seen[id]=true
    end
    return records,photos
end

function M.applyPlan(catalog,dir,manifest,progress)
    sameCatalog(catalog,manifest.catalogPath)
    for _,record in ipairs(manifest.photos) do
        if M.fingerprint(sourceFor(catalog,record):getDevelopSettings())~=record.beforeHash then error('Uma origem mudou depois da analise; calcule novamente.') end
    end
    local collection=nil;local copies={}
    gate(catalog,'Mizin: criar colecao da edicao',function()
        local parent=catalog:createCollectionSet('Mizin - Edicoes',nil,true)
        collection=catalog:createCollection('Edicao '..manifest.sessionId,parent,false)
        if not collection then error('Colecao de edicao ja existe') end
    end)
    for index,record in ipairs(manifest.photos) do
        if progress:isCanceled() or _G.MizinLearningStop then return 'CANCELLED',copies,collection end
        sameCatalog(catalog,manifest.catalogPath)
        local source=sourceFor(catalog,record)
        if M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('Uma origem mudou durante a preparacao') end
        selectOnly(catalog,source,'library');sameCatalog(catalog,manifest.catalogPath)
        if M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('A origem mudou durante a selecao; edicao interrompida.') end
        local existing={};for _,old in ipairs(source:getRawMetadata('virtualCopies') or {}) do existing[tostring(old.localIdentifier)]=true end
        checkpoint(dir,index,'creating',{sourceId=record.id,name=record.copyName})
        local created=catalog:createVirtualCopies(record.copyName)
        if type(created)~='table' or #created~=1 then error('Lightroom retornou quantidade inesperada de copias; revise a biblioteca.') end
        local copy=created[1];verifiedCopy(copy,source,record)
        if existing[tostring(copy.localIdentifier)] then error('Lightroom retornou uma copia preexistente; nenhum ajuste foi aplicado.') end
        copies[#copies+1]=copy
        checkpoint(dir,index,'copy',{copyId=tostring(copy.localIdentifier),sourceId=record.id})
        gate(catalog,'Mizin: reunir copias para revisao',function()collection:addPhotos({copy}) end)
        progress:setPortionComplete(index,#manifest.photos*2)
    end
    for index,record in ipairs(manifest.photos) do
        if progress:isCanceled() or _G.MizinLearningStop then return 'CANCELLED',copies,collection end
        sameCatalog(catalog,manifest.catalogPath)
        local copy,source=copyFor(catalog,record,tostring(copies[index].localIdentifier))
        selectOnly(catalog,copy,'develop');sameCatalog(catalog,manifest.catalogPath)
        if M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('A origem mudou antes da aplicacao') end
        local before=copy:getDevelopSettings();local beforeHash=M.fingerprint(before)
        local name='Mizin - Antes '..manifest.sessionId..' '..record.id
        gate(catalog,'Mizin: salvar estado anterior da copia',function()
            if copy:createDevelopSnapshot(name,false)~=true then error('Snapshot nao foi criado') end
        end)
        Tasks.yield();local snapshot=snapshotId(source,name)
        checkpoint(dir,index,'ready',{copyId=tostring(copy.localIdentifier),snapshotId=snapshot,beforeHash=beforeHash,
            untouchedHash=M.fingerprint(without(before,affected(record.settings))),snapshotName=name})
        -- Durable checkpoint exists before this copy receives any develop changes.
        local ok,err=Tasks.pcall(function()
            sameCatalog(catalog,manifest.catalogPath)
            if M.fingerprint(copy:getDevelopSettings())~=beforeHash then error('A copia mudou antes da aplicacao') end
            gate(catalog,'Mizin: aplicar edicao na copia',function()copy:applyDevelopSettings(record.settings,'Mizin - edicao local',false) end)
            Tasks.yield();local actual=copy:getDevelopSettings();local verified,key=verifyApplied(actual,record.settings)
            if not verified then error('Lightroom nao confirmou o ajuste: '..tostring(key)) end
            if M.fingerprint(preserved(actual,record.settings))~=M.fingerprint(preserved(before,record.settings)) then error('Houve mudanca em perfil, corte, mascaras ou outros controles preservados; revise a copia e use Restaurar.') end
            if M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('Os ajustes da origem mudaram externamente; edicao interrompida.') end
            checkpoint(dir,index,'applied',{copyId=tostring(copy.localIdentifier),afterHash=M.fingerprint(actual)})
        end)
        if not ok then
            local readOK,observed=Tasks.pcall(function()return M.fingerprint(copy:getDevelopSettings()) end)
            checkpoint(dir,index,'failed',{copyId=tostring(copy.localIdentifier),error=tostring(err),observedHash=readOK and observed or nil})
            error(tostring(err))
        end
        progress:setPortionComplete(#manifest.photos+index,#manifest.photos*2)
    end
    return 'COMPLETED',copies,collection
end

local function guarded(fn)
    if _G.MizinEditorBusy or _G.MizinEngineBusy or _G.MizinAcervoBusy then error('Aguarde a tarefa atual antes de editar ou restaurar.') end
    _G.MizinEditorBusy=true;_G.MizinLearningStop=false
    local ok,result=Tasks.pcall(fn);_G.MizinEditorBusy=false;_G.MizinEditorAnalysisJob=nil
    if not ok then error(tostring(result)) end;return result
end
function M.edit()
    return guarded(function()
        local catalog=App.activeCatalog();local path=catalog:getPath()
        local records,photos=M.capture(catalog);local choice=options(#records);if not choice then return end
        local base=choice.useBase and styleBase() or nil
        local request={schema='mizin-lightroom.selection-request/1',operation='analyze',jobId=UUID.generateUUID(),lightroomVersion=tostring(App.versionString()),photos=photos}
        _G.MizinEditorAnalysisJob=request.jobId
        local report,analysisJob=Engine.run('analyze',request,true,choice.variant=='candidate' and 'candidate' or nil)
        _G.MizinEditorAnalysisJob=nil
        if not report or report.schema~='mizin-lightroom.selection-analysis/1' or report.operation~='analyze' or report.status~='COMPLETED' or
            type(report.results)~='table' or #report.results~=#records then error('Analise incompleta; nenhuma edicao foi aplicada. Consulte os ultimos resultados.') end
        sameCatalog(catalog,path)
        local predictions={};local paths={}
        for _,row in ipairs(report.results) do
            if row.status~='COMPUTED' or not row.id or predictions[row.id] then error('Analise de edicao incompativel') end
            predictions[row.id]=row.predictions;paths[row.id]=row.path
        end
        for _,record in ipairs(records) do
            if normal(paths[record.id])~=normal(record.path) then error('A previsao nao corresponde ao arquivo selecionado') end
            local source=sourceFor(catalog,record);local before=source:getDevelopSettings()
            if M.fingerprint(before)~=record.beforeHash then error('Uma origem foi alterada depois da confirmacao; calcule novamente.') end
            record.settings,record.omittedBaseKeys=M.settings(predictions[record.id],base,before)
        end
        local session=UUID.generateUUID();local dir=child(editingRoot(),session)
        if Files.exists(dir) then error('Identificador de edicao repetido') end
        Files.createAllDirectories(dir)
        for _,record in ipairs(records) do record.copyName='Mizin '..session..' - '..record.id end
        local manifest={schema='mizin-lightroom.edit-session/1',sessionId=session,catalogPath=path,analysisJob=analysisJob,
            modelSha256=report.modelSha256,usingCandidate=report.usingCandidateModel==true,useFixedBase=choice.useBase,
            started=Date.currentTime(),photos=records,mode='NEW_VIRTUAL_COPIES_ONLY'}
        writeNew(child(dir,'session.json'),manifest);Prefs.prefsForPlugin().lastEditSession=dir
        local result=nil
        Context.callWithContext('MizinApplyEdits',function(context)
            local progress=Progress{title='Mizin Lightroom - editar copias',functionContext=context}
            progress:setCancelable(true)
            local ok,status,copies,collection=Tasks.pcall(function()return M.applyPlan(catalog,dir,manifest,progress) end)
            progress:done()
            if not ok then writeNew(child(dir,'outcome.json'),{status='FAILED',error=tostring(status)});error(tostring(status)..'\nAs copias criadas ficam na colecao da edicao. Use Restaurar ultima edicao se necessario.') end
            writeNew(child(dir,'outcome.json'),{status=status,createdCopies=#copies});result=status
            if collection and #copies>0 then catalog:setActiveSources({collection});catalog:setSelectedPhotos(copies[1],copies) end
        end)
        Dialogs.message('Mizin Lightroom - edicao local',result=='COMPLETED' and 'Edicao aplicada nas novas copias virtuais. Compare-as com as origens na colecao Mizin - Edicoes.' or
            'Edicao cancelada. As copias ja criadas ficaram na colecao para revisao.','info')
        return dir
    end)
end

function M.restoreSession(dir)
    local norm=normal(dir);local prefix=normal(editingRoot())..'/'
    if norm:sub(1,#prefix)~=prefix or not norm:sub(#prefix+1):match('^[%w%-]+$') then error('Pasta de edicao invalida') end
    local manifest=read(child(dir,'session.json'));local catalog=App.activeCatalog()
    if not manifest or manifest.schema~='mizin-lightroom.edit-session/1' or manifest.mode~='NEW_VIRTUAL_COPIES_ONLY' or
        type(manifest.photos)~='table' or #manifest.photos>25 then error('Registro de edicao incompativel') end
    sameCatalog(catalog,manifest.catalogPath)
    local restored,skipped=0,0;local issues={}
    for index,record in ipairs(manifest.photos) do
        sameCatalog(catalog,manifest.catalogPath)
        local ready=recorded(dir,index,'ready')
        if ready and not recorded(dir,index,'restored') then
            local ok,err=Tasks.pcall(function()
                local copy,source=copyFor(catalog,record,ready.copyId)
                local sourceHash=M.fingerprint(source:getDevelopSettings())
                local actual=copy:getDevelopSettings();local currentHash=M.fingerprint(actual)
                if currentHash~=ready.beforeHash then
                    local applied=recorded(dir,index,'applied');local failed=recorded(dir,index,'failed')
                    local expected=(applied and applied.afterHash) or (failed and failed.observedHash)
                    local planned=exactlyPlanned(actual,record.settings)
                    if currentHash~=expected and not (expected==nil and planned and M.fingerprint(without(actual,affected(record.settings)))==ready.untouchedHash) then
                        error('A copia recebeu outras alteracoes; restauracao automatica preservou essas mudancas.')
                    end
                    if snapshotId(source,ready.snapshotName)~=ready.snapshotId then error('Snapshot anterior nao confere') end
                    selectOnly(catalog,copy,'develop');sameCatalog(catalog,manifest.catalogPath)
                    if M.fingerprint(copy:getDevelopSettings())~=currentHash then error('A copia mudou durante a restauracao') end
                    gate(catalog,'Mizin: restaurar copia da ultima edicao',function()copy:applyDevelopSnapshot(ready.snapshotId) end)
                    Tasks.yield()
                    if M.fingerprint(copy:getDevelopSettings())~=ready.beforeHash then error('Lightroom nao confirmou a restauracao completa') end
                end
                if M.fingerprint(source:getDevelopSettings())~=sourceHash then error('Os ajustes da origem mudaram externamente durante a restauracao') end
                checkpoint(dir,index,'restored',{copyId=ready.copyId,restored=true});restored=restored+1
            end)
            if not ok then skipped=skipped+1;issues[#issues+1]={sourceId=record.id,error=tostring(err)} end
        end
    end
    if #issues>0 then writeNew(child(dir,'restore-issues-'..UUID.generateUUID()..'.json'),{issues=issues}) end
    return restored,skipped,issues
end
function M.restoreLatest()
    return guarded(function()
        local dir=Prefs.prefsForPlugin().lastEditSession;if not dir then error('Nenhuma edicao local registrada') end
        local restored,skipped,issues=M.restoreSession(dir);local details={}
        for i,issue in ipairs(issues) do if i<=5 then details[#details+1]=issue.sourceId..': '..issue.error end end
        Dialogs.message('Mizin Lightroom - restauracao','Copias restauradas/ja no estado anterior: '..tostring(restored)..
            '\nCopias preservadas para revisao por alteracao/erro: '..tostring(skipped)..'\nAs copias e snapshots continuam disponiveis.\n'..table.concat(details,'\n'),'info')
    end)
end
return M
