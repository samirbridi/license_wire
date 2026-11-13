_G.MizinLearningStop=true
-- Ends the watched-folder loop of this plugin load.
_G.CrispixAutoEditGeneration=(_G.CrispixAutoEditGeneration or 0)+1
if _G.MizinActiveEngineJob then
    local path=import 'LrPathUtils'
    local f=io.open(path.child(_G.MizinActiveEngineJob,'cancel.request'),'wb')
    if f then f:write('shutdown\n');f:close() end
end
