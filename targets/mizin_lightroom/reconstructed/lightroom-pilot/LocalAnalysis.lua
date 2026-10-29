local LrApplication = import 'LrApplication'
local LrDate = import 'LrDate'
local LrDialogs = import 'LrDialogs'
local LrFileUtils = import 'LrFileUtils'
local LrFunctionContext = import 'LrFunctionContext'
local LrPathUtils = import 'LrPathUtils'
local LrPrefs = import 'LrPrefs'
local LrProgressScope = import 'LrProgressScope'
local LrShell = import 'LrShell'
local LrTasks = import 'LrTasks'
local LrUUID = import 'LrUUID'
local LrView = import 'LrView'
local Json = dofile(LrPathUtils.child(_PLUGIN.path, 'Json.lua'))
local M = {}

local targets = { 'Exposure2012', 'Temperature', 'Tint', 'Contrast2012', 'Highlights2012',
    'Shadows2012', 'Whites2012', 'Blacks2012', 'Saturation', 'Vibrance' }
local display = {
    { key = 'Exposure2012', title = 'Exposicao', precision = 2 },
    { key = 'Temperature', title = 'Temperatura (K)', precision = 0 },
    { key = 'Contrast2012', title = 'Contraste', precision = 1 },
}

local function child(parent, leaf) return LrPathUtils.child(parent, leaf) end
local function root() return child(LrPathUtils.getStandardFilePath('appData'), 'MizinLightroomLocal') end
local function finite(value) return type(value) == 'number' and value == value and math.abs(value) ~= math.huge end
local function writeText(path, value)
    local file, message = io.open(path, 'wb')
    if not file then error('Nao foi possivel gravar a tarefa: ' .. tostring(message)) end
    local ok, err = file:write(value)
    file:close()
    if not ok then error(tostring(err)) end
end
local function readJson(path)
    local file = io.open(path, 'rb')
    if not file then return nil end
    local text = file:read(8 * 1024 * 1024 + 1)
    file:close()
    return Json.decode(text)
end
local function quote(path)
    if path:find('[%%!"%z\1-\31]') then error('Caminho do plugin ou da tarefa incompativel com o Windows. Use uma pasta sem %, ! ou aspas.') end
    return '"' .. path .. '"'
end
function M.command(plugin, job)
    return '"' .. quote(child(child(plugin, 'Runtime'), 'pythonw.exe')) .. ' -I ' ..
        quote(child(child(plugin, 'Engine'), 'run_local.py')) .. ' --job ' .. quote(job) .. '"'
end
local function numberText(value, precision)
    if not finite(value) then return 'indisponivel' end
    return string.format('%.' .. precision .. 'f', value)
end

function M.showResults(job)
    local report = readJson(child(job, 'results.json'))
    if not report then error('A tarefa ainda nao tem resultados. Pasta: ' .. job) end
    if report.schema ~= 'mizin-lightroom.selection-analysis/1' then error('Resultado incompativel') end
    if report.status == 'FAILED' then error(tostring(report.error) .. '\n\nPasta de diagnostico: ' .. job) end
    if report.operation == 'diagnostic' then
        local rt = report.runtime or {}
        LrDialogs.message('Mizin Lightroom - diagnostico local',
            'Motor iniciado: ' .. tostring(report.version) .. '\n' ..
            'Lightroom: ' .. tostring(report.lightroomVersion) .. '\n' ..
            'Python: ' .. tostring(rt.python) .. ' | isolado: ' .. tostring(rt.isolatedPython) .. '\n' ..
            'rawpy: ' .. tostring(rt.rawpy) .. ' | LibRaw: ' .. tostring(rt.libraw) .. '\n' ..
            'NumPy: ' .. tostring(rt.numpy) .. ' | Pillow: ' .. tostring(rt.pillow) .. '\n' ..
            'ExifTool: ' .. tostring(rt.exiftool) .. '\n\n' ..
            'Estilo experimental: ' .. tostring(report.styleName) .. '\nPasta: ' .. job, 'info')
        return
    end
    local f = LrView.osFactory()
    local rows = { spacing = f:control_spacing() }
    for _, row in ipairs(report.results or {}) do
        local text = tostring(row.filename) .. '\n'
        if row.status == 'COMPUTED' then
            for _, control in ipairs(display) do
                text = text .. control.title .. ': lido no inicio ' .. numberText((row.current or {})[control.key], control.precision) ..
                    ' | sugestao ' .. numberText((row.predictions or {})[control.key], control.precision) .. '\n'
            end
            if #(row.missingFeatures or {}) > 0 then text = text .. 'Metadados ausentes: revisar esta sugestao.\n' end
        else text = text .. 'Nao calculado: ' .. tostring(row.error or row.status) .. '\n' end
        rows[#rows + 1] = f:static_text { title = text, width_in_chars = 105,
            height_in_lines = row.status == 'COMPUTED' and 6 or 4 }
    end
    if #rows == 0 then rows[1] = f:static_text { title = 'Analise cancelada antes do primeiro resultado.' } end
    local content = f:column {
        spacing = f:control_spacing(),
        f:static_text { title = 'Calculadas: ' .. tostring(report.computedPhotos) .. ' | falhas: ' .. tostring(report.failedPhotos) ..
            ' | estado: ' .. tostring(report.status), width_in_chars = 105 },
        f:static_text { title = 'Estilo: ' .. tostring(report.styleName) .. '\nSugestoes experimentais. Revise os valores; esta versao nao aplica edicoes.',
            width_in_chars = 105, height_in_lines = 2 },
        f:scrolled_view { width = 850, height = 420, horizontal_scroller = false, f:column(rows) },
        f:static_text { title = 'O CSV inclui os 10 controles calculados. As imagens input-*.jpg sao entradas tecnicas, sem o estilo aplicado.',
            width_in_chars = 105, height_in_lines = 2 },
    }
    local action = LrDialogs.presentModalDialog { title = 'Mizin Lightroom - sugestoes calculadas localmente',
        contents = content, actionVerb = 'Abrir pasta dos resultados', cancelVerb = 'Fechar' }
    if action == 'ok' then LrShell.revealInShell(job) end
