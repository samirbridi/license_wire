# CHANGELOG - mizin_lightroom

## v0.25.0 (build 0039) - 2026-11-13

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: instala atualizacoes pelo Lightroom com backup e corrige bloqueio do Windows (commit `a8e87973577f309a8bd1ffb17ee859dfeb202311`)

### 🐛 Fixes

- fix: corrige verificacao de corte e continua lotes apos falhas por foto (commit `e0bce06433a24038869fdf5cef1e46e77a23a5b3`)

### ⚡ Improvements

- Nenhum.

## v0.24.1 (build 0038) - 2026-11-13

### Fixes
- fix: a atualizacao pela internet nunca funcionou (builds 0036 e 0037): o latest.json publicado no site saia com BOM UTF-8 (Set-Content -Encoding UTF8 do PowerShell 5.1), e tanto o Json.lua do plugin ("Numero JSON invalido") quanto o ConvertFrom-Json do atualizador falhavam, caindo sempre para a rede local. Publicador grava sem BOM; CheckUpdates.lua e Update-CrispixPlugin.ps1 passam a tolerar BOM.
- fix: Publish-CrispixBuild.ps1 fixa a versao do wrangler ja instalada (4.152.0); sem isso o npx --no-install tentava a mais nova e a publicacao na internet falhava.

## v0.24.0 (build 0037) - 2026-11-13

### Fixes
- fix: "Endireitar horizonte" gravava o corte numa convencao que o Lightroom nao usa (margens iguais nos 4 lados, na orientacao da foto). O Lightroom guarda os cantos superior-esquerdo e inferior-direito do retangulo girado, no referencial do sensor; a formula nova (PhotoEditor.M.cropFor) bate com 111 de 127 endireitamentos feitos pelo proprio Lightroom no catalogo aprovado (os outros 16 foram apertados a mao). O motor agora informa se a foto esta girada em relacao ao sensor (sensorSwapped).
- fix: sinal do CropAngle (HORIZON_SIGN=1), pendente desde o build 0030, confirmado com dados reais: o detector concorda em sinal com o fotografo em 8 de 9 fotos.
- fix: edicao automatica por pasta vigiada ignorava a opcao "Endireitar horizonte" salva (autoChoice forcava horizon=false com justificativa obsoleta desde o build 0032).
- fix: atualizador forcava o encerramento do Lightroom 15 s apos pedir para fechar (no modo -NonInteractive sem perguntar), com risco ao catalogo durante o backup; agora espera ate 3 min e nunca forca sem confirmacao.
- fix: preserved() trata todo o grupo Crop* como planejado quando ha endireitamento, evitando falso "controles preservados mudaram" se o Lightroom atualizar campos derivados do corte.

### Improvements
- improve: detector de horizonte medido contra o nivelamento real do fotografo (425 de 546 fotos endireitadas >=0.3 grau): exige que linhas verticais nao contradigam as horizontais (ou que as duas familias concordem) e trata inclinacoes acima de 5 graus como intencionais. Resultado: 8 propostas mais proximas e 2 mais distantes (antes 6 e 4), sem propostas absurdas. Cobertura continua ~2%, por desenho.
- improve: CheckUpdates.lua so aceita manifesto que seja objeto JSON.
- improve: scripts/evaluate_horizon_ground_truth.py reproduz as duas medicoes (convencao do corte e detector) contra qualquer dataset preservado.

### Performance
- perf: leitura de metadados com uma unica sessao ExifTool (-stay_open) por trabalho em vez de um processo por foto: 1,78 s -> 0,20 s por foto, resultados identicos (inclusive caminhos acentuados); qualquer falha da sessao volta ao caminho antigo para aquela foto.

## v0.23.0 (build 0036) - 2026-11-12

