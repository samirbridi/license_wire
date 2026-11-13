# v0.13.1 build 0021

Removida retomada automatica do acervo em LearningInit.lua: usuario retoma explicitamente pelo menu. Nao limpamos flags de tarefas arbitrariamente. Busy diferencia acervo, motor e edicao/restauracao. Restauracao confirma ID, modo, quantidade e pasta da ultima sessao; explica que selecao atual nao define o alvo. Mensagem final diferencia nao restaurados e informa pasta. Nome do menu atualizado. Progress scope envolve restauracao, ainda sem progresso granular/cancelamento nessa etapa.

112 testes regressivos aprovados; QA do pacote com RAW real, hashes e Lua em evidence/release-0021.txt; suite qa-0021.txt e pacote package-0021.json. Nao resolve comprovadamente erro antigo linha 165: falta registro da sessao de edicao/restauracao. Arquivos recebidos em Downloads/PLUGIN LIGHTROOM confirmam somente analise: build0020, 143 fotos em cor, zero falhas, 160.929 segundos. Nao prova aplicacao/restauracao ou loop. Nenhum dado de cliente publicado.

Smart Previews, aprendizado de copias virtuais/P&B e qualidade numerica ainda pendentes. Sem novo treino. Entrega nova Downloads/PLUGIN LIGHTROOM/MizinLightroom-0.13.1-build0021-e38e7bd2, hash conferido. Nao instalado em producao. Versao incrementada manualmente, sem commits.
