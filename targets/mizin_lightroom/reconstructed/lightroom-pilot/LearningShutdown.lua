_G.MizinLearningStop=true
if _G.MizinActiveEngineJob then
    local path=import 'LrPathUtils'
    local f=io.open(path.child(_G.MizinActiveEngineJob,'cancel.request'),'wb')
    if f then f:write('shutdown\n');f:close() end
end
