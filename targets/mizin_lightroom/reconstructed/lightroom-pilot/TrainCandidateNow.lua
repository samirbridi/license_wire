local path=import 'LrPathUtils'
local engine=dofile(path.child(_PLUGIN.path,'LocalAnalysis.lua'))
engine.start(function() engine.run('learning-update') end)
