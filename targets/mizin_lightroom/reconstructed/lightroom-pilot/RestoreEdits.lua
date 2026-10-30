local LrPathUtils=import 'LrPathUtils'
local engine=dofile(LrPathUtils.child(_PLUGIN.path,'LocalAnalysis.lua'))
engine.start(function() dofile(LrPathUtils.child(_PLUGIN.path,'PhotoEditor.lua')).restoreLatest() end)
