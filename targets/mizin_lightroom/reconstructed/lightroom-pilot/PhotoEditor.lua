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
local extra={Texture=true,Clarity2012=true,Dehaze=true,ParametricShadows=true,
    ParametricDarks=true,ParametricLights=true,ParametricHighlights=true}
for _,channel in ipairs({'Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta'}) do
    for _,prefix in ipairs({'HueAdjustment','SaturationAdjustment','LuminanceAdjustment'}) do extra[prefix..channel]=true end
    -- Only a P&B model predicts the gray mixer; settings() applies it only where the photo has it.
    extra['GrayMixer'..channel]=true
end
-- Fine style adjustment ("ajuste fino"): photographer offsets applied after the model.
local styleControls={
    {name='exposure',key='Exposure2012',title='Exposição',limit=2,step=.05,precision=2},
    {name='temperature',key='Temperature',title='Temperatura',limit=3000,step=50,precision=0},
    {name='tint',key='Tint',title='Matiz',limit=50,step=1,precision=0},
    {name='contrast',key='Contrast2012',title='Contraste',limit=50,step=1,precision=0},
    {name='highlights',key='Highlights2012',title='Realces',limit=50,step=1,precision=0},
    {name='shadows',key='Shadows2012',title='Sombras',limit=50,step=1,precision=0},
    {name='whites',key='Whites2012',title='Brancos',limit=50,step=1,precision=0},
    {name='blacks',key='Blacks2012',title='Pretos',limit=50,step=1,precision=0},
    {name='saturation',key='Saturation',title='Saturação',limit=50,step=1,precision=0},
    {name='vibrance',key='Vibrance',title='Vibratilidade',limit=50,step=1,precision=0},
    {name='texture',key='Texture',title='Textura',limit=50,step=1,precision=0},
    {name='clarity',key='Clarity2012',title='Claridade',limit=50,step=1,precision=0},
    {name='dehaze',key='Dehaze',title='Desembaçar',limit=50,step=1,precision=0},
}
-- A complementary Lightroom preset never touches geometry, local edits or process version.
local function presetBlocked(key)
    return key=='ProcessVersion' or key=='Orientation' or key=='HasCrop' or key:match('^Crop') or key:match('^Mask') or key:match('^EnableMask') or
        key:match('Corrections$') or key:match('^Retouch') or key:match('^RedEye') or key:match('^Upright') or
        key:match('^Perspective') or key=='EnableRetouch' or key=='EnableRedEye' or key=='EnableCircularGradientBasedCorrections' or
        key=='EnableGradientBasedCorrections' or key=='EnablePaintBasedCorrections'
end
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
    local text=Json.encode(value);if #text>8*1024*1024 then error('Registro de edicao excede o limite de seguranca de 8 MiB') end
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
local function maskKey(key)
    return key:match('^Mask') or key:match('^EnableMask') or key:match('Corrections$') or key:match('^EnableCircular') or
        key:match('^EnableGradient') or key:match('^EnablePaint')
