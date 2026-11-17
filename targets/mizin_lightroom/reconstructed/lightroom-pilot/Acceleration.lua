-- Aceleracao por IA (ONNX Runtime): NVIDIA CUDA > DirectML > CPU, escolhida por teste real.
-- Engine/accelerator.py testa cada provedor num processo proprio e grava a decisao em
-- %AppData%\MizinLightroomLocal\accelerator.json; este modulo so le, pede novo teste e instala
-- o componente opcional NVIDIA CUDA (~1,3 GB, Install-AccelPack.py) com a barra nativa.
local Dialogs = import 'LrDialogs'
local FileUtils = import 'LrFileUtils'
local FunctionContext = import 'LrFunctionContext'
local Paths = import 'LrPathUtils'
local Prefs = import 'LrPrefs'
local Tasks = import 'LrTasks'
local Json = dofile(Paths.child(_PLUGIN.path, 'Json.lua'))

local M = {}
M.MANIFEST_URL = 'https://crispixlr.pages.dev/accel-cuda.json'
M.PREFERENCES = {
    { value = 'auto', title = 'Automatico (recomendado)' },
    { value = 'cuda', title = 'NVIDIA CUDA' },
    { value = 'directml', title = 'DirectML (qualquer GPU DirectX 12)' },
    { value = 'cpu', title = 'Somente CPU' },
}
local VALID = { auto = true, cuda = true, directml = true, cpu = true }
local STATUS = {
    READY = 'pronto', NOT_INSTALLED = 'componente nao instalado', MISSING_FROM_PLUGIN = 'ausente nesta instalacao',
    NO_NVIDIA_GPU = 'sem GPU NVIDIA', DRIVER_TOO_OLD = 'driver NVIDIA antigo', FAILED = 'falhou no teste',
}

local function dataRoot()
    return Paths.child(Paths.getStandardFilePath('appData'), 'MizinLightroomLocal')
end

local function quote(path)
    if path:find('[%%!"%z\1-\31]') then error('Caminho incompativel com o Windows: %, ! ou aspas.') end
    return '"' .. path .. '"'
end

-- cmd.exe precisa de um par extra de aspas em volta da linha inteira quando o executavel tem
-- espaco no caminho (mesma regra do CheckUpdates.lua).
local function run(commandLine)
    return Tasks.execute('"' .. commandLine .. '"')
end

local function python()
    return Paths.child(Paths.child(_PLUGIN.path, 'Runtime'), 'pythonw.exe')
end

local function readJson(path)
    local f = io.open(path, 'rb')
    if not f then return nil end
    local text = f:read(4 * 1024 * 1024)
    f:close()
    if type(text) ~= 'string' then return nil end
    local ok, value = pcall(Json.decode, (text:gsub('^\239\187\191', '')))
    return ok and type(value) == 'table' and value or nil
end

function M.preference()
    local value = Prefs.prefsForPlugin().accelPreference
    return VALID[value] and value or 'auto'
end

function M.setPreference(value)
    if VALID[value] then Prefs.prefsForPlugin().accelPreference = value end
end

function M.status()
    return readJson(Paths.child(dataRoot(), 'accelerator.json'))
end

function M.describe(candidate)
    local text = STATUS[candidate.status] or tostring(candidate.status or '?')
    if candidate.status == 'READY' and tonumber(candidate.medianMs) then
        text = text .. string.format(' - %.1f ms por inferencia de teste', tonumber(candidate.medianMs))
    end
    if candidate.detail then text = text .. ' (' .. tostring(candidate.detail) .. ')' end
    return text
end

-- Roda dentro de uma tarefa assincrona. force=true testa de novo mesmo com cache valido.
function M.refresh(force)
    local engine = Paths.child(Paths.child(_PLUGIN.path, 'Engine'), 'accelerator.py')
    if not FileUtils.exists(python()) or not FileUtils.exists(engine) then return M.status() end
    run(quote(python()) .. ' -I ' .. quote(engine) .. ' --status --plugin ' .. quote(_PLUGIN.path) ..
        ' --preference ' .. M.preference() .. (force and ' --refresh' or ''))
    return M.status()
end

function M.cudaCandidate(status)
    for _, candidate in ipairs(status and status.candidates or {}) do
        if candidate.name == 'cuda' then return candidate end
    end
    return nil
end

-- Baixa e instala o componente NVIDIA CUDA com a barra nativa (roda dentro de uma tarefa).
function M.installCuda()
    local status = M.status()
    if status and status.nvidia and status.nvidia.available == false then
        Dialogs.message('CRISPIX - Aceleracao NVIDIA', 'Nenhuma GPU NVIDIA foi encontrada nesta maquina.\n' ..
            'O CRISPIX continua usando DirectML ou CPU automaticamente.', 'info')
        return false
    end
    local confirm = Dialogs.confirm('Instalar aceleracao NVIDIA (CUDA)?',
        'Serao baixados cerca de 1,3 GB (bibliotecas oficiais NVIDIA CUDA 13 e cuDNN 9).\n' ..
        'Requer driver NVIDIA R580 ou mais novo. O componente fica em %AppData%\\MizinLightroomLocal\\accel\n' ..
        'e nao altera o plugin nem o catalogo. Voce pode continuar usando o Lightroom durante o download.',
        'Baixar e instalar', 'Cancelar')
    if confirm ~= 'ok' then return false end
    local progressFile = Paths.child(Paths.getStandardFilePath('temp'), 'crispix_accel_progress.json')
    if FileUtils.exists(progressFile) then FileUtils.delete(progressFile) end
    local installer = Paths.child(_PLUGIN.path, 'Install-AccelPack.py')
    local command = quote(python()) .. ' -I ' .. quote(installer) .. ' --detach --manifest ' .. quote(M.MANIFEST_URL) ..
        ' --progress-file ' .. quote(progressFile) .. ' --engine ' .. quote(Paths.child(_PLUGIN.path, 'Engine'))
    local done, result = false, nil
    FunctionContext.callWithContext('crispixAccelInstall', function(context)
        local progress = Dialogs.showModalProgressDialog {
            title = 'CRISPIX - Instalando aceleracao NVIDIA (CUDA)',
            caption = 'Iniciando o download...', cannotCancel = true, functionContext = context,
        }
        local started, code = Tasks.pcall(function() return run(command) end)
        if not started or code ~= 0 then
            result = { message = 'Nao foi possivel iniciar o instalador (' .. tostring(code) .. ').' }
            return
        end
        local deadline = os.time() + 3 * 3600
        while os.time() < deadline do
            Tasks.sleep(0.25)
            local state = readJson(progressFile)
            if state then
                progress:setPortionComplete(tonumber(state.percent) or 0, 1)
                if state.message then progress:setCaption(tostring(state.message)) end
                if state.stage == 'done' then done, result = true, state return end
                if state.stage == 'error' then result = state return end
            end
        end
        result = { message = 'Tempo limite esgotado.' }
    end)
    if done then
        Dialogs.message('CRISPIX - Aceleracao NVIDIA', 'Componente NVIDIA CUDA instalado.\n' ..
            'Aceleracao em uso agora: ' .. tostring(result.chosenLabel or 'veja no Gerenciador de Plug-ins') .. '.', 'info')
    else
        Dialogs.message('CRISPIX - Aceleracao NVIDIA', 'Nao foi possivel instalar:\n' ..
            tostring(result and result.message or 'erro desconhecido') ..
            '\n\nNada foi alterado; a aceleracao atual continua valendo.', 'critical')
    end
    return done
end

return M
