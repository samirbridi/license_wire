local Paths = import 'LrPathUtils'
local View = import 'LrView'
local Http = import 'LrHttp'

local function readBuildVersion()
    local p = Paths.child(_PLUGIN.path, 'BuildInfo.json')
    local f = io.open(p, 'rb')
    if not f then return 'indisponivel' end
    local text = f:read(1024 * 1024)
    f:close()
    if type(text) ~= 'string' then return 'indisponivel' end
    return text:match('"version"%s*:%s*"([^"]+)"') or 'indisponivel'
end

local Tasks = import 'LrTasks'
local Dialogs = import 'LrDialogs'

local function acceleration()
    return dofile(Paths.child(_PLUGIN.path, 'Acceleration.lua'))
end

return {

    startDialog = function(properties)
        properties.accelPreference = acceleration().preference()
    end,

    endDialog = function(properties)
        local accel = acceleration()
        if properties.accelPreference ~= accel.preference() then
            accel.setPreference(properties.accelPreference)
            -- Nova preferencia: testa em segundo plano (a decisao em cache depende dela).
            Tasks.startAsyncTask(function() accel.refresh(false) end)
        end
    end,

    sectionsForTopOfDialog = function(f, properties)
        local bind = View.bind
        local headerPath = Paths.child(_PLUGIN.path, 'Branding/crispix-header.png')
        local ver = readBuildVersion()

        return {
            {
                title = 'CRISPIX - Visao Geral',
                f:row {
                    fill_horizontal = 1,
                    alignment = 'center',
                    f:spacer { fill_horizontal = 1 },
                    f:picture { value = headerPath, width = 340, height = 92 },
                    f:spacer { fill_horizontal = 1 },
                },
                f:row {
                    f:static_text { title = 'Versao instalada:', width = 130 },
                    f:static_text { title = ver .. '  ✓', font = '<system/bold>' },
                },
                f:row {
                    f:static_text { title = 'Status:', width = 130 },
                    f:static_text { title = 'Plugin ativo e integrado ao Lightroom Classic.' },
                },
                f:row {
                    f:push_button {
                        title = 'Verificar atualizacoes...',
                        action = function()
                            dofile(Paths.child(_PLUGIN.path, 'CheckUpdates.lua'))
                        end,
                    },
                    f:push_button {
                        title = 'Abrir site oficial',
                        action = function()
                            Http.openUrlInBrowser('https://crispixlr.pages.dev/')
                        end,
                    },
                },
            },
        }
    end,

    sectionsForBottomOfDialog = function(f, properties)
        local accel = acceleration()
        local status = accel.status()
        local nvidia = status and status.nvidia or {}
        local gpuLine = nvidia.available and (tostring(nvidia.primaryDevice) ..
            (nvidia.vram and nvidia.vram ~= '' and (' - ' .. nvidia.vram) or '') ..
            (nvidia.driver and (' - driver com ' .. nvidia.driver) or '')) or 'Nenhuma GPU NVIDIA detectada'
        local rows = {
            f:row {
                f:static_text { title = 'Aceleracao em uso:', width = 150 },
                f:static_text { title = status and tostring(status.chosenLabel) or 'Ainda nao testada (clique em Testar novamente)',
                                font = '<system/bold>' },
            },
            f:row {
                f:static_text { title = 'GPU NVIDIA:', width = 150 },
                f:static_text { title = gpuLine },
            },
        }
        for _, candidate in ipairs(status and status.candidates or {}) do
            rows[#rows + 1] = f:row {
                f:static_text { title = '  ' .. tostring(candidate.label) .. ':', width = 150 },
                f:static_text { title = accel.describe(candidate) },
            }
        end
        local items = {}
        for _, option in ipairs(accel.PREFERENCES) do items[#items + 1] = option end
        rows[#rows + 1] = f:row {
            f:static_text { title = 'Preferencia:', width = 150 },
            f:popup_menu { value = View.bind { key = 'accelPreference', object = properties }, items = items },
        }
        rows[#rows + 1] = f:row {
            f:push_button {
                title = 'Testar novamente',
                action = function()
                    Tasks.startAsyncTask(function()
                        accel.setPreference(properties.accelPreference)
                        local result = accel.refresh(true)
                        Dialogs.message('CRISPIX - Aceleracao por IA', 'Aceleracao em uso: ' ..
                            tostring(result and result.chosenLabel or 'indisponivel') ..
                            '.\nReabra o Gerenciador de Plug-ins para ver os tempos de cada opcao.', 'info')
                    end)
                end,
            },
            f:push_button {
                title = 'Instalar aceleracao NVIDIA (CUDA, ~1,3 GB)...',
                action = function()
                    Tasks.startAsyncTask(function() accel.installCuda() end)
                end,
            },
        }
        rows[#rows + 1] = f:static_text {
            title = 'O CRISPIX testa cada opcao com um modelo de IA real e usa a mais indicada que\n' ..
                    'funciona de verdade nesta maquina: NVIDIA CUDA (componente opcional), DirectML\n' ..
                    '(qualquer GPU com DirectX 12) ou CPU. A edicao e a exportacao do Lightroom nao mudam.',
            height_in_lines = 3,
        }
        rows.title = 'CRISPIX - Aceleracao por IA (GPU)'
        return { rows }
    end,
}
