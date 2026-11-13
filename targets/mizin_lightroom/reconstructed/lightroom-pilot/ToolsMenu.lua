local Paths=import 'LrPathUtils'
local View=import 'LrView'
local Binding=import 'LrBinding'
local Context=import 'LrFunctionContext'
local Dialogs=import 'LrDialogs'
local engine=dofile(Paths.child(_PLUGIN.path,'LocalAnalysis.lua'))
local choices={
 {title='Edição automática (pasta vigiada)',value='AutoEditMenu.lua'},
 {title='Verificar atualizações',value='CheckUpdates.lua'},
 {title='Abrir pasta de dados e recuperação',value='OpenLocalData.lua'},
 {title='Diagnosticar motor local',value='DiagnoseEngine.lua'},
 {title='Ver últimos resultados',value='LastResults.lua'},
 {title='Ver última seleção',value='LastCulling.lua'},
 {title='Analisar seleção sem editar',value='AnalyzeSelected.lua'},
 {title='Coletar referências aprovadas',value='CollectReferences.lua'},
 {title='Aprender com catálogo',value='LearningMenu.lua'},
 {title='Aprender com coleção',value='LearningFromCollection.lua'},
 {title='Registrar evento concluído',value='EventCompleted.lua'},
 {title='Continuar aprendizado',value='ResumeLearning.lua'},
 {title='Ver aprendizado',value='LearningStatus.lua'},
 {title='Treinar candidato agora com o que já foi aprendido',value='TrainCandidateNow.lua'},
 {title='Avaliar candidato do acervo',value='AnalyzeCandidate.lua'},
 {title='Registrar opinião',value='LearningFeedback.lua'},
 {title='Comparar amostra histórica do piloto',value='ComparePilot.lua'}
}
local selected=nil
Context.callWithContext('CrispixTools',function(context)
 local props=Binding.makePropertyTable(context);props.action=choices[1].value
 local f=View.osFactory()
 if Dialogs.presentModalDialog{title='CRISPIX - ferramentas',contents=f:column{bind_to_object=props,
 f:static_text{title='Ferramentas e aprendizado',font='<system/bold>'},
 f:popup_menu{value=View.bind('action'),items=choices,width_in_chars=52},
 f:static_text{title='Coleta e treino atuais: CR3 em cor. Não há ativação automática de modelo.',width_in_chars=60}},actionVerb='Abrir',cancelVerb='Cancelar'}=='ok' then selected=props.action end
end)
if selected then
 for _,item in ipairs(choices) do
  if selected==item.value then dofile(Paths.child(_PLUGIN.path,selected));return end
 end
end
