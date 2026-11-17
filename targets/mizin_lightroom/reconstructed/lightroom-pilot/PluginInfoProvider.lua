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

-- Written once by Engine/gpu_detector.py (hardware detection only; not wired into
-- any inference path yet -- see the notice in sectionsForBottomOfDialog below for why).
local function readGpuStatus()
    local p = Paths.child(Paths.child(Paths.getStandardFilePath('appData'), 'MizinLightroomLocal'), 'gpu_status.json')
    local f = io.open(p, 'rb')
    if not f then return nil end
    local text = f:read(64 * 1024)
    f:close()
    if type(text) ~= 'string' then return nil end
    local device = text:match('"primaryDevice"%s*:%s*"([^"]*)"')
    local available = text:match('"available"%s*:%s*(%a+)') == 'true'
    local vram = text:match('"vram"%s*:%s*"([^"]*)"')
    return { available = available, device = device, vram = vram }
end

return {

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
        local gpu = readGpuStatus()
        local deviceLine = (gpu and gpu.available and gpu.device)
            and (gpu.device .. (gpu.vram and gpu.vram ~= '' and (' (' .. gpu.vram .. ')') or ''))
            or 'Nenhuma GPU NVIDIA com CUDA detectada nesta maquina'
        return {
            {
                title = 'CRISPIX - Hardware desta maquina',
                f:row {
                    f:static_text { title = 'GPU detectada:', width = 130 },
                    f:static_text { title = deviceLine, font = '<system/bold>' },
                },
                f:static_text {
                    title = 'A deteccao de hardware ja identifica sua GPU corretamente, mas a\n' ..
                            'aceleracao por GPU ainda nao esta ligada ao processamento nesta versao:\n' ..
                            'o culling e a selecao local continuam rodando por CPU.\n' ..
                            'Em testes, o OpenCV empacotado aceita pedir o backend CUDA sem avisar\n' ..
                            'que vai ignora-lo quando o modulo CUDA nao esta disponivel -- por isso\n' ..
                            'preferimos nao oferecer um botao "usar GPU" que nao mudaria nada.',
                    height_in_lines = 6,
                },
            },
        }
    end,
}
