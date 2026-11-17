local LrApplication=import 'LrApplication'
local LrBinding=import 'LrBinding'
local LrDialogs=import 'LrDialogs'
local LrFunctionContext=import 'LrFunctionContext'
local LrPrefs=import 'LrPrefs'
local LrShell=import 'LrShell'
local LrTasks=import 'LrTasks'
local LrView=import 'LrView'
local M={}
local focus={POSSIBLE_DEFOCUS_OR_MOTION=true}
local exposure={RAW_SIGNAL_NEAR_BLACK_FLOOR=true,DARK_IMAGE_RECOVERY_REVIEW=true,RAW_HIGHLIGHTS_WIDELY_CLIPPED=true,
    DARK_RASTER_ORIGINAL_RAW_NEEDED=true,BRIGHT_RASTER_ORIGINAL_RAW_NEEDED=true}
local names={POSSIBLE_DEFOCUS_OR_MOTION='Possivel falta de foco ou movimento',
    LOW_TEXTURE_OR_SMALL_SUBJECT='Pouca textura para avaliar foco',SOME_FACES_TOO_SMALL_TO_EVALUATE='Ha rostos pequenos para avaliar nitidez',
    RAW_SIGNAL_NEAR_BLACK_FLOOR='RAW com sinal proximo ao preto: revisar recuperacao',
    DARK_IMAGE_RECOVERY_REVIEW='Imagem muito escura: revisar recuperacao',RAW_HIGHLIGHTS_WIDELY_CLIPPED='RAW com altas luzes extensamente saturadas',
    DARK_RASTER_ORIGINAL_RAW_NEEDED='JPEG/TIFF muito escuro: conferir RAW original',BRIGHT_RASTER_ORIGINAL_RAW_NEEDED='JPEG/TIFF muito claro: conferir RAW original'}

function M.options(count)
    local result=nil
    LrFunctionContext.callWithContext('MizinCullingOptions',function(context)
        local props=LrBinding.makePropertyTable(context);props.maximum=4
        -- Origem das previas (como "Load thumbnails and previews from" do Neurapix), lembrada entre usos.
        local prefs=LrPrefs.prefsForPlugin()
        -- Padrao: previa JPEG embutida no RAW (como o Adobe Bridge e o Neurapix): leve para a
        -- maquina e 98,3% das escolhidas iguais a revelacao completa em 120 RAWs reais
        -- (evidence/culling-preview-benchmark-0045.json). So afeta a selecao; a edicao e a
        -- exportacao do Lightroom sempre partem do RAW.
        props.previewSource=(prefs.cullPreviewSource=='raw' or prefs.cullPreviewSource=='embedded') and prefs.cullPreviewSource or 'embedded'
        local f=LrView.osFactory()
        local action=LrDialogs.presentModalDialog{title='Mizin Lightroom - selecao local',
            contents=f:column{bind_to_object=props,spacing=f:control_spacing(),
                f:static_text{title=tostring(count)..' fotos selecionadas. A analise considera repeticao visual,\norientacao, enquadramento, rostos, nitidez e risco de exposicao.',width_in_chars=95,height_in_lines=2},
                f:row{f:static_text{title='Maximo por grupo semelhante:'},f:popup_menu{value=LrView.bind('maximum'),
                    items={{title='4 fotos',value=4},{title='3 fotos',value=3},{title='2 fotos',value=2},{title='1 foto',value=1}}}},
                f:static_text{title='Carregar previas a partir de:'},
                f:radio_button{title='Previa JPEG embutida no RAW (recomendado; mais leve, como o Adobe Bridge)',value=LrView.bind('previewSource'),checked_value='embedded'},
                f:radio_button{title='Revelacao tecnica completa do RAW (mais pesado)',value=LrView.bind('previewSource'),checked_value='raw'},
                f:static_text{title='Prefere variacoes horizontal/vertical e aberta/fechada quando ha qualidade.\nFotos identicas podem resultar em apenas uma escolhida. Casos duvidosos ficam para revisao.\nA recuperacao depende do RAW; a analise sinaliza riscos e preserva todos os originais.',width_in_chars=95,height_in_lines=3},
                f:static_text{title='Ao terminar, revise as escolhidas e organize o resultado em colecoes no Lightroom.',width_in_chars=95,height_in_lines=2}},
            actionVerb='Analisar selecao',cancelVerb='Cancelar'}
        if action=='ok' then
            local source=props.previewSource=='raw' and 'raw' or 'embedded'
            prefs.cullPreviewSource=source
            result={maxPerGroup=props.maximum,previewSource=source}
        end
    end)
    return result
end

