# v0.19.1 build 0032 — janela compacta, horizonte em edicao direta, grade de alpha e diagnostico do amarelado

Pedido do usuario: janela de EDITAR FOTOS maior que a tela 1080p de teste; confusao sobre o bloco de ajuste fino parecer por-foto quando e por-lote; correcao de angulo/horizonte sem efeito; fotos muito amareladas continuam amareladas apos a edicao.

## Implementado

**Janela compacta.** `PhotoEditor.lua` `options()`: o corpo do dialogo (tudo abaixo do cabecalho com o logo) agora fica dentro de `f:scrolled_view{width=520,height=480,horizontal_scroller=false,...}`; antes era uma unica coluna sem limite de altura. Nenhum campo foi removido.

**Esclarecimento do ajuste fino.** Texto novo no grupo AJUSTE FINO DO ESTILO deixa explicito que esses campos somam o MESMO deslocamento a TODAS as fotos da edicao atual (cada foto ja recebe sua propria previsao automatica, sem precisar abrir a janela) e que ficam salvos ate serem mudados ou zerados. Nenhuma mudanca de logica: `M.adjust()` ja fazia exatamente isso; o problema era so a UI nao deixar claro o escopo.

**Horizonte: duas causas, ambas corrigidas.**
1. `scripts/horizon_analysis.py`: os limiares (comprimento minimo 18% da largura, razao de peso do consenso >=0.80, espalhamento VERTICAL >=30% da altura) nunca produziam proposta em nenhuma das 102 imagens tecnicas reais preservadas de jobs anteriores (`private/incoming`, `private/qa`, deduplicadas por SHA256 do conteudo): 100% `KEEP_EXISTING`. Causa raiz dupla:
   - Bug geometrico: para uma linha quase nivelada (angulo<=8 graus) cobrindo toda a largura da imagem, o espalhamento vertical maximo possivel e `(largura/altura)*tan(angulo)`, que fica abaixo de ~9% da altura mesmo no limite de 8 graus numa imagem retrato 684x1024. Um minimo de 30% era portanto quase impossivel de atingir por construcao, independente de haver consenso real entre os segmentos. Trocado para medir cobertura HORIZONTAL (eixo que uma linha quase nivelada realmente percorre).
   - Calibracao excessivamente severa: comprimento minimo 18%->10% da largura, razao de consenso 0.80->0.55 (mantendo margem de seguranca acima do empate exato 0.50 que o teste sintetico de perspectivas conflitantes exercita).
   - Verificado: os 6 testes sinteticos de seguranca continuam passando (incluindo o teste de decoracao local, cuja fixture foi corrigida para ser realmente estreita em X — a original cobria 60% da largura, o que nao testava decoracao local nenhuma). Novo teste de regressao (`test_real_preserved_renders_never_raise_and_stay_conservative`) roda `analyze_image` contra as 102 fotos reais e exige que o detector continue conservador (propostas em menos de 50% das fotos) mas nunca mais trave em zero. Resultado real: 2/102 propostas (~2%), angulos +0.30 e +7.45 graus — inspecionadas visualmente (ambas fotos com horizonte real visivel na cena).
2. `PhotoEditor.lua` `process()`: `useHorizon=choice.horizon==true and not inPlace` desligava a geometria sempre que o destino era "selecao atual" — que e o UNICO modo usado pela entrada de menu real `EditInPlace.lua` (`edit(true)`). Ou seja, a opcao de horizonte do dialogo nunca podia ter efeito no uso normal do plugin; so funcionaria pelo caminho de novas copias, que nenhum item de menu chama. Corrigido para `useHorizon=choice.horizon==true` em ambos os modos: o corte de horizonte usa a mesma restauracao exata antes/depois que todo outro controle de edicao direta ja usa (nao depende de snapshot). Mascaras adaptativas continuam exigindo nova copia (dependem de `applyDevelopPreset`, que so e seguro aplicar numa copia nova). Teste `test_full_entry_straightens_new_copies_but_never_direct_edits` renomeado para `test_full_entry_straightens_both_new_copies_and_direct_edits` e reescrito para cobrir os dois destinos.

**Grade de busca de alpha ampliada.** `train_numeric_pilot.py` e `learning_store.py` (dois loops de selecao de regularizacao ridge, um por pipeline) usavam `(1.0,10.0,100.0)`. Varredura mais fina no dataset real (524 referencias em cor, mesmo split temporal ja estabelecido, alpha escolhido so por validacao interna) mostrou que Temperature melhora continuamente ate alpha=30 e so entao piora; a grade grosseira podia errar o otimo por ate 3x. Ampliada para `(.3,1.0,3.0,10.0,30.0,100.0,300.0)`. Comparacao honesta antigo-vs-novo nos 10 alvos basicos: Temperature, Highlights2012, Whites2012, Blacks2012 e Saturation melhoraram (MAE no holdout); Tint, Exposure2012, Shadows2012 e Vibrance pioraram minimamente; Contrast2012 inalterado. Categoria melhor-que-mediana/pior-que-mediana identica entre os dois modelos para todos os 10 alvos — a grade mais fina nao introduziu overfitting no pequeno split de validacao. Nenhum teste fazia assert sobre o valor de alpha; 160 testes continuam passando.

