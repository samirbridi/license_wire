# v0.24.0 build 0037 — enquadramento: convencao real do corte do Lightroom, detector medido e ExifTool persistente

Pedido do usuario: analisar o plugin (ajustes, melhorias, otimizacao) e descobrir por que o enquadramento (endireitar horizonte) continua sem funcionar ("tentei algumas vezes e nada"). Esta nota responde as pendencias de horizonte das notas 30, 32 e 33 (sinal do CropAngle e validacao do corte).

## Metodo: gabarito real em vez de suposicao

`private/raw-datasets/20261029T172842Z-c6cf2182/paired-features.jsonl` tem 546 fotos aprovadas com os ajustes do Lightroom (CropAngle/CropTop/CropLeft/CropBottom/CropRight) e o render tecnico que o motor analisa. O fotografo endireitou 425 delas (|CropAngle| >= 0.3 grau; tipicamente 0.3–1.5, maximo 4.03). Isso permitiu medir as duas pendencias abertas desde o build 0030 sem Lightroom nesta maquina. Reproduzivel com `scripts/evaluate_horizon_ground_truth.py <dataset>`; recibo `evidence/horizon-ground-truth-0037.json`.

## Causas encontradas

1. **Corte numa convencao errada (bug principal de aplicacao).** O codigo gravava margens iguais `m` nos 4 lados, supondo um retangulo no referencial orientado. Nos 127 endireitamentos centrados que o proprio Lightroom gravou no catalogo, as margens NAO sao iguais (ex.: -3.14 graus em 3:2 -> Top 0.0760, Left 0.0211). Modelo que explica 111/127 a 0.002 (os 16 restantes foram apertados a mao): CropTop/CropLeft e CropBottom/CropRight sao os cantos superior-esquerdo e inferior-direito do retangulo de corte GIRADO, normalizados no referencial do SENSOR (nao orientado). Fotos verticais de camera horizontal usam os eixos do sensor (exemplo real: -1.98 grau, render 684x1024 -> Top 0.0493, Left 0.0137). O corte de margens iguais descrevia outro retangulo (proporcao errada, cantos fora da imagem): o Lightroom podia ajusta-lo e fazer a verificacao falhar, ou mostrar enquadramento estranho.
   - Formula (PhotoEditor `M.cropFor`, com reducao de seguranca de 0.1%): `s = min(W/(W cos|a| + H sin|a|), H/(W sin|a| + H cos|a|))`, `Left = .5 - s/2 (cos a - H/W sin a)`, `Top = .5 - s/2 (cos a + W/H sin a)`, `Right = 1-Left`, `Bottom = 1-Top`, com W,H do sensor.
   - Motor envia `sensorSwapped` (compara `rawSize` do LibRaw com o render orientado). Sem o campo (motor antigo), o Lua assume sensor horizontal (todo CR3 suportado).
2. **Sinal do angulo**: positivo = retangulo girado no sentido horario (y para baixo), mesmo sentido de `imageSlopeDegrees`. Confirmado: detector e fotografo concordam em sinal em 8 de 9 fotos. `HORIZON_SIGN=1` mantido, agora com evidencia.
3. **Detector quase nunca propoe (causa do "nada" na maioria das fotos).** Em 544 fotos com CropAngle, o detector antigo propunha em 11: 6 mais perto do fotografo, 4 mais longe (inclusive +6.47 graus numa foto que ele nivelou em +0.45). Fotos de evento quase nao tem horizonte real.
4. **Pasta vigiada** forcava `horizon=false` (comentario obsoleto desde o build 0032).

## O que foi testado e descartado no detector (medido)

Todos contra o mesmo gabarito; "melhor/pior" = erro reduzido >0.1 grau / aumentado >0.2 grau.
- Hough/LSD com linhas horizontais e verticais, varias calibracoes: propoem em 80–220 fotos, mas pioram mais do que melhoram (ex.: LSD H+V 53 melhores x 122 piores).
- Concordancia obrigatoria H+V (LSD): 4–5 propostas, zero piores, cobertura <1%.
- Regressao ridge aprendida com o fotografo (histogramas de angulo H/V, 5 blocos por ordem de captura): MAE 0.78 contra 0.88 sem fazer nada, correlacao 0.42. Melhora real, mas fraca e de um unico evento. Nao enviado.

