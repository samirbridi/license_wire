local LrPathUtils = import 'LrPathUtils'
local engine = dofile(LrPathUtils.child(_PLUGIN.path, 'LocalAnalysis.lua'))
engine.start(engine.lastResults)