## Diagnostico do amarelado persistente (medido, nao suposto)

Usando `private/raw-datasets/20261029T172842Z-c6cf2182/pilot-models/20261029T174242827221Z/holdout-predictions.jsonl` (92 fotos reais de teste, nunca usadas para escolher hiperparametros):

- Fotos nos 25% mais quentes do teste (Temperature aprovada <=4930K): vies medio de previsao = **+301 K** (o modelo deixa a foto mais fria/azulada do que o fotografo aprovou, ou seja, sub-corrige o amarelado).
- Fotos nos 25% mais frias (Temperature aprovada >=5706K): vies medio = **-568 K** (super-corrige na direcao oposta).
- Esse e o padrao classico de regressao-a-media de uma regressao ridge/linear com poucos dados: puxa previsoes extremas em direcao ao centro da distribuicao de treino.
- Testado e refutado como causa corrigivel por hiperparametro: recalculando com o alpha otimo (30, achado so por validacao) o vies em fotos quentes muda de +301K para +295K — praticamente igual. Portanto a causa NAO e regularizacao excessiva.
- Causa provavel real: o modelo foi treinado num UNICO evento/trabalho (3.513 fotos de uma formatura, Canon EOS R6m2). A distribuicao de Temperature aprovada nesse evento tem mediana 4700K e so 52/524 fotos (10%) com Temperature<=4000K — pouca variedade de cenas muito amareladas para o modelo aprender a correcao completa nesses casos, nao zero exemplos, mas poucos o bastante para a regressao-a-media dominar.
- Isso nao e corrigivel por codigo nesta etapa: precisa de referencias novas e variadas, incluindo deliberadamente fotos de ambientes muito amarelados, de eventos diferentes — exatamente o que o usuario ja concordou em preparar ("vou fazer algumas fotos e lhe mando entao, com ajustes do Neurapix por exemplo e minhas, usando tudo").

## Verificacao

- 160 testes OK (1 teste de horizonte renomeado/reescrito, 1 teste novo de regressao contra fotos reais, 1 teste de horizonte em PhotoEditor reescrito para cobrir os dois destinos).
- Modelo retreinado: `pilot-models/20261111T214051736452Z/model.json`, SHA-256 `83ecd6e0c9ab84c4f93945e5f831e43d4375bdfdf49c3df93af1be4ebb93dff2`.
- Pacote `private/deliveries/CRISPIX-0.19.1-build0032-34df6ad8/`, ZIP `CRISPIX-0.19.1-build0032-motor-local.zip` 84.026.737 bytes, SHA-256 `c7d622cfc25276a704b8a87cd7daf41182d1408daa93545146bef7cc84c4a3ad`, 1.741 arquivos, 30 fontes Lua.
- `verify_editing_release.py --unit-tests-passed 160` OK: 1.741 hashes de manifesto conferidos, CRC do ZIP OK, 30 fontes Lua compiladas e identicas ao `reconstructed/`, 2 RAWs reais processados pelo motor real com handoff para o duplo SDK (criacao/edicao/restauracao de copia, hashes de origem intactos antes/depois), `numericPilotUnchanged` apontado deliberadamente para o novo hash (documentado no proprio script, com o motivo, para nao mascarar uma mudanca futura acidental). Recibo `evidence/editing-plugin-qa-0032.json`.
- Um segundo diretorio de build, `private/deliveries/CRISPIX-0.19.1-build0032-fcc29da4/`, foi gerado antes da secao do LEIA-ME ser escrita; preservado sem remocao (compromisso do projeto de nunca apagar copias), mas NAO e o pacote de referencia — o pacote correto e `-34df6ad8`.

## Pendente / limites

- O vies de regressao-a-media em Temperature (fotos muito quentes/frias) PERMANECE sem solucao nesta entrega; e um problema de dados (um unico evento de treino), nao de codigo. Proximo passo real: treinar/avaliar com as novas referencias variadas que o usuario esta preparando.
- Nenhuma das duas correcoes de horizonte foi testada no Lightroom real; `HORIZON_SIGN=1` continua pendente de confirmacao com uma foto real inclinada (nota 30).
- Nada copiado para Downloads/compartilhamento; sem commits; VERSION manual.
