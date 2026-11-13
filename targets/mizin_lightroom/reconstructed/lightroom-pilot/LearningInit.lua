-- Learning is resumed explicitly through the menu, never silently on startup.
-- Do not reset busy flags: plugin reload may overlap an existing task.
-- The watched folder resumes only if the user turned it on and did not pause it.
local Paths=import 'LrPathUtils'
local ok=pcall(function() dofile(Paths.child(_PLUGIN.path,'AutoEdit.lua')).resumeIfEnabled() end)
