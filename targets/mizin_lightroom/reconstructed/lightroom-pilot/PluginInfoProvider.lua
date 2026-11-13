local Paths=import 'LrPathUtils'
return {
    sectionsForTopOfDialog=function(f,properties)
        return {{title='CRISPIX - atualizacoes',
            f:static_text{title='Busque e instale a versao mais recente pela internet.'},
            f:push_button{title='Verificar atualizacoes...',action=function()
                dofile(Paths.child(_PLUGIN.path,'CheckUpdates.lua'))
            end}}}
    end,
}