end
-- masks=true only when an adaptive Lightroom preset was deliberately applied to a new copy.
local function preserved(settings,planned,masks)
    local out={};local changed=affected(planned)
    -- A planned straighten owns the whole crop group: Lightroom may refresh derived crop
    -- fields (constraint flags, sizes) alongside the five values we write.
    local cropPlanned=planned.CropAngle~=nil
    for key,value in pairs(settings) do
        if type(key)=='string' and not changed[key] and not (masks and maskKey(key)) and not (cropPlanned and key:match('^Crop')) and (key:match('^Crop') or key:match('^Mask') or key:match('^EnableMask') or
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
    for key,n in pairs(predictions or {}) do
        if extra[key] then
            if not finite(n) or n < -100 or n > 100 then error('Sugestao adicional invalida: '..key) end
            if finite(before[key]) then settings[key]=math.floor(n+.5)
            else omitted[#omitted+1]=key end
        elseif not limits[key] then error('Controle previsto desconhecido: '..tostring(key)) end
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

-- Intensity blends each prediction with the value the photo had before editing;
-- fine offsets are added afterwards. Results stay inside the SDK limits.
function M.adjust(predictions,before,adjust)
    if not adjust then return predictions end
    local intensity=adjust.intensity==nil and 100 or adjust.intensity
    if not finite(intensity) or intensity<0 or intensity>100 then error('Intensidade da edicao invalida') end
    local k=intensity/100;local out={}
    for key,value in pairs(predictions or {}) do
        out[key]=value
        if finite(value) and finite(before[key]) then out[key]=before[key]+k*(value-before[key]) end
    end
    for _,control in ipairs(styleControls) do
        local offset=adjust[control.name]
        if offset~=nil and offset~=0 then
            if not finite(offset) or math.abs(offset)>control.limit then error('Ajuste fino invalido: '..control.title) end
            local value=out[control.key]
            if not finite(value) and extra[control.key] and finite(before[control.key]) then value=before[control.key] end
            if finite(value) then out[control.key]=value+offset end
        end
    end
    for key,value in pairs(out) do
        local bound=limits[key] or (extra[key] and {-100,100})
        if bound and finite(value) then out[key]=math.max(bound[1],math.min(bound[2],value)) end
    end
    return out
end

function M.presetSettings(preset)
    local ok,values=Tasks.pcall(function() return preset:getSetting() end)
    if not ok or type(values)~='table' then error('O preset escolhido nao esta disponivel') end
    local out={}
    for key,value in pairs(values) do
        if type(key)=='string' and not presetBlocked(key) then out[key]=deepCopy(value) end
    end
    M.canonical(out)
    return out
end
-- Model predictions win; the preset fills only controls the plan does not set.
-- With `before` (direct editing), keys the photo does not have are skipped so the
-- saved previous state can restore every changed control exactly.
function M.mergePreset(settings,preset,before)
    local planned=affected(settings);local keys={}
    for key,value in pairs(preset or {}) do
        if not planned[key] and (before==nil or before[key]~=nil) then settings[key]=deepCopy(value);keys[#keys+1]=key end
    end
    table.sort(keys);return keys
end

-- Lightroom CropAngle sign relative to the image-space slope. Pending native confirmation:
-- kept in one place so QA on a known tilted photo can flip it if needed.
local HORIZON_SIGN=1
-- Real catalog evidence (3,601 photos, candidate-settings.jsonl): 0 of 2,201 photos with
-- all five crop fields present had an EXACT default crop (CropAngle=0, CropTop/Left=0,
-- CropBottom/Right=1) -- every photo carries at least a tiny residual from a lens profile,
-- prior preview correction, or similar automatic step. Requiring an exact match therefore
-- rejected 100% of real photos regardless of whether the detector found a usable horizon.
-- Tolerating a small residual: <=5% margin (covers automatic-correction-sized residuals;
-- only ~25% of real crops are below this, so most deliberately-reframed photos stay
-- outside it and keep their crop untouched) and <=0.5 degree angle (above the ~4% of
-- photos that are pure noise below 0.05deg, below the point where the histogram shows a
-- real prior leveling attempt, which becomes common starting around 0.5-1deg) together
-- make ~26% of the real catalog eligible, versus 0% before.
local CROP_MARGIN_TOLERANCE=.05
local CROP_ANGLE_TOLERANCE=.5
local function withinCropTolerance(before)
    local function near(key,value,tolerance) return before[key]==nil or (finite(before[key]) and math.abs(before[key]-value)<=tolerance) end
    return near('CropAngle',0,CROP_ANGLE_TOLERANCE) and near('CropTop',0,CROP_MARGIN_TOLERANCE) and
        near('CropLeft',0,CROP_MARGIN_TOLERANCE) and near('CropBottom',1,CROP_MARGIN_TOLERANCE) and near('CropRight',1,CROP_MARGIN_TOLERANCE)
end
-- Lightroom crop convention, measured (not assumed) on the 127 centered straightens that
-- Lightroom itself produced in the photographer's approved catalog: 111 match this model to
-- 0.002, the other 16 were deliberately tightened afterwards. CropTop/CropLeft and
-- CropBottom/CropRight are the top-left and bottom-right CORNERS of the rotated crop
-- rectangle, normalized to the UNORIENTED sensor frame (a portrait photo keeps the landscape
-- sensor axes). The former equal-margin crop described a different, invalid rectangle.
-- Positive CropAngle rotates the crop clockwise; the detector agreed in sign with the
-- photographer on 8 of 9 tilted photos, so HORIZON_SIGN stays 1.
local CROP_SAFETY=.001
local function round6(n)return math.floor(n*1000000+.5)/1000000 end
function M.cropFor(angle,sensorWidth,sensorHeight)
    local a=math.rad(math.abs(angle))
    local scale=math.min(sensorWidth/(sensorWidth*math.cos(a)+sensorHeight*math.sin(a)),
        sensorHeight/(sensorWidth*math.sin(a)+sensorHeight*math.cos(a)))*(1-CROP_SAFETY)
    local c,s=math.cos(math.rad(angle)),math.sin(math.rad(angle))
    local left=.5-scale/2*(c-sensorHeight/sensorWidth*s)
    local top=.5-scale/2*(c+sensorWidth/sensorHeight*s)
    return round6(top),round6(left),round6(1-top),round6(1-left)
end
-- Straightens using the largest centered crop with the original aspect ratio that has no empty corners.
-- The returned reason is one of a small fixed vocabulary (never per-photo variable text),
-- so callers can tally and report exactly why each photo was or was not straightened.
function M.horizon(settings,before,proposal)
    if type(proposal)~='table' then return nil,'geometria nao foi calculada para esta foto' end
    if proposal.status~='PROPOSAL_ONLY' then
        if proposal.reason=='ALREADY_LEVEL' then return nil,'esta foto ja esta nivelada' end
        if proposal.reason=='ANALYSIS_FAILED' then return nil,'nao foi possivel analisar o horizonte desta foto' end
        if proposal.reason=='LIKELY_INTENTIONAL_TILT' then return nil,'inclinacao acima de 5 graus mantida (provavelmente intencional)' end
        if proposal.reason=='EYES_WITHOUT_SCENE_SUPPORT' then return nil,'olhos encontrados, mas sem referencia segura do ambiente' end
        if proposal.reason=='SCENE_EYES_DISAGREE' then return nil,'ambiente e olhos nao confirmam o mesmo eixo' end
        return nil,'sem referencias confiaveis de ambiente e olhos nesta foto'
    end
    local angle,width,height=proposal.imageSlopeDegrees,proposal.imageWidth,proposal.imageHeight
    if not finite(angle) or math.abs(angle)<.25 or math.abs(angle)>8 or not finite(width) or not finite(height) or width<=0 or height<=0 then
        return nil,'proposta fora dos limites de seguranca'
    end
    if not withinCropTolerance(before) then return nil,'corte existente alem da tolerancia foi preservado' end
    -- The render is oriented; the crop lives in the sensor frame. An engine that does not
    -- report the swap is assumed to have a landscape sensor (every supported CR3 body).
    local sensorWidth,sensorHeight=math.max(width,height),math.min(width,height)
    if type(proposal.sensorSwapped)=='boolean' then
        sensorWidth,sensorHeight=width,height
        if proposal.sensorSwapped then sensorWidth,sensorHeight=height,width end
    end
    settings.CropAngle=HORIZON_SIGN*math.floor(angle*100+.5)/100
    settings.CropTop,settings.CropLeft,settings.CropBottom,settings.CropRight=M.cropFor(settings.CropAngle,sensorWidth,sensorHeight)
    -- HasCrop belongs to XMP, not the SDK's readable develop-settings contract.
    -- Lightroom can omit it even after applying the five numeric crop controls.
    return settings.CropAngle
end
local function presetChoices()
    local items={{title='Nenhum',value=''}}
    local ok=Tasks.pcall(function()
        for _,folder in ipairs(App.developPresetFolders() or {}) do
            for _,preset in ipairs(folder:getDevelopPresets() or {}) do
                if #items>600 then return end
                items[#items+1]={title=tostring(folder:getName())..' / '..tostring(preset:getName()),value=tostring(preset:getUuid())}
            end
        end
    end)
    return items
end
local function skipSet(list)
    local set={};for _,key in ipairs(list or {}) do set[key]=true end;return set
end
local function verifyApplied(actual,expected,skip)
    -- Preset values may be normalized by Lightroom; afterHash still records the observed state.
    for key,value in pairs(expected) do
        if key~='HasCrop' and not (skip and skip[key]) then
            local got=actual[key]
            if type(value)=='number' then
                local tolerance=key=='Temperature' and 1 or key=='Exposure2012' and .011 or
                    (key:match('^Crop') and key~='CropAngle') and .0001 or .01
                if not finite(got) or math.abs(got-value)>tolerance then return false,key end
            elseif M.canonical(got)~=M.canonical(value) then return false,key end
        end
    end
    return true
end
local function exactlyPlanned(actual,expected,skip)
    for key,value in pairs(expected) do
        if key~='HasCrop' and not (skip and skip[key]) and M.canonical(actual[key])~=M.canonical(value) then return false end
    end
    return true
end
-- Give the host a bounded opportunity to commit its readback. Never re-apply settings.
local function readApplied(photo,record)
    local actual,verified,key
    for attempt=1,6 do
        actual=photo:getDevelopSettings()
        verified,key=verifyApplied(actual,record.settings,skipSet(record.presetKeys))
        if verified then return actual end
        if attempt<6 then Tasks.sleep(.2) end
    end
    error('Ajuste nao confirmado: '..tostring(key))
end
local function application(manifest)
    local result={completed=0,failed=0,straightened=0,issues={},completedIds={}}
    manifest.application=result;return result
end
local function appliedPhoto(result,record)
    result.completed=result.completed+1;result.completedIds[record.id]=true
    if record.horizon and record.horizon.cropAngle then result.straightened=result.straightened+1 end
end
local function failedPhoto(result,record,err)
    result.failed=result.failed+1
    result.issues[#result.issues+1]={sourceId=record.id,path=record.path,error=tostring(err)}
end
local function sameCatalog(catalog,path)
    if App.activeCatalog():getPath()~=path or catalog:getPath()~=path then error('O catalogo ativo mudou; edicao interrompida.') end
end
local function sourceFor(catalog,record)
    local master=catalog:findPhotoByPath(record.path)
    if not master then error('Foto de origem indisponivel') end
    if tostring(master.localIdentifier)==record.id then return master end
    for _,copy in ipairs(master:getRawMetadata('virtualCopies') or {}) do
        if tostring(copy.localIdentifier)==record.id then return copy end
    end
    error('Identidade da foto de origem mudou')
end
local function requireSelected(catalog,photo,module)
    local selected=catalog:getTargetPhotos();local target=catalog:getTargetPhoto()
    if View.getCurrentModuleName()~=module or #selected~=1 or not target or
        tostring(target.localIdentifier)~=tostring(photo.localIdentifier) or tostring(selected[1].localIdentifier)~=tostring(photo.localIdentifier) then
        error('Nao foi possivel isolar a foto. Confira filtros e selecao no Lightroom.')
    end
end
local function selectOnly(catalog,photo,module)
    if View.getCurrentModuleName()~=module then View.switchToModule(module) end
    catalog:setSelectedPhotos(photo,{photo});Tasks.yield();requireSelected(catalog,photo,module)
end
local function verifiedCopy(copy,source,record)
    if not copy or copy:getRawMetadata('isVirtualCopy')~=true or tostring(copy.localIdentifier)==record.id or
        normal(copy:getRawMetadata('path'))~=normal(record.path) then error('Lightroom nao retornou uma nova copia virtual valida') end
    local master=copy:getRawMetadata('masterPhoto')
    local expected=source:getRawMetadata('isVirtualCopy') and source:getRawMetadata('masterPhoto') or source
    if not master or not expected or tostring(master.localIdentifier)~=tostring(expected.localIdentifier) then error('Copia pertence a outra foto; nenhum ajuste foi aplicado') end
end
local function copyFor(catalog,record,copyId)
    local source=sourceFor(catalog,record)
    local master=source:getRawMetadata('isVirtualCopy') and source:getRawMetadata('masterPhoto') or source
    for _,copy in ipairs(master:getRawMetadata('virtualCopies') or {}) do
        if tostring(copy.localIdentifier)==tostring(copyId) then verifiedCopy(copy,source,record);return copy,source end
    end
    error('A copia virtual desta edicao nao foi localizada')
end
local function gate(catalog,title,fn)
    local done=false
    catalog:withWriteAccessDo(title,function()sameCatalog(catalog,catalog:getPath());fn();done=true end,{timeout=20})
    if not done then error('O Lightroom nao liberou a gravacao. A etapa ficou interrompida.') end
end
local function snapshotId(source,name)
    if source:getRawMetadata('isVirtualCopy') then source=source:getRawMetadata('masterPhoto') end
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
local function remembered()
    local saved=Prefs.prefsForPlugin().editOptions
    return type(saved)=='table' and saved or {}
end
function M.validOptions(saved)
    local style={intensity=100}
    if finite(saved.intensity) and saved.intensity>=0 and saved.intensity<=100 then style.intensity=math.floor(saved.intensity+.5) end
    for _,control in ipairs(styleControls) do
        local value=saved[control.name]
        style[control.name]=(finite(value) and math.abs(value)<=control.limit) and value or 0
    end
    return style
end
local function styleRow(f,control)
    return f:row{
        f:static_text{title=control.title,width=82},
        f:slider{value=UI.bind(control.name),min=-control.limit,max=control.limit,integral=control.precision==0,width=120},
        f:edit_field{value=UI.bind(control.name),min=-control.limit,max=control.limit,precision=control.precision,increment=control.step,width_in_digits=6}}
end
local function options(count,inPlace)
    local result=nil
    Context.callWithContext('MizinEditOptions',function(context)
        local saved=remembered();local style=M.validOptions(saved)
        local props=Binding.makePropertyTable(context);props.base=saved.base==true;props.variant=saved.variant=='candidate' and 'candidate' or 'pilot';props.project='';props.destination=inPlace and 'selection' or 'copies'
        props.preset=type(saved.preset)=='string' and saved.preset or '';props.scene=saved.scene==true
        props.horizon=saved.horizon==true;props.mask=type(saved.mask)=='string' and saved.mask or ''
        for key,value in pairs(style) do props[key]=value end
        local presets=presetChoices();local known={}
        for _,item in ipairs(presets) do known[item.value]=true end
        if not known[props.preset] then props.preset='' end
        if not known[props.mask] then props.mask='' end
        local f=UI.osFactory()
        local left,right={spacing=f:control_spacing()},{spacing=f:control_spacing()}
        for index,control in ipairs(styleControls) do
            local column=index<=7 and left or right
            column[#column+1]=styleRow(f,control)
        end
        right[#right+1]=f:push_button{title='Zerar ajuste fino',action=function()
            props.intensity=100;for _,control in ipairs(styleControls) do props[control.name]=0 end end}
        -- Scrolled so the dialog's own window stays short on smaller/1080p screens;
        -- everything below was previously a single unbounded column.
        local body=f:column{bind_to_object=props,spacing=f:control_spacing(),width=500,
            f:row{f:static_text{title=tostring(count)..' FOTOS EM COR',font='<system/bold>'},f:static_text{title='   •   Processamento neste computador'}},
            f:group_box{title='TRABALHO',width=500,spacing=f:control_spacing(),
                f:static_text{title='Nome da sessão (opcional)'},
                f:edit_field{value=UI.bind('project'),width=470}},
            f:group_box{title='ESTILO E DESTINO',width=500,spacing=f:control_spacing(),
                f:static_text{title='Modelo de edição'},
                f:popup_menu{value=UI.bind('variant'),items={{title='Meu estilo • piloto atual',value='pilot'},{title='Meu estilo • candidato do acervo (requer treino)',value='candidate'}},width=470},
                f:static_text{title='Onde aplicar'},
                f:popup_menu{value=UI.bind('destination'),items={{title='Na seleção atual • sem duplicar',value='selection'},{title='Em novas cópias • teste e comparação',value='copies'}},width=470}},
            f:group_box{title='OPÇÕES DE ESTILO',spacing=f:control_spacing(),
                f:checkbox{title='Acrescentar curvas e tonalidade do acervo aprovado',value=UI.bind('base')},
                f:checkbox{title='Equilibrar balanço de branco entre fotos da mesma cena (sequências)',value=UI.bind('scene')},
                f:checkbox{title='Nivelar foto: analisar ambiente e linha dos olhos (experimental)',value=UI.bind('horizon')},
                f:static_text{title='Analisa todas as fotos do lote. Olhos ajudam a confirmar o ambiente;\ncabecas inclinadas ou sinais conflitantes nao devem forcar uma rotacao.',width=480,height_in_lines=2},
                f:static_text{title='Máscara de pessoa/céu: preset adaptativo do Lightroom (somente em novas cópias; ignorada ao aplicar na seleção atual)'},
                f:popup_menu{value=UI.bind('mask'),items=presets,width=470},
                f:static_text{title='Preset complementar do Lightroom (perfil, granulação, vinheta...)'},
                f:popup_menu{value=UI.bind('preset'),items=presets,width=470},
                f:static_text{title='O preset não altera corte, máscaras, retoques nem versão de processo; o modelo prevalece nos controles que calcula.',width=470,height_in_lines=2}},
            f:group_box{title='AJUSTE FINO DO ESTILO',spacing=f:control_spacing(),
                f:static_text{title='Isto NÃO é o ajuste de cada foto: o modelo já calcula um valor próprio por foto automaticamente, sem precisar abrir esta janela. Os campos abaixo somam o MESMO deslocamento a TODAS as fotos desta edição, e ficam salvos daqui para frente (inclusive na próxima vez) até você mudar ou zerar.',width=470,height_in_lines=4},
                f:row{f:static_text{title='Intensidade (%)',width=82},
                    f:slider{value=UI.bind('intensity'),min=0,max=100,integral=true,width=120},
                    f:edit_field{value=UI.bind('intensity'),min=0,max=100,precision=0,increment=5,width_in_digits=6}},
                f:row{f:column(left),f:spacer{width=12},f:column(right)},
                f:static_text{title='Intensidade mistura a sugestão (já calculada por foto) com o valor atual de cada foto.',width=470,height_in_lines=2}},
            f:group_box{title='ANTES DE INICIAR',spacing=f:control_spacing(),
                f:static_text{title='Os controles previstos substituem os valores atuais.\nO modelo é experimental; não é uma revisão conservadora.\nA restauração usa a última sessão e preserva alterações posteriores.',width=470,height_in_lines=3}},
            f:static_text{title='Entrada RAW CR3 • Outros formatos e P&B são ignorados com aviso',width=470}}
        local choice=Dialogs.presentModalDialog{title='CRISPIX - preparar edicao',contents=f:column{spacing=f:control_spacing(),width=520,
            f:row{fill_horizontal=1,alignment='center',
                f:spacer{fill_horizontal=1},
                f:picture{value=child(_PLUGIN.path,'Branding/crispix-header.png'),width=340,height=92},
                f:spacer{fill_horizontal=1}},
            f:scrolled_view{width=520,height=480,horizontal_scroller=false,body}},
            actionVerb='Iniciar edicao',cancelVerb='Cancelar'}
        if choice=='ok' then
            local chosen={}
            for _,control in ipairs(styleControls) do chosen[control.name]=props[control.name] end
            chosen.intensity=props.intensity
            local adjust=M.validOptions(chosen)
            local saved={base=props.base==true,scene=props.scene==true,preset=tostring(props.preset or ''),
                horizon=props.horizon==true,mask=tostring(props.mask or ''),variant=props.variant=='candidate' and 'candidate' or 'pilot'}
            for key,value in pairs(adjust) do saved[key]=value end
            Prefs.prefsForPlugin().editOptions=saved
            result={useBase=props.base==true,variant=props.variant,inPlace=props.destination=='selection',project=tostring(props.project or ''):sub(1,200),
                adjust=adjust,presetUuid=saved.preset~='' and saved.preset or nil,sceneConsistency=props.scene==true,
                horizon=saved.horizon,maskPresetUuid=saved.mask~='' and saved.mask or nil}
        end
    end)
    return result
end
local function neutral(adjust)
    if not adjust or adjust.intensity~=100 then return false end
    for _,control in ipairs(styleControls) do if adjust[control.name]~=0 then return false end end
    return true
end
local function styleBase()
    local info=read(child(_PLUGIN.path,'BuildInfo.json'))
    local path=child(_PLUGIN.path,'StyleBase.lua');local f=io.open(path,'rb')
    if not f then error('Base de estilo ausente no pacote') end
    local text=f:read(128*1024+1);f:close()
    if #text>128*1024 or not info or Digest.SHA256.digest(text)~=info.styleBaseLuaSha256 then error('A base de estilo difere da incluida no pacote') end
    return dofile(path)
end
function M.capture(catalog,progress)
    if not catalog:getTargetPhoto() then error('Selecione explicitamente os RAWs originais em cor.') end
    local selected=catalog:getTargetPhotos();if #selected<1 then error('Selecione pelo menos uma foto.') end
    return M.capturePhotos(selected,progress)
end
function M.capturePhotos(selected,progress)
    local records,photos={},{};local seen={};local skipped={monochrome=0,unsupported=0}
    for index,photo in ipairs(selected) do
        if progress then
            if progress:isCanceled() then error('Preparacao cancelada; nenhuma edicao foi aplicada.') end
            progress:setCaption('Verificando foto '..index..' de '..#selected)
            progress:setPortionComplete(index,#selected)
        end
        if index%10==0 then Tasks.yield() end
        local path=photo:getRawMetadata('path');local id=tostring(photo.localIdentifier)
        if seen[id] then error('A mesma foto aparece duas vezes na selecao.') end
        seen[id]=true
        -- Unsupported files are counted and left untouched instead of aborting the batch.
        if type(path)~='string' or not path:lower():match('%.cr3$') then skipped.unsupported=skipped.unsupported+1
        else
            local settings=photo:getDevelopSettings()
            -- P&B photos are computed by the separate P&B model; without one, the engine fails only them.
            local treatment=settings.ConvertToGrayscale==true and 'monochrome' or 'color'
            if treatment=='monochrome' then skipped.monochrome=skipped.monochrome+1 end
            local current={};for key in pairs(limits) do if not finite(settings[key]) then error('Controle atual indisponivel: '..key) end;current[key]=settings[key] end
            records[#records+1]={id=id,path=path,beforeHash=M.fingerprint(settings),current=current,treatment=treatment}
            photos[#photos+1]={id=id,path=path,current=current,treatment=treatment,isVirtualCopy=photo:getRawMetadata('isVirtualCopy')}
        end
    end
    return records,photos,skipped
end

function M.applyInPlace(catalog,dir,manifest,progress)
    local result=application(manifest)
    for index,record in ipairs(manifest.photos) do
        if progress:isCanceled() then return 'CANCELLED',{},nil end
        sameCatalog(catalog,manifest.catalogPath)
        local photo=sourceFor(catalog,record)
        local before=photo:getDevelopSettings()
        if M.fingerprint(before)~=record.beforeHash then error('A foto mudou apos a analise; nenhuma sobrescrita permitida.') end
        checkpoint(dir,index,'ready',{before=before,beforeHash=record.beforeHash})
        local attempted=false;local actual
        local ok,err=Tasks.pcall(function()
            gate(catalog,'Mizin: editar selecao sem duplicar',function()
                if M.fingerprint(photo:getDevelopSettings())~=record.beforeHash then error('Foto alterada durante espera pela gravacao') end
                attempted=true
                photo:applyDevelopSettings(record.settings,'Mizin - edicao na grade',false)
            end)
            actual=readApplied(photo,record)
            if M.fingerprint(preserved(actual,record.settings))~=M.fingerprint(preserved(before,record.settings)) then
                error('Controles preservados mudaram; confira e restaure esta foto.')
            end
        end)
        if not ok then
            if not attempted then error(tostring(err)) end
            if attempted then
                local readable,hash=Tasks.pcall(function()return M.fingerprint(photo:getDevelopSettings()) end)
                checkpoint(dir,index,'failed',{observedHash=readable and hash or nil,error=tostring(err)})
            end
            failedPhoto(result,record,err)
        else
            checkpoint(dir,index,'applied',{afterHash=M.fingerprint(actual)})
            appliedPhoto(result,record)
        end
        progress:setCaption('Aplicando '..index..' de '..#manifest.photos)
        progress:setPortionComplete(index,#manifest.photos)
        Tasks.yield()
    end
    return result.failed>0 and 'COMPLETED_WITH_ERRORS' or 'COMPLETED',{},nil
end

function M.applyPlan(catalog,dir,manifest,progress)
    local result=application(manifest)
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
        local master=source:getRawMetadata('isVirtualCopy') and source:getRawMetadata('masterPhoto') or source
        local existing={};for _,old in ipairs(master:getRawMetadata('virtualCopies') or {}) do existing[tostring(old.localIdentifier)]=true end
        checkpoint(dir,index,'creating',{sourceId=record.id,name=record.copyName})
        requireSelected(catalog,source,'library');sameCatalog(catalog,manifest.catalogPath)
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
        local maskPreset=nil
        if record.maskPresetUuid then
            maskPreset=App.developPresetByUuid(record.maskPresetUuid)
            if not maskPreset then error('O preset adaptativo desta sessao nao esta mais disponivel; nenhuma copia restante foi alterada.') end
        end
        selectOnly(catalog,copy,'develop');sameCatalog(catalog,manifest.catalogPath)
        if M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('A origem mudou antes da aplicacao') end
        local before=copy:getDevelopSettings();local beforeHash=M.fingerprint(before)
        local name='Mizin - Antes '..manifest.sessionId..' '..record.id
        gate(catalog,'Mizin: salvar estado anterior da copia',function()
            requireSelected(catalog,copy,'develop')
            if M.fingerprint(copy:getDevelopSettings())~=beforeHash or M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('Os ajustes mudaram durante a espera pelo snapshot') end
            if copy:createDevelopSnapshot(name,false)~=true then error('Snapshot nao foi criado') end
        end)
        Tasks.yield();local snapshot=snapshotId(source,name)
        checkpoint(dir,index,'ready',{copyId=tostring(copy.localIdentifier),snapshotId=snapshot,beforeHash=beforeHash,
            untouchedHash=M.fingerprint(without(before,affected(record.settings))),snapshotName=name})
        -- Durable checkpoint exists before this copy receives any develop changes.
        local attempted=false
        local ok,err=Tasks.pcall(function()
            sameCatalog(catalog,manifest.catalogPath)
            if M.fingerprint(copy:getDevelopSettings())~=beforeHash then error('A copia mudou antes da aplicacao') end
            gate(catalog,'Mizin: aplicar edicao na copia',function()
                requireSelected(catalog,copy,'develop')
                if M.fingerprint(copy:getDevelopSettings())~=beforeHash or M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('Os ajustes mudaram durante a espera pela gravacao') end
                attempted=true
                copy:applyDevelopSettings(record.settings,'Mizin - edicao local',false)
                -- Lightroom's own adaptive preset builds the person/sky masks on this copy.
                if maskPreset then copy:applyDevelopPreset(maskPreset,_PLUGIN.id) end
            end)
            Tasks.yield();local actual=readApplied(copy,record)
            if M.fingerprint(preserved(actual,record.settings,maskPreset~=nil))~=M.fingerprint(preserved(before,record.settings,maskPreset~=nil)) then error('Houve mudanca em perfil, corte, mascaras ou outros controles preservados; revise a copia e use Restaurar.') end
            -- Recorded, not fatal: whether the SDK path triggers mask creation needs native QA.
            local masksChanged=maskPreset and M.canonical(actual.MaskGroupBasedCorrections)~=M.canonical(before.MaskGroupBasedCorrections) or nil
            if M.fingerprint(source:getDevelopSettings())~=record.beforeHash then error('Os ajustes da origem mudaram externamente; edicao interrompida.') end
            return {copyId=tostring(copy.localIdentifier),afterHash=M.fingerprint(actual),masksChanged=masksChanged}
        end)
        if not ok then
            local readOK,observed=Tasks.pcall(function()return M.fingerprint(copy:getDevelopSettings()) end)
            checkpoint(dir,index,'failed',{copyId=tostring(copy.localIdentifier),error=tostring(err),observedHash=readOK and observed or nil})
            if not attempted then error(tostring(err)) end
            failedPhoto(result,record,err)
        else
            -- Journal failures are session-fatal: never continue without durable recovery.
            checkpoint(dir,index,'applied',err)
            appliedPhoto(result,record)
        end
        progress:setPortionComplete(#manifest.photos+index,#manifest.photos*2)
    end
    return result.failed>0 and 'COMPLETED_WITH_ERRORS' or 'COMPLETED',copies,collection
end

local function guarded(fn)
    if _G.MizinAcervoBusy then error('Aprendizado do acervo em andamento. Pause pelo menu de aprendizado antes de editar/restaurar.') end
    if _G.MizinEngineBusy then error('Motor local em andamento (analise/coleta). Aguarde o progresso concluir antes de editar/restaurar.') end
    if _G.MizinEditorBusy then error('Edicao ou restauracao em andamento. Aguarde sua conclusao.') end
    _G.MizinEditorBusy=true;_G.MizinLearningStop=false
    local ok,result=Tasks.pcall(fn);_G.MizinEditorBusy=false;_G.MizinEditorAnalysisJob=nil
    if not ok then error(tostring(result)) end;return result
end
-- Shared core: analysis -> validated plan -> durable session -> application.
-- auto=true never opens dialogs, never changes selection/module and only edits in place.
local function process(catalog,path,records,photos,ignored,choice,inPlace,auto)
    local base=choice.useBase and styleBase() or nil
    local preset,presetName=nil,nil
    if choice.presetUuid then
        local found=App.developPresetByUuid(choice.presetUuid)
        if not found then error('O preset complementar escolhido nao foi encontrado. Escolha outro ou "Nenhum".') end
        preset=M.presetSettings(found);presetName=tostring(found:getName())
    end
    -- Horizon crop writes through the same before/after settings restore as every other
    -- direct-edit control, so it works in place too. Adaptive masks still need a new copy:
    -- Lightroom builds them through applyDevelopPreset, which this plugin only ever calls
    -- on a fresh virtual copy so the exact-snapshot restore stays available.
    local useHorizon=choice.horizon==true
    local maskName=nil
    if choice.maskPresetUuid and not inPlace then
        local found=App.developPresetByUuid(choice.maskPresetUuid)
        if not found then error('O preset adaptativo escolhido nao foi encontrado. Escolha outro ou "Nenhum".') end
        local ok,values=Tasks.pcall(function() return found:getSetting() end)
        local masks=ok and type(values)=='table' and values.MaskGroupBasedCorrections
        if type(masks)~='table' or #masks==0 then error('O preset "'..tostring(found:getName())..'" nao contem mascaras. Escolha um preset adaptativo (pessoa, ceu...).') end
        maskName=tostring(found:getName())
    end
    local request={schema='mizin-lightroom.selection-request/1',operation='analyze',jobId=UUID.generateUUID(),lightroomVersion=tostring(App.versionString()),photos=photos}
    if choice.sceneConsistency then request.sceneConsistency={enabled=true,maxGapSeconds=30} end
    if useHorizon then request.geometry={horizon=true} end
    _G.MizinEditorAnalysisJob=request.jobId
    local report,analysisJob=Engine.run('analyze',request,true,choice.variant=='candidate' and 'candidate' or nil)
    _G.MizinEditorAnalysisJob=nil
    if not report or report.schema~='mizin-lightroom.selection-analysis/1' or report.operation~='analyze' or
        (report.status~='COMPLETED' and report.status~='COMPLETED_WITH_ERRORS') or
        type(report.results)~='table' or #report.results~=#records then error('Analise incompleta; nenhuma edicao foi aplicada. Consulte os ultimos resultados.') end
    sameCatalog(catalog,path)
    local predictions={};local paths={};local failures={};local geometry={}
    for _,row in ipairs(report.results) do
        if row.status=='COMPUTED' then
            if not row.id or predictions[row.id] then error('Analise de edicao incompativel') end
            predictions[row.id]=row.predictions;paths[row.id]=row.path;geometry[row.id]=row.geometry
        elseif row.status=='FAILED' then failures[#failures+1]=tostring(row.filename)..': '..tostring(row.error)
        else error('Analise de edicao incompativel') end
    end
    if #failures>0 then
        local computed={};for _,record in ipairs(records) do if predictions[record.id] then computed[#computed+1]=record end end
        local shown={};for i=1,math.min(5,#failures) do shown[i]=failures[i] end
        if #computed==0 then error('Nenhuma foto pode ser calculada; nada foi alterado.\n'..table.concat(shown,'\n')) end
        if not auto and Dialogs.confirm('Mizin - fotos nao calculadas',tostring(#failures)..' fotos nao puderam ser calculadas e ficarao sem alteracao:\n'..table.concat(shown,'\n')..
            '\n\nContinuar com as '..#computed..' fotos calculadas?','Continuar','Cancelar')~='ok' then return nil end
        records=computed
    end
    local geometryAnalyzed=0
    for _,record in ipairs(records) do
        if normal(paths[record.id])~=normal(record.path) then error('A previsao nao corresponde ao arquivo selecionado') end
        local source=sourceFor(catalog,record);local before=source:getDevelopSettings()
        if M.fingerprint(before)~=record.beforeHash then error('Uma origem foi alterada depois da confirmacao; calcule novamente.') end
        local adjusted=neutral(choice.adjust) and predictions[record.id] or M.adjust(predictions[record.id],before,choice.adjust)
        record.settings,record.omittedBaseKeys=M.settings(adjusted,base,before)
        if useHorizon then
            if type(geometry[record.id])=='table' then geometryAnalyzed=geometryAnalyzed+1 end
            local applied,reason=M.horizon(record.settings,before,geometry[record.id])
            record.horizon=applied and {cropAngle=applied,evidence=geometry[record.id].evidence} or {skipped=reason}
        end
        if preset then record.presetKeys=M.mergePreset(record.settings,preset,inPlace and before or nil) end
        if maskName then record.maskPresetUuid=choice.maskPresetUuid end
    end
    -- Tally skip reasons so the user sees WHY each photo was not straightened, not just a count.
    local straightened,skipReasons=0,{}
    for _,record in ipairs(records) do
        if record.horizon and record.horizon.cropAngle then straightened=straightened+1
        elseif record.horizon and record.horizon.skipped then
            local reason=record.horizon.skipped;skipReasons[reason]=(skipReasons[reason] or 0)+1
        end
    end
    local session=UUID.generateUUID();local dir=child(editingRoot(),session)
    if Files.exists(dir) then error('Identificador de edicao repetido') end
    Files.createAllDirectories(dir)
    for _,record in ipairs(records) do record.copyName='Mizin '..session..' - '..record.id end
    local manifest={schema='mizin-lightroom.edit-session/1',sessionId=session,catalogPath=path,analysisJob=analysisJob,
        modelSha256=report.modelSha256,usingCandidate=report.usingCandidateModel==true,useFixedBase=choice.useBase,
        projectName=choice.project,started=Date.currentTime(),photos=records,mode=inPlace and 'IN_PLACE' or 'NEW_VIRTUAL_COPIES_ONLY',
        styleAdjust=choice.adjust,presetUuid=choice.presetUuid,presetName=presetName,sceneConsistency=choice.sceneConsistency==true,
        sceneConsistencyReport=report.sceneConsistency,monochromeIncluded=ignored.monochrome,ignoredUnsupported=ignored.unsupported,notComputed=#failures,
        monochromeModelSha256=report.monochromeModelSha256,horizonRequested=useHorizon,straightenedPhotos=straightened,geometryAnalyzed=geometryAnalyzed,
        maskPresetUuid=maskName and choice.maskPresetUuid or nil,maskPresetName=maskName,automatic=auto==true}
    writeNew(child(dir,'session.json'),manifest);Prefs.prefsForPlugin().lastEditSession=dir
    local result=nil
    Context.callWithContext('MizinApplyEdits',function(context)
        local progress=Progress{title=auto and 'CRISPIX - edicao automatica' or 'Mizin Lightroom - editar copias',functionContext=context}
        progress:setCancelable(true)
        local ok,status,copies,collection=Tasks.pcall(function()
            if inPlace then return M.applyInPlace(catalog,dir,manifest,progress) end
            return M.applyPlan(catalog,dir,manifest,progress)
        end)
        progress:done()
        if not ok then writeNew(child(dir,'outcome.json'),{status='FAILED',error=tostring(status),application=manifest.application});error(tostring(status)..'\nUse Restaurar ultima sessao se necessario. Registros: '..dir) end
        writeNew(child(dir,'outcome.json'),{status=status,createdCopies=#copies,application=manifest.application});result=status
        if not auto and collection and #copies>0 then catalog:setActiveSources({collection});catalog:setSelectedPhotos(copies[1],copies) end
    end)
    local applied=manifest.application
    return {dir=dir,status=result,records=records,failures=failures,application=applied,
        straightened=applied.straightened,skipReasons=skipReasons,useHorizon=useHorizon,maskName=maskName,geometryAnalyzed=geometryAnalyzed,
        modelLabel=report.usingCandidateModel and 'candidato do acervo' or 'piloto',temperatureOffset=choice.adjust and choice.adjust.temperature or 0}
end

function M.edit(inPlace)
    return guarded(function()
        local catalog=App.activeCatalog();local path=catalog:getPath()
        if inPlace then
            if Dialogs.confirm('Mizin - editar sem duplicar','Os ajustes dos itens selecionados serao alterados diretamente, sem novas copias. O modelo ainda e experimental e pode clarear ou esfriar fotos. Sera salvo um registro local para restauracao. Teste primeiro cinco fotos.','Editar selecao','Cancelar')~='ok' then return end
        end
        local records,photos,ignored
        Context.callWithContext('MizinPrepareEdits',function(context)
            local progress=Progress{title='Mizin Lightroom - preparar selecao',functionContext=context}
            progress:setCancelable(true)
            local ok,a,b,c=Tasks.pcall(function()return M.capture(catalog,progress) end)
            progress:done()
            if not ok then error(tostring(a)) end
            records,photos,ignored=a,b,c
        end)
        if #records==0 then error('Nenhum RAW CR3 na selecao. Outros formatos ('..ignored.unsupported..') foram preservados.') end
        if ignored.unsupported>0 then
            local answer=Dialogs.confirm('Mizin - selecao mista',tostring(ignored.unsupported)..
                ' arquivos fora do formato CR3 nao serao editados. Continuar somente com '..#records..' RAWs CR3?','Continuar com os CR3','Cancelar')
            if answer~='ok' then return end
        end
        local choice=options(#records,inPlace);if not choice then return end
        if choice.inPlace and not inPlace then
            if Dialogs.confirm('CRISPIX - confirmar edicao direta','Os itens selecionados serao alterados, sem criar copias. O modelo aplica valores absolutos e pode substituir a edicao atual.','Editar selecao','Cancelar')~='ok' then return end
        end
        inPlace=choice.inPlace
        local done=process(catalog,path,records,photos,ignored,choice,inPlace,false)
        if not done then return end
        local message
        if done.status=='COMPLETED' then
            message=inPlace and 'Edicao concluida nos itens selecionados, sem novas copias. Restauracao disponivel no menu.' or
                'Edicao aplicada nas novas copias virtuais. Compare-as com as origens na colecao Mizin - Edicoes.'
        elseif done.status=='COMPLETED_WITH_ERRORS' then
            message='Lote finalizado com falhas em algumas fotos. As demais foram processadas.'
        else
            message=inPlace and 'Edicao cancelada. Os itens ja editados podem voltar ao estado anterior com Restaurar ultima sessao.' or
                'Edicao cancelada. As copias ja criadas ficaram na colecao para revisao.'
        end
        message=message..'\nEdicoes confirmadas: '..done.application.completed..'. Falhas: '..done.application.failed..'.'
        message=message..'\nModelo usado: '..done.modelLabel..'.'
        if done.temperatureOffset~=0 then message=message..'\nAjuste fino de temperatura no lote: '..done.temperatureOffset..' K.' end
        if done.application.failed>0 then
            message=message..'\nAs fotos com falha podem ter ajustes parciais. Confira-as ou use RESTAURAR ULTIMA SESSAO.\nRegistros: '..done.dir
            for i,issue in ipairs(done.application.issues) do
                if i<=5 then message=message..'\n'..tostring(issue.path)..': '..issue.error end
            end
        end
        if done.useHorizon then
            message=message..'\nFotos analisadas para nivelamento: '..done.geometryAnalyzed..' de '..#done.records..'.'..
                '\nNivelamento confirmado: '..done.straightened..'. Mantidas ou nao confirmadas: '..(#done.records-done.straightened)..'.'
            local reasons={};for reason,count in pairs(done.skipReasons or {}) do reasons[#reasons+1]=count..'x '..reason end
            table.sort(reasons)
            if #reasons>0 then message=message..'\nNao endireitadas: '..table.concat(reasons,'; ')..'.' end
        end
        if done.maskName then message=message..'\nPreset adaptativo aplicado: '..done.maskName..'. Confira as mascaras no painel Mascaramento.' end
        Dialogs.message('Mizin Lightroom - edicao local',message,'info')
        return done.dir
    end)
end

-- Options remembered from the last EDITAR FOTOS dialog, forced to direct editing.
-- Adaptive masks need a new copy, so automatic runs never use them; the horizon crop goes
-- through the same exact before/after restore as every direct edit (build 0032), so the
-- saved "Endireitar horizonte" choice is honored here too instead of silently dropped.
function M.autoChoice()
    local saved=remembered()
    return {useBase=saved.base==true,variant=saved.variant=='candidate' and 'candidate' or 'pilot',inPlace=true,
        project='Edicao automatica',adjust=M.validOptions(saved),presetUuid=type(saved.preset)=='string' and saved.preset~='' and saved.preset or nil,
        sceneConsistency=saved.scene==true,horizon=saved.horizon==true,maskPresetUuid=nil}
end

-- Background edit of explicit photos (new imports of a watched folder).
function M.autoEdit(list,label,expected)
    return guarded(function()
        local catalog=App.activeCatalog();local path=catalog:getPath()
        local captured,capturedPhotos,ignored=M.capturePhotos(list)
        -- A photo touched between the watcher's scan and this capture is left alone.
        local records,photos={},{}
        for index,record in ipairs(captured) do
            if not expected or expected[record.id]==record.beforeHash then
                records[#records+1]=record;photos[#photos+1]=capturedPhotos[index]
            end
        end
        if #records==0 then return {status='NOTHING_TO_EDIT',records={},failures={},ignoredUnsupported=ignored.unsupported} end
        local choice=M.autoChoice();choice.project=tostring(label or choice.project):sub(1,200)
        local done=process(catalog,path,records,photos,ignored,choice,true,true)
        local edited={}
        local completed={}
        for _,record in ipairs(done.records) do
            if done.application.completedIds[record.id] then
                edited[#edited+1]=sourceFor(catalog,record);completed[#completed+1]=record
            else done.failures[#done.failures+1]=record.path..': aplicacao nao confirmada' end
        end
        if #edited>0 then
            -- Review collection only: never changes the user's selection or active sources.
            gate(catalog,'CRISPIX: reunir edicao automatica',function()
                local parent=catalog:createCollectionSet('CRISPIX - Edicao automatica',nil,true)
                local collection=catalog:createCollection(tostring(label or 'Edicao automatica'),parent,true)
                if collection then collection:addPhotos(edited) end
            end)
        end
        return {status=done.status,dir=done.dir,records=completed,failures=done.failures,ignoredUnsupported=ignored.unsupported}
    end)
end

function M.restoreInPlace(catalog,dir,manifest)
    sameCatalog(catalog,manifest.catalogPath)
    local restored,skipped,issues=0,0,{}
    for index,record in ipairs(manifest.photos) do
        local ready=recorded(dir,index,'ready')
        if ready and not recorded(dir,index,'restored') then
            local ok,err=Tasks.pcall(function()
                sameCatalog(catalog,manifest.catalogPath)
                local photo=sourceFor(catalog,record)
                local hash=M.fingerprint(photo:getDevelopSettings())
                local applied=recorded(dir,index,'applied')
                if hash~=ready.beforeHash then
                    local failed=recorded(dir,index,'failed')
                    local expected=(applied and applied.afterHash) or (failed and failed.observedHash)
                    if not expected or hash~=expected then error('Foto com alteracoes posteriores ou estado nao confirmado: preservada para recuperacao manual pelo registro before.') end
                    gate(catalog,'Mizin: restaurar edicao na grade',function()
                        if M.fingerprint(photo:getDevelopSettings())~=hash then error('Foto alterada durante restauracao') end
                        photo:applyDevelopSettings(ready.before,'Mizin - restaurar edicao na grade',false)
                    end)
                    if M.fingerprint(photo:getDevelopSettings())~=ready.beforeHash then error('Restauracao completa nao confirmada') end
                end
                checkpoint(dir,index,'restored',{restored=true});restored=restored+1
            end)
            if not ok then skipped=skipped+1;issues[#issues+1]={sourceId=record.id,error=tostring(err)} end
        end
        Tasks.yield()
    end
    if #issues>0 then writeNew(child(dir,'restore-issues-'..UUID.generateUUID()..'.json'),{issues=issues}) end
    return restored,skipped,issues
end

function M.restoreSession(dir)
    local norm=normal(dir);local prefix=normal(editingRoot())..'/'
    if norm:sub(1,#prefix)~=prefix or not norm:sub(#prefix+1):match('^[%w%-]+$') then error('Pasta de edicao invalida') end
    local manifest=read(child(dir,'session.json'));local catalog=App.activeCatalog()
    if manifest and manifest.schema=='mizin-lightroom.edit-session/1' and manifest.mode=='IN_PLACE' and type(manifest.photos)=='table' and #manifest.photos>0 then return M.restoreInPlace(catalog,dir,manifest) end
    if not manifest or manifest.schema~='mizin-lightroom.edit-session/1' or manifest.mode~='NEW_VIRTUAL_COPIES_ONLY' or
        type(manifest.photos)~='table' or #manifest.photos<1 then error('Registro de edicao incompativel') end
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
                    local planned=exactlyPlanned(actual,record.settings,skipSet(record.presetKeys))
                    if currentHash~=expected and not (expected==nil and planned and M.fingerprint(without(actual,affected(record.settings)))==ready.untouchedHash) then
                        error('A copia recebeu outras alteracoes; restauracao automatica preservou essas mudancas.')
                    end
                    if snapshotId(source,ready.snapshotName)~=ready.snapshotId then error('Snapshot anterior nao confere') end
                    selectOnly(catalog,copy,'develop');sameCatalog(catalog,manifest.catalogPath)
                    if M.fingerprint(copy:getDevelopSettings())~=currentHash then error('A copia mudou durante a restauracao') end
                    gate(catalog,'Mizin: restaurar copia da ultima edicao',function()
                        requireSelected(catalog,copy,'develop')
                        if M.fingerprint(copy:getDevelopSettings())~=currentHash or M.fingerprint(source:getDevelopSettings())~=sourceHash then error('Os ajustes mudaram durante a espera pela restauracao') end
                        copy:applyDevelopSnapshot(ready.snapshotId)
                    end)
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
        local manifest=read(child(dir,'session.json'))
        if not manifest or type(manifest.photos)~='table' then error('Registro da ultima sessao indisponivel: '..dir) end
        if Dialogs.confirm('Mizin - confirmar restauracao','Sessao: '..tostring(manifest.sessionId)..'\nItens registrados: '..#manifest.photos..'\nModo: '..tostring(manifest.mode)..'\nA selecao atual NAO define esta restauracao. Itens alterados depois serao preservados.\nRegistros: '..dir,'Restaurar esta sessao','Cancelar')~='ok' then return end
        local restored,skipped,issues
        Context.callWithContext('MizinRestoreSession',function(context)
            local progress=Progress{title='Mizin - restaurar sessao',functionContext=context}
            progress:setCaption('Verificando registros da sessao...')
            local ok,a,b,c=Tasks.pcall(function()return M.restoreSession(dir) end)
            progress:done()
            if not ok then error(tostring(a)..'\nRegistros: '..dir) end
            restored,skipped,issues=a,b,c
        end)
        local details={}
        for i,issue in ipairs(issues) do if i<=5 then details[#details+1]=issue.sourceId..': '..issue.error end end
        Dialogs.message('Mizin Lightroom - restauracao','Itens restaurados/ja no estado anterior: '..tostring(restored)..
            '\nItens NAO restaurados, preservados para revisao: '..tostring(skipped)..'\nRegistros da sessao: '..dir..'\n'..table.concat(details,'\n'),'info')
    end)
end
return M
