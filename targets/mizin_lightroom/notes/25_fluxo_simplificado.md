# v0.15.0 build 0025

Menu principal reduzido a quatro comandos: editar, selecionar, restaurar, ferramentas/aprendizado. ToolsMenu.lua agrupa comandos existentes sem remove-los. Layout recebe place_horizontal=1 para reduzir desalinhamento (resultado exige QA visual nativo). Falha de applyDevelopSettings em modo direto registra hash observado quando escrita foi tentada; restauracao aceita estado observado somente se ainda coincide, recusando alteracoes posteriores. Nao confundir suite regressiva com teste especifico de toda nova ramificacao: 112 testes existentes passaram; novo caminho de erro ainda precisa cobertura dedicada. QA do pacote com dois RAWs pelo fluxo antigo, nao host nativo.

Evidencias qa-0025.txt, package-0025.json, release-0025.txt. Entrega Downloads/PLUGIN LIGHTROOM/CRISPIX-0.15.0-build0025-238fd4c8 com hash igual. Sem acesso a producao nem commits. Smart Preview, treino de virtuais/P&B e melhoria numerica ainda pendentes. Nao declarar produto final homologado.
