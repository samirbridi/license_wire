# v0.19.0 build 0031 — edicao automatica por pasta vigiada

Implementacao independente (o SDK nao tem evento de importacao). Nenhum codigo do Neurapix.

## Desenho

- `AutoEdit.lua`: uma pasta por catalogo, estado em `appData/MizinLightroomLocal/autoedit/watch.json` (gravacao em `.tmp` + rename; limite 8 MiB). Menu `AutoEditMenu.lua` em FERRAMENTAS: ligar (pasta da foto selecionada, com confirmacao), pausar/retomar, desligar; mostra contadores, ultima execucao e ultimo erro.
- Linha de base = maior `localIdentifier` do CATALOGO inteiro no momento de ligar: fotos antigas movidas para a pasta nunca contam como novas.
- Elegibilidade (a cada `INTERVAL=60` s): contagem da pasta igual a da verificacao anterior (importacao terminou) -> primeira observacao grava fingerprint -> proxima observacao com fingerprint igual = pronta. Fingerprint diferente = fotografo mexeu: `CHANGED_BEFORE_AUTOMATIC_EDIT`, ignorada para sempre. Copias virtuais `VIRTUAL_COPY`, nao-CR3 `NOT_CR3`. Maximo 100 por lote.
- `PhotoEditor.autoEdit(list,label,expected)`: refatoracao — o nucleo de `edit()` virou `process(...)` compartilhado (manual inalterado; 153 testes anteriores continuam passando). Modo automatico: sem dialogos, sempre IN_PLACE (nao troca selecao/modulo; createVirtualCopies exigiria isso), opcoes de `M.autoChoice()` = ultima janela EDITAR FOTOS (modelo piloto/candidato agora tambem salvo), horizonte/mascaras desligados. Fotos alteradas entre a varredura e a captura sao descartadas (`expected`). Falhas parciais continuam sem perguntar; nao calculadas ficam `NOT_COMPUTED`. Lote vai para colecao `CRISPIX - Edicao automatica/Auto <data> - <pasta>` (sem mudar fontes ativas). Bezel informativo.
- Erro -> pausa + `lastError` (sem repetir a cada minuto). Cancelamento no progresso -> pausa. Ocupado (acervo/motor/edicao) -> espera.
- Loop com geracao (`_G.CrispixAutoEditGeneration`): recarregar plug-in, desligar ou encerrar o Lightroom (LearningShutdown) termina o loop antigo. `LearningInit` retoma somente vigilancia ligada e nao pausada.
- Cada lote grava `lastEditSession`: RESTAURAR ULTIMA SESSAO desfaz o ultimo lote automatico (substitui o atalho da ultima sessao manual; sessoes antigas continuam no disco).

## Verificacao

- 159 testes (+6 em `test_autoedit_lua.py`): importacao em andamento/espera/edicao sem mudar selecao, modulo ou copias, colecao, restauracao da sessao automatica; foto alterada antes da edicao preservada; antigas/movidas/virtuais/JPEG ignoradas; ocupado/outro catalogo/pausado sem efeito; erro do motor pausa; geracao encerra loop.
- Pacote `private/deliveries/CRISPIX-0.19.0-build0031-2525d1a3/`, ZIP 84.023.846 bytes, SHA-256 `ee93c2291c823ad2f0f29e8ed3f5d72230edbabe1e370e15f2959a601b09082a`, 1.741 arquivos, 30 fontes Lua. `verify_editing_release.py` OK com dois RAWs reais. Recibos `evidence/package-0031.json`, `evidence/editing-plugin-qa-0031.json`.

## Pendente / limites

- Nada executado no Lightroom real: `getFolderByPath`, `folder:getPhotos`, `getAllPhotos` em catalogo de 37 mil fotos, `startAsyncTask` iniciado no LrInitPlugin, `showBezel` e escrita em segundo plano enquanto o usuario trabalha precisam de QA nativo. Testar com pasta e CR3 descartaveis.
- Heuristica de "importacao terminou" depende da contagem estavel por 1 minuto; importacoes muito lentas podem gerar lotes menores (seguro).
- Nao ha vigilancia de subpastas nem de varias pastas. Smart Previews continua adiado (nota 30).
- Sem commits; VERSION manual.

## Entrega

Copiado para Downloads/PLUGIN LIGHTROOM/CRISPIX-0.19.0-build0031-2525d1a3 (ZIP, LEIA-ME.md, SHA256SUMS.txt); SHA-256 do ZIP igual a origem. Nao copiado para o compartilhamento da maquina de edicao; nao instalado. Recibo evidence/delivery-0031.json.

