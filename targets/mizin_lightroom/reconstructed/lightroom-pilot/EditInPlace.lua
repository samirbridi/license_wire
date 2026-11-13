local Paths=import 'LrPathUtils'
local engine=dofile(Paths.child(_PLUGIN.path,'LocalAnalysis.lua'))
engine.start(function() dofile(Paths.child(_PLUGIN.path,'PhotoEditor.lua')).edit(true) end)
