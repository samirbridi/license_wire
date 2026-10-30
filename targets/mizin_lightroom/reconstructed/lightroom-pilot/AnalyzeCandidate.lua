local path=import 'LrPathUtils'
local engine=dofile(path.child(_PLUGIN.path,'LocalAnalysis.lua'))
engine.start(function() engine.run('analyze',nil,false,'candidate') end)