function M.createCollections(report)
    local catalog=LrApplication.activeCatalog()
    if report.operation~='cull' or report.algorithm~='MIZIN_LOCAL_CULL_V1' or report.catalogIdentity~=catalog:getPath() then
        error('Abra o mesmo catalogo da analise para organizar as fotos.')
    end
    local job=report.jobId
    if type(job)~='string' or #job>80 or not job:match('^[%w%-]+$') then error('Identidade da selecao invalida') end
    local prefs=LrPrefs.prefsForPlugin();local done=prefs.cullingCollections or {};local key=catalog:getPath()..'|'..job
    if done[key] then LrDialogs.message('Mizin Lightroom','As colecoes desta analise ja foram criadas.','info');return end
    local buckets={{name='01 - Escolhidas',photos={}},{name='02 - Repetidas excedentes',photos={}},
        {name='03 - Revisar foco ou movimento',photos={}},{name='04 - Revisar exposicao',photos={}},
        {name='05 - Revisar textura ou rostos pequenos',photos={}},{name='06 - Falhas de leitura',photos={}}}
    local groups,seen={},{};local count=0
    for _,row in ipairs(report.results or {}) do
        if seen[row.id] then error('Resultado com identificador repetido') end;seen[row.id]=true
        local photo=catalog:findPhotoByPath(row.path)
        if not photo or tostring(photo.localIdentifier)~=row.id then error('Uma foto mudou de identidade ou saiu do catalogo. Execute uma nova selecao.') end
        count=count+1;if count>2000 then error('Resultado excede o limite da selecao') end
        if row.status=='FAILED' then buckets[6].photos[#buckets[6].photos+1]=photo
        elseif row.status=='CULL_ANALYZED' then
            if row.suggestedKeep==true then
                if type(row.groupId)~='string' then error('Grupo ausente no resultado') end
                groups[row.groupId]=(groups[row.groupId] or 0)+1
                if groups[row.groupId]>4 or groups[row.groupId]>(report.maximumPerSimilarGroup or 4) then error('Resultado excede o limite por grupo') end
                buckets[1].photos[#buckets[1].photos+1]=photo
            else buckets[2].photos[#buckets[2].photos+1]=photo end
            local added={}
            for _,reason in ipairs(row.reviewReasons or {}) do
                local index=focus[reason] and 3 or exposure[reason] and 4 or 5
                if not added[index] then buckets[index].photos[#buckets[index].photos+1]=photo;added[index]=true end
            end
        else error('Estado de foto incompativel') end
        if count%25==0 then LrTasks.yield() end
    end
    if count==0 then error('Nao ha fotos processadas para organizar') end
    local selected=nil;local created=false
    catalog:withWriteAccessDo('Mizin: organizar selecao em colecoes',function()
        local parent=catalog:createCollectionSet('Mizin - Selecao local',nil,true)
        local set=catalog:createCollectionSet('Selecao '..job,parent,true)
        if not set then error('Ja existe um conjunto desta analise; consulte as colecoes.') end
        for i,bucket in ipairs(buckets) do
            if #bucket.photos>0 then
                local collection=catalog:createCollection(bucket.name,set,true)
                if not collection then error('Nao foi possivel criar a colecao') end
                bucket.collection=collection
                if i==1 then selected=collection end
            end
        end
        created=true
    end,{timeout=20})
    if not created then error('O Lightroom nao liberou a gravacao das colecoes. Tente novamente.') end
    -- Newly created collections must be committed before adding photos (SDK lifecycle).
    LrTasks.yield()
    local populated=false
    catalog:withWriteAccessDo('Mizin: preencher colecoes da selecao',function()
        for _,bucket in ipairs(buckets) do if bucket.collection then bucket.collection:addPhotos(bucket.photos) end end
        populated=true
    end,{timeout=20})
    if not populated then error('As colecoes foram criadas, mas ainda nao preenchidas. Abra os resultados e tente novamente.') end
    done[key]=true;prefs.cullingCollections=done;LrTasks.yield()
    if selected then catalog:setActiveSources({selected}) end
    return true
end

function M.show(report,job)
    local f=LrView.osFactory();local lines={}
    for i,row in ipairs(report.results or {}) do
        if i>100 then break end
        local reasons={};for _,reason in ipairs(row.reviewReasons or {}) do reasons[#reasons+1]=names[reason] or reason end
        lines[#lines+1]=(row.groupId or 'Leitura')..' | '..tostring(row.filename)..' | '..
            (row.status=='FAILED' and tostring(row.error) or row.suggestedKeep and 'Escolhida' or 'Repetida excedente')..
            (#reasons>0 and '\n'..table.concat(reasons,'; ') or '')
    end
    local content=f:column{spacing=f:control_spacing(),
        f:static_text{title='Analisadas: '..tostring(report.analyzedPhotos or 0)..'/'..tostring(report.requestedPhotos or 0)..
            ' | escolhidas: '..tostring(report.suggestedKeepPhotos or 0)..' | excedentes: '..tostring(report.excessSimilarPhotos or 0)..
            '\nRevisar qualidade: '..tostring(report.qualityReviewPhotos or 0)..' | falhas: '..tostring(report.failedPhotos or 0)..' | '..tostring(report.status),width_in_chars=110,height_in_lines=2},
        f:static_text{title='Ate '..tostring(report.maximumPerSimilarGroup or 4)..' escolhidas por grupo visual reconhecido.\nA escolha preserva variedade quando ha fotos claras/nitidas disponiveis. Grupos e riscos sao sugestoes para revisao.\nAs colecoes de qualidade podem conter fotos escolhidas; todas continuam no catalogo.',width_in_chars=110,height_in_lines=3},
        f:scrolled_view{width=850,height=360,horizontal_scroller=false,f:static_text{title=table.concat(lines,'\n\n'),width_in_chars=110,height_in_lines=math.max(3,#lines*3)}},
        f:static_text{title='A lista acima mostra ate 100 fotos; as colecoes incluem todas as fotos processadas.\nSe cancelar, somente a parte concluida sera organizada.',width_in_chars=110,height_in_lines=2},
        f:push_button{title='Abrir pasta dos resultados',action=function() LrShell.revealInShell(job) end}}
    local action=LrDialogs.presentModalDialog{title='Mizin Lightroom - resultado da selecao',contents=content,
        actionVerb='Criar colecoes no Lightroom',cancelVerb='Fechar'}
    if action=='ok' then M.createCollections(report) end
end
return M
