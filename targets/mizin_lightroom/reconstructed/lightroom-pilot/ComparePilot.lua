local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local function numberText(value, decimals)
    if type(value) ~= "number" then return "indisponivel" end
    return string.format("%." .. tostring(decimals) .. "f", value)
end

LrTasks.startAsyncTask(function()
    local ok, failure = LrTasks.pcall(function()
        local pilot = dofile(LrPathUtils.child(_PLUGIN.path, "PilotData.lua"))
        if pilot.schema ~= "mizin-lightroom.saved-pilot/1" then
            error("Dados do piloto invalidos.")
        end
        local catalog = LrApplication.activeCatalog()
        if type(catalog.findPhotoByPath) ~= "function" then
            error("A consulta de fotos nao esta disponivel neste Lightroom.")
        end
        local lines = {
            "Comparacao de previsoes salvas para este teste. Nenhuma edicao sera aplicada.",
            "Este comando compara previsoes salvas do catalogo de outubro. Para novos RAWs, use Analisar fotos selecionadas no pacote com motor local.",
            "",
        }
        local found = 0
        local shown = 0
        for _, entry in ipairs(pilot.entries) do
            local photo = catalog:findPhotoByPath(entry.path)
            if photo and not photo:getRawMetadata("isVirtualCopy") then
                found = found + 1
                if shown < 5 then
                    local current = photo:getDevelopSettings()
                    shown = shown + 1
                    lines[#lines + 1] = entry.filename
                    lines[#lines + 1] = "  Exposicao: atual " .. numberText(current.Exposure2012, 2) .. " | piloto " .. numberText(entry.predictions.Exposure2012, 2)
                    lines[#lines + 1] = "  Temperatura: atual " .. numberText(current.Temperature, 0) .. " K | piloto " .. numberText(entry.predictions.Temperature, 0) .. " K"
                    lines[#lines + 1] = "  Contraste: atual " .. numberText(current.Contrast2012, 1) .. " | piloto " .. numberText(entry.predictions.Contrast2012, 1)
                    lines[#lines + 1] = ""
                end
            end
        end
        if found == 0 then
            lines[#lines + 1] = "As fotos deste teste nao foram encontradas no catalogo aberto. Abra o catalogo 202610 - OUTUBRO e tente novamente."
        else
            lines[#lines + 1] = "Mostrando " .. tostring(shown) .. " de " .. tostring(found) .. " fotos localizadas, em " .. tostring(#pilot.entries) .. " referencias do teste."
        end
        lines[#lines + 1] = "Modelo experimental de um unico trabalho; qualidade fotografica ainda em avaliacao."
        LrDialogs.message("Mizin Lightroom - Piloto de leitura", table.concat(lines, "\n"), "info")
    end)
    if not ok then
        LrDialogs.message("Mizin Lightroom - leitura indisponivel", "Confira a pasta do plugin e o catalogo aberto. Detalhe: " .. tostring(failure), "warning")
    end
end)