## Implementado

- `horizon_analysis.py`: `family_peak` (pico ponderado de desvio de linhas LSD, verticais ponderadas pela proximidade do centro por causa do keystone) e `combine`: aceita se H e V concordam (<=0.5 grau), ou se a proposta Hough antiga nao e contradita pelas verticais (>1 grau veta); >5 graus vira `LIKELY_INTENTIONAL_TILT`. Resultado final: 11 propostas, 8 mais perto, 2 mais longe (ambas ~0.3 grau em fotos ja quase niveladas). Cobertura ~2% por desenho.
- `PhotoEditor.lua`: `M.cropFor` + uso de `sensorSwapped`; `preserved()` ignora o grupo `Crop*` quando o plano endireita; motivo novo na mensagem; `autoChoice()` respeita `horizon` salvo (mascaras continuam so em novas copias).
- `local_engine.py`: `sensor_swapped()`, `horizon_for(image, swapped)`.
- **Otimizacao** `ExifToolSession` (`-stay_open True -@ -`, um por trabalho, watchdog de 90 s, fechado no `finally`). Medido com o exiftool.exe do pacote: 1.78 s -> 0.20 s por foto, saida identica (inclusive caminho acentuado), mesmo erro "File not found"; qualquer falha da sessao repete a chamada antiga so daquela foto. Vale para analise/edicao, coleta e aprendizado (todos passam por `run_job`). O Hough herdado custa ~0.46 s/foto e o LSD novo ~0.09 s/foto, apenas quando "Endireitar horizonte" esta marcado.
- `Update-CrispixPlugin.ps1`: espera ate 180 s o Lightroom fechar; em `-NonInteractive` aborta em vez de forcar; interativo pergunta com aviso de risco ao catalogo. Antes: 15 s e `Stop-Process -Force` (sem perguntar no modo nao interativo).
- `CheckUpdates.lua`: manifesto precisa ser objeto JSON.

## Verificacao

- Python: 110 testes OK nesta maquina (novos: corte/veto/concordancia/inclinacao intencional em `test_horizon_analysis.py`; `sensor_swapped`, `horizon_for` com o flag e paridade real da sessao ExifTool em `test_local_engine.py`). Sintaxe do `.ps1` validada pelo parser do PowerShell.
- Suite completa apos instalar `lupa 2.8` e `rawpy 0.28.0` (pip, com autorizacao do usuario): **190 testes OK, 0 pulados**, incluindo as 7 suites Lua e os testes novos `test_horizon_crop_matches_lightroom_own_straighten_values` e `test_automatic_edit_honors_saved_horizon_but_never_masks`.
- Nenhum pacote gerado, nada publicado (rede local/R2/site intocados), sem commits. VERSION atualizado manualmente.

## Pendente / proximo passo real

- QA nativo: endireitar uma foto claramente inclinada em NOVA COPIA e conferir nivelamento e ausencia de cantos vazios (primeira vez que o corte esta na convencao certa).
- Cobertura do endireitamento: o fotografo nivela 78% das fotos; o detector geometrico so alcanca ~2% sem piorar. Dois caminhos com potencial real:
  1. Aprender o angulo do fotografo como mais um controle (CropAngle ja vem no aprendizado do catalogo; faltam features de linha no render tecnico e dados de varios eventos — o catalogo tem 3.601 fotos em 8 trabalhos).
  2. Upright "Nivel" nativo do Lightroom (`PerspectiveUpright`), cuja analise e da Adobe. Exige QA nativo: confirmar que o SDK dispara a analise e que a restauracao em edicao direta volta exatamente ao `before` (o Lightroom grava chaves `Upright*` derivadas).
