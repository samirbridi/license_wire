local path=import 'LrPathUtils'
local engine=dofile(path.child(_PLUGIN.path,'LocalAnalysis.lua'))
engine.start(function() dofile(path.child(_PLUGIN.path,'AcervoLearning.lua')).import('catalog') end)
