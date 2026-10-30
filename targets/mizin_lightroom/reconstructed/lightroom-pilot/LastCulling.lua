local LrPathUtils=import 'LrPathUtils'
local engine=dofile(LrPathUtils.child(_PLUGIN.path,'LocalAnalysis.lua'))
engine.start(function() engine.lastResults('cull') end)