end

local function makeRequest(operation)
    local request = { schema = 'mizin-lightroom.selection-request/1', operation = operation,
        jobId = LrUUID.generateUUID(), lightroomVersion = 'indisponivel' }
    local versionOK, version = LrTasks.pcall(function() return LrApplication.versionString() end)
    if versionOK then request.lightroomVersion = tostring(version) end
    if operation == 'diagnostic' then return request end
    local catalog = LrApplication.activeCatalog()
    -- getTargetPhotos can return the filmstrip when no photo is selected.
    if not catalog:getTargetPhoto() then error('Selecione explicitamente de 1 a 100 fotos RAW CR3 no Lightroom.') end
    local selection = catalog:getTargetPhotos()
    if #selection == 0 or #selection > 100 then error('Este piloto analisa de 1 a 100 fotos por tarefa. Selecione um lote menor.') end
    request.photos = {}
    for index, photo in ipairs(selection) do
        local ok, settings = LrTasks.pcall(function() return photo:getDevelopSettings() end)
        if not ok or type(settings) ~= 'table' then settings = {} end
        local current = {}
        for _, key in ipairs(targets) do if finite(settings[key]) then current[key] = settings[key] end end
        request.photos[#request.photos + 1] = { id = tostring(index), path = photo:getRawMetadata('path'), current = current,
            treatment = settings.ConvertToGrayscale == true and 'monochrome' or 'color' }
        if index % 10 == 0 then LrTasks.yield() end
    end
    return request
end

function M.run(operation)
    for _, path in ipairs({ 'Runtime/pythonw.exe', 'Runtime/python313.dll', 'Engine/run_local.py',
        'BuildInfo.json', 'Models/pilot-model.json', 'Tools/ExifTool/exiftool.exe' }) do
        if not LrFileUtils.exists(child(_PLUGIN.path, path)) then
            error('Pacote incompleto: ' .. path .. '. Extraia TODO o ZIP em uma pasta nova e adicione essa pasta .lrplugin.')
        end
    end
    local request = makeRequest(operation)
    local jobsRoot = child(root(), 'jobs')
    LrFileUtils.createAllDirectories(jobsRoot)
    local job = child(jobsRoot, request.jobId)
    if LrFileUtils.exists(job) then error('Identificador de tarefa repetido; tente novamente.') end
    local command = M.command(_PLUGIN.path, job)
    LrFileUtils.createAllDirectories(job)
    writeText(child(job, 'request.json'), Json.encode(request))
    local prefs = LrPrefs.prefsForPlugin()
    if operation == 'analyze' then prefs.lastSelectionRun = job else prefs.lastDiagnosticRun = job end
    LrFunctionContext.callWithContext('MizinLocalAnalysis', function(context)
        local progress = LrProgressScope { title = 'Mizin Lightroom - motor local', functionContext = context }
        local runnerDone, executionOK, exitCode = false, false, nil
        LrTasks.startAsyncTask(function()
            executionOK, exitCode = LrTasks.pcall(function() return LrTasks.execute(command) end)
            runnerDone = true
        end)
        local started, cancelSent = LrDate.currentTime(), false
        while true do
            if progress:isCanceled() and not cancelSent then
                writeText(child(job, 'cancel.request'), 'cancel\n')
                cancelSent = true
            end
            local status = readJson(child(job, 'status.json'))
            if status then
                progress:setCaption(cancelSent and 'Cancelamento solicitado; concluindo a etapa atual...' or
                    (tostring(status.completed) .. '/' .. tostring(status.total) .. ' - ' .. tostring(status.filename or status.phase)))
                if type(status.total) == 'number' and status.total > 0 then progress:setPortionComplete(status.completed, status.total) end
            else progress:setCaption('Iniciando o motor local...') end
            if runnerDone and (not executionOK or exitCode ~= 0) then
                error('O motor local retornou erro ' .. tostring(exitCode) .. '. Consulte bootstrap.log em:\n' .. job)
            end
            if runnerDone and LrFileUtils.exists(child(job, 'results.json')) then break end
            if LrDate.currentTime() - started > 1800 then
                writeText(child(job, 'cancel.request'), 'timeout\n')
                error('Tempo limite atingido. Cancelamento solicitado. Pasta: ' .. job)
            end
            LrTasks.sleep(0.3)
        end
        progress:done()
    end)
    M.showResults(job)
end

function M.lastResults()
    local job = LrPrefs.prefsForPlugin().lastSelectionRun
    if not job then error('Nenhuma analise foi iniciada. Use Mizin: analisar fotos selecionadas.') end
    local normalize = function(value) return value:gsub('\\', '/'):lower():gsub('/+$', '') end
    local expected = normalize(child(root(), 'jobs')) .. '/'
    if normalize(job):sub(1, #expected) ~= expected then error('Pasta de resultados invalida') end
    M.showResults(job)
end

function M.start(action)
    LrTasks.startAsyncTask(function()
        local ok, message = LrTasks.pcall(action)
        if not ok then LrDialogs.message('Mizin Lightroom', tostring(message), 'critical') end
    end)
end

return M
