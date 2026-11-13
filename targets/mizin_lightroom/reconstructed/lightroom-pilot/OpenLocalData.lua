local Paths=import 'LrPathUtils'
local Shell=import 'LrShell'
local Files=import 'LrFileUtils'
local Dialogs=import 'LrDialogs'
local root=Paths.child(Paths.getStandardFilePath('appData'),'MizinLightroomLocal')
if Files.exists(root) then Shell.openFilesInApp({root}) else Dialogs.message('CRISPIX','Ainda não há dados locais. Pasta prevista: '..root,'info') end