### Features
- feat: "Verificar atualizações" e o atualizador de 1 clique agora tentam a internet primeiro (https://crispixlr.pages.dev), caindo para a rede local so se a internet estiver indisponivel.
- feat: pacote de atualizacao (~84MB, acima do limite de 25MB do Cloudflare Pages) hospedado em bucket Cloudflare R2 publico (crispix-updates); o site guarda so o manifesto.
- feat: Publish-CrispixBuild.ps1 publica nos dois canais (rede local + R2/Pages) com 1 comando, validando hash em cada um antes de considerar concluido.

## v0.22.0 (build 0035) - 2026-11-12

### Features
- feat: novo comando FERRAMENTAS > "Verificar atualizações" (CheckUpdates.lua); consulta o canal de rede e pede para atualizar quando ha versao nova, sem travar se a rede estiver indisponivel.
- feat: atualizador de 1 clique (Atualizar-CRISPIX.cmd + Update-CrispixPlugin.ps1, incluidos dentro da propria pasta do plugin); fecha o Lightroom com seguranca, valida hash SHA-256, faz backup, instala no mesmo lugar (sem precisar remover/adicionar no Gerenciador de plug-ins) e restaura o backup sozinho se algo falhar.
- feat: Publish-CrispixBuild.ps1 publica um build no canal de rede com 1 comando, validando o hash no destino; build_lightroom_local.py agora grava automaticamente o manifesto latest.json usado pelo atualizador.

## v0.21.0 (build 0034) - 2026-11-11

### Features
- feat: novo comando FERRAMENTAS > "Aprender com colecao" (LearningFromCollection.lua); lista todas as colecoes do catalogo (inclusive dentro de conjuntos, com caminho completo) e aprende com as fotos da colecao escolhida, aceitando varios trabalhos numa mesma colecao.

## v0.20.0 (build 0033) - 2026-11-11

### Features
- feat: novo comando FERRAMENTAS > "Treinar candidato agora com o que ja foi aprendido" (TrainCandidateNow.lua); dispara o treino imediatamente sem depender do fim de uma fila inteira de importacao do catalogo.
- feat: inicio da extracao de tom de pele (skin_tone_sample em raw_features.py), reaproveitando o detector de rosto publico ja usado na selecao; medida com correlacao de -0.73 entre cor de pele e Temperatura aprovada em 186 fotos reais. So coleta/mede nesta entrega; nenhum modelo ainda foi treinado com a feature.

### Fixes
- fix: "Endireitar horizonte" nunca tinha efeito em nenhuma foto real (nem recem-importada) porque o corte exigia posicao EXATAMENTE zerada antes de aplicar; 0 de 2.201 fotos reais do catalogo atendiam essa exigencia. Adicionada tolerancia de corte (ate 5% de margem, ate 0.5 grau de angulo residual).
- fix: mensagem final da edicao so informava "X de Y fotos endireitadas"; agora detalha a razao especifica de cada foto nao endireitada (vocabulario fixo: sem linhas confiaveis, ja nivelada, corte alem da tolerancia, etc.).

### Improvements
- improve: documentado no LEIA-ME do pacote que todo o aprendizado/fila/registros de edicao ficam em %AppData%\MizinLightroomLocal\, fora da pasta do plugin; atualizar a instalacao nunca apaga esses dados.

## v0.19.1 (build 0032) - 2026-11-11

### Fixes
- fix: janela EDITAR FOTOS rola internamente (f:scrolled_view), cabe em telas 1080p sem cortar opcoes.
- fix: "Endireitar horizonte" nao tinha efeito na edicao direta (unico modo usado pelo menu real); funciona agora em ambos os destinos, usando a mesma restauracao exata antes/depois ja usada pelos demais controles.
- fix: detector de horizonte (horizon_analysis.py) nunca gerava proposta em fotos reais por um bug geometrico no criterio de espalhamento (exigia espalhamento vertical, quase impossivel para linhas quase niveladas); recalibrado e validado contra 102 fotos tecnicas reais preservadas.

### Improvements
- improve: texto do dialogo esclarece que o ajuste fino e somado a todas as fotos do lote (nao e a previsao individual, que o modelo ja calcula por foto automaticamente).
- perf: grade de busca do fator de regularizacao (alpha) ampliada de 3 para 7 valores nos dois pipelines de treino; melhoria liquida medida no dataset real sem overfitting (categoria melhor/pior-que-mediana identica por alvo).
- improve: diagnostico medido (nao suposto) do vies de regressao-a-media em Temperature nas fotos mais quentes/amareladas, documentado em notes/32 junto com a causa provavel (treino em evento unico) e o proximo passo real (dados variados).

## v0.19.0 (build 0031) - 2026-11-07

### Features
- feat: edicao automatica por pasta vigiada (opt-in): fotos novas importadas sao editadas com as opcoes salvas, sem mudar selecao ou modulo, com colecao de revisao e restauracao.

### Fixes
- fix: modelo escolhido (piloto/candidato) agora tambem fica salvo nas opcoes de edicao.

### Improvements
- refactor: nucleo de edicao compartilhado entre modo manual e automatico, sem mudanca de comportamento manual. 159 testes; pacote 0031 verificado com RAWs reais. Sem QA nativo.

## v0.18.0 (build 0030) - 2026-11-07

### Features
- feat: endireitar horizonte em novas copias, com corte centralizado sem cantos vazios e preservacao de cortes existentes.
- feat: mascaras de pessoa/ceu aplicando preset adaptativo do proprio Lightroom em novas copias, com validacao previa e registro.
- feat: P&B como variante separada na coleta, aprendizado (mixer de cinza), treino e analise; sem modelo P&B, somente essas fotos ficam sem alteracao.

### Fixes
- fix: preset complementar em edicao direta omite controles ausentes na foto, mantendo a restauracao exata; HasCrop bloqueado no preset.
- fix: detector de horizonte le imagens em caminhos com acentos.

### Improvements
- improve: Smart Previews e edicao automatica na importacao avaliadas e adiadas com justificativa (dominio do modelo e ausencia de evento de importacao no SDK). 153 testes; pacote 0030 verificado com RAWs reais. Sem QA nativo; sem codigo do Neurapix.

## v0.17.0 (build 0029) - 2026-11-07

### Features
- feat: intensidade da edicao (0-100%) e ajuste fino do estilo com 13 controles somados ao modelo, salvos entre sessoes.
- feat: preset complementar do Lightroom aplicado sem sobrescrever o modelo, geometria, mascaras, retoques ou versao de processo.
- feat: equilibrio opcional de balanco de branco entre fotos da mesma sequencia (ate 30 s), preservando exposicao por foto e valores originais no relatorio.

### Fixes
- fix: aprendizado do catalogo envia HSL/textura/claridade/desembacar/curva parametrica e detecta alteracoes nesses controles apos a aprovacao; filas antigas continuam compativeis.
- fix: arquivos nao-CR3 e P&B na selecao sao ignorados com aviso em vez de abortar a edicao.
- fix: falha de algumas fotos no motor permite continuar com as calculadas apos confirmacao.
- fix: motor encerrado sem resultados gera erro em segundos em vez de aguardar o tempo limite.
- fix: restauracao direta registra problemas em disco; mensagens de cancelamento/menu corrigidas.

### Improvements
- improve: 15 testes novos (145 no total); pacote 0029 verificado com dois RAWs reais no runtime isolado. Modelo numerico inalterado; sem QA nativo no Lightroom.

## v0.12.0 (build 0018) - 2026-11-04

### Features
- Analise, coleta manual e edicao aceitam a selecao completa sem os tetos de piloto de 100/25 fotos. Restauracao aceita sessoes maiores.

### Fixes
- Timeout do motor proporcional ao numero de fotos. Captura de ajustes cede a interface a cada dez fotos.
- Registro de edicao alinhado ao limite de leitura de 8 MiB. Limites de bytes continuam presentes por seguranca.

### Improvements
- Motor portatil inicia abaixo do normal no Windows, com duas threads OpenMP e uma BLAS/MKL para reduzir competicao com Lightroom.
- Evita solicitar troca de modulo quando o Lightroom ja esta no modulo necessario. Snapshots, verificacoes e hashes das fontes mantidos.
- Preservada correcao local preexistente de chaves JSON duplicadas.
- Versao de teste incrementada explicitamente, sem commits automaticos; nao foi executado o gerador baseado em commits pois exige arvore limpa.
- Nao representa novo treinamento, benchmark contra Neurapix ou validacao nativa de desempenho.

## v0.11.1 (build 0017) - 2026-10-30

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: confere selecao e ajustes apos espera pelo write gate (commit `3cbc1856969a1850693a1f7a7c9f2d9fee0b8f92`)

### ⚡ Improvements

- Nenhum.

## v0.11.0 (build 0016) - 2026-10-30

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: aplica edicao local em novas copias virtuais com restauracao (commit `af65f81533fea3dd8e36b398e029209005f00a78`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.10.0 (build 0015) - 2026-10-30

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: seleciona fotos localmente com variedade e revisao de qualidade (commit `444f55d0f9061cf399dd2d7cc29d4966e04f8faf`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.9.0 (build 0014) - 2026-10-30

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: analisa motor nativo e extrai base fixa do estilo aprovado (commit `569235b39ff82100ac518465cbef9c82d48dd7e4`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.8.0 (build 0013) - 2026-10-30

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: aprende com acervo local e aprofunda fronteiras do Neurapix (commit `4c9a6154b81ecb15d6f99fecf27df68dd9d8d35d`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.7.0 (build 0012) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: exporta referencias sem fotos e distingue exclusoes de P&B (commit `48c497ec46bed3739bd546d1f5b0b449ae5fd010`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.6.0 (build 0011) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: importa referencias aprovadas com validacao e deduplicacao (commit `4d4bc5c5a623d00e5e3bde081325978dcdee2d6b`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.5.0 (build 0010) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: coleta referencias aprovadas por trabalho no Lightroom (commit `b00ced70e7ef4e329594a86e9f56cbb77ea4d6d6`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.4.1 (build 0009) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: registra QA nativo e diferencas do modelo em outro trabalho (commit `f52a946045deb523bf4585a6ea8d2fa6fe63e741`)

## v0.4.0 (build 0008) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: integra motor local portatil para analisar RAWs selecionados (commit `d1497888ca6971f4af56c9f4fd5cb87720f5103d`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.3.1 (build 0007) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: registra QA nativo e mapeia modulos do Lightroom (commit `227186e4e2d544c95cc423ba7300eeabcdc9c3c7`)

## v0.3.0 (build 0006) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: valida RAWs treina piloto local e prepara comparacao no Lightroom (commit `58347a1e7a1bceb3856af8d62187f7a9de131ede`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.2.1 (build 0005) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: registra preflight do compartilhamento RAW e criterios de pareamento (commit `51e0e26880b209393f45275d62807cc47de8c402`)

## v0.2.0 (build 0004) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: preserva catalogo Lightroom e extrai referencias aprovadas de estilo (commit `199a5a609170e1d3b6989c222138b8f1f408a75c`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.1.2 (build 0003) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: confirma leitura do compartilhamento e amostra de catalogo Lightroom (commit `3d40b9ad4e9a2943b0f0772d2cd7eb0feb40be79`)

## v0.1.1 (build 0002) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: registra caminhos do Lightroom e acesso SMB pendente (commit `bd39c577645cbeb702f45971e19b3d73b73e1da7`)

## v0.1.0 (build 0001) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: prepara inventario local e pesquisa do Mizin Lightroom (commit `f04ebc8f0b293dd9d0de6bf373d5da85bb45b20f`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

Entradas geradas automaticamente dos commits do alvo antes de cada entrega.

