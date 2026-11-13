# v0.17.0 build 0029 — ajuste fino do estilo, preset complementar e correcoes

Implementacao independente; nenhum codigo, recurso ou peso do Neurapix. Comparacao de recursos baseada somente nas notas do alvo `neurapix` (01, 05, 07, 08, 09).

## Bugs corrigidos

1. **Aprendizado do catalogo descartava os 31 controles adicionais** (AcervoLearning.lua). `snapshot` capturava so os dez basicos, entao `extendedParameters` nunca chegava ao treino pelo caminho principal (Aprender com catalogo / Registrar evento). A assinatura tambem ignorava HSL/textura: mudanca nesses controles depois da aprovacao era aprendida como aprovada. Agora o lote recebe os valores frescos e a fila guarda apenas `extendedSignature` (SHA-256), mantendo filas de 10.000 fotos abaixo de 8 MiB. Filas antigas sem assinatura retomam comparando so os dez basicos.
2. **Um arquivo nao-CR3 na selecao abortava a edicao inteira** (PhotoEditor.capture). Agora JPEG/DNG/etc. e P&B sao contados e ignorados com confirmacao. Foto repetida continua sendo erro.
3. **Uma foto com falha no motor abortava o lote** (`status~='COMPLETED'`). Agora `COMPLETED_WITH_ERRORS` mostra ate cinco motivos e pergunta se continua com as calculadas; as nao calculadas ficam intocadas.
4. **Motor que encerrava com codigo 0 sem results.json** fazia o plug-in esperar o timeout (>=30 min). Agora erro apos 10 s (LocalAnalysis.lua).
5. Restauracao direta (IN_PLACE) nao gravava `restore-issues-*.json`; agora grava como no modo copias.
6. Mensagem de cancelamento no modo direto falava em "copias na colecao"; corrigida. Texto da analise apontava menu antigo.

## Recursos novos (janela EDITAR FOTOS)

- **Intensidade 0-100%**: `valor = atual + k*(previsto-atual)`, por controle previsto.
- **Ajuste fino** (equivalente funcional do "Biasing/ajustar estilo" observado no Neurapix): deslocamentos somados depois do modelo para exposicao (+-2 EV), temperatura (+-3000 K), matiz, contraste, realces, sombras, brancos, pretos, saturacao, vibratilidade, textura, claridade e desembacar (+-50). Textura/claridade/desembacar nao previstos sao somados ao valor atual. Resultado limitado aos limites do SDK. Botao Zerar. Escolhas salvas em `prefs.editOptions` e saneadas na leitura (`M.validOptions`). Permite compensar a tendencia conhecida do piloto (exposicao alta/temperatura fria) sem retreino.
- **Preset complementar do Lightroom** (Neurapix usa `developPresetFolders`/`developPresetByUuid`, nota 07): `preset:getSetting()` filtrado — nunca ProcessVersion, Orientation, Crop*, mascaras, retoques, olhos vermelhos, Upright/Perspective. O modelo prevalece em todo controle planejado (incluindo aliases CustomTemperature/ColorGrade*). Chaves do preset ficam em `record.presetKeys`; nao entram na verificacao estrita (Lightroom pode normalizar valores), mas o `afterHash` registra o estado real e a restauracao (snapshot/registro before) continua valida.
- **Equilibrio de WB por sequencia** (vantagem propria): `local_engine.scene_consistency` agrupa fotos com ate 30 s entre disparos (EXIF SubSecDateTimeOriginal) e aplica a mediana de Temperature (+-12%) e Tint (+-8) apenas aos inliers. Flash/novo ambiente fora da faixa mantem valor proprio. Exposicao nunca e suavizada. Valores originais ficam em `results[].sceneConsistency.originalPredictions`; resumo em `report.sceneConsistency` e no `session.json`.

## Verificacao

- Suite completa: 145 testes OK (antes 130). Novos: captura mista, intensidade/limites/valores invalidos, saneamento de prefs, filtro e precedencia do preset, aplicacao+restauracao com preset, entrada completa com ajuste salvo e opcao de cena, lote parcial (continuar/cancelar), arquivo de problemas da restauracao direta, acervo com controles adicionais/assinatura/fila legada, motor sem resultados, parser EXIF e equalizacao por sequencia.
- Pacote `private/deliveries/CRISPIX-0.17.0-build0029-87eec3cb/`, ZIP 84.013.483 bytes, SHA-256 `97b306bb66fc59634eaf4c5d9fa1965731398bf39f75a29ef4f18a6662368b98`. `verify_editing_release.py`: 1.738 hashes, CRC, 28 fontes Lua, dois RAWs reais no runtime isolado, aplicacao/restauracao em SDK doubles, hashes RAW iguais. Recibos `evidence/package-0029.json`, `evidence/editing-plugin-qa-0029.json`.
- Motor do pacote com `sceneConsistency`: dois RAWs reais, horarios lidos, 78 min de intervalo, nenhuma sequencia (comportamento esperado). A equalizacao em si so foi exercitada em testes sinteticos. Recibo `evidence/scene-consistency-qa-0029.json`.

## Limites e pendencias

- Nada disso foi executado no Lightroom real: layout da janela (sliders em duas colunas), `developPresetFolders`/`getSetting` e normalizacao de valores de preset precisam de QA nativo. Testar cinco fotos descartaveis em novas copias.
- Modelo numerico inalterado (piloto `9f1cd19d...`); nenhum treino novo, nenhuma melhoria de qualidade medida, nenhuma paridade com Neurapix demonstrada.
- Ainda ausentes frente ao Neurapix: crop/horizonte automatico (prototipo nao integrado, nota 27), mascaras/sujeito, Smart Previews, automacao na importacao, GPU, modelo P&B.
- Nao copiado para Downloads nem para o compartilhamento da maquina de edicao; nenhuma instalacao ou catalogo de producao alterado. VERSION incrementada manualmente (arvore nao limpa), sem commits.
