# Nivelamento pelo nivel eletronico da camera (RollAngle) + correcao do "defaultFactory"

2026-11-17, America/Sao_Paulo. Pedido do usuario: corrigir o erro da atualizacao no Lightroom e "fazer a melhora no enquadramento das fotos" (o nivelamento so atingia ~5-10 fotos; ele quer em todas, como o Neurapix), testar, compilar e publicar (build 0047).

## 1. Erro "attempt to call method 'defaultFactory' (a nil value)" (commit f856c8a)
- `CheckUpdates.lua:81` e `LearningInit.lua:37` chamavam `View:defaultFactory()`, que nao existe no SDK. Correto: `LrView.osFactory()` (funcao do modulo, com ponto).
- Os testes passavam porque os mocks inventavam a mesma funcao. Mocks corrigidos e criado `scripts/test_lrview_api_lua.py`: le todos os `.lua` e falha se alguma chamada a `LrView` usar `:` ou um nome fora do SDK (`osFactory`, `bind`, `share`, `booleanToNumber`, `negativeOfKey`, `addBinding`).
- Quem esta em 0044-0046 NAO consegue atualizar pelo menu (o menu executa o `CheckUpdates.lua` quebrado ja instalado). Uma vez so: fechar o Lightroom e rodar `Atualizar-CRISPIX.cmd` na pasta do plugin. Do 0047 em diante o menu volta a funcionar.

## 2. Por que o nivelamento cobria tao poucas fotos
- O detector de linhas (`horizon_analysis.analyze_image`, notas 37/40) so encontra eixos confiaveis em ~1 de cada 4 fotos; com as travas de seguranca, no conjunto de teste (holdout, 186 fotos) ele propunha **0**. No desenvolvimento propunha 26: 12 mais perto do fotografo, 12 mais longe.
- Fotos de evento (pessoas, fundo desfocado) simplesmente nao tem linhas retas suficientes.

## 3. O sinal que faltava: o nivel eletronico da Canon
- A EOS R6 Mark II grava `MakerNotes:RollAngle` (passo de 0,1 grau) em todo CR3: 546 de 546 no dataset.
- Inclinacao residual: `roll - round(roll/90)*90` (fotos verticais ficam perto de +-90). Sinal no CropAngle: `-residual` (CRI_0005: roll -0,6, fotografo +0,64).
- `scripts/evaluate_camera_roll.py` -> `evidence/camera-roll-ground-truth.json`: correlacao com o CropAngle do fotografo 0,61 (horizontais 0,65; verticais 0,32). Aplicado inteiro, o angulo da camera NAO ganha de "nao fazer nada" no holdout (erro medio 1,015 vs 0,996): o sensor tem precisao de ~+-1 grau, do mesmo tamanho das correcoes do fotografo.
- Regressao pela origem: inclinacao 0,39 (desenvolvimento) / 0,48 (holdout). Metade do angulo foi a melhor no desenvolvimento (grade 0,3-0,7).

## 4. Politica adotada (`horizon_analysis.apply_camera_level`)
1. Sem leitura valida da camera, ou analise falhou: decisao do detector inalterada.
2. |inclinacao da camera| > 5 graus: `LIKELY_INTENTIONAL_TILT` (nao mexe).
3. Algum eixo da cena (horizontal, vertical ou vertical de perspectiva) concorda com a camera dentro de 0,75 grau: usa o eixo (mais preciso) -> evidencia `SCENE_CONFIRMED_BY_CAMERA_LEVEL`.
4. Senao: metade do angulo da camera -> `CAMERA_LEVEL`.
5. |angulo| < 0,25: `ALREADY_LEVEL`. O Lua continua aplicando so 0,25-8 graus, arredondado a 0,01.
- Escolhida so no desenvolvimento (primeiras 360 linhas); confirmada no holdout. `scripts/evaluate_camera_level_fusion.py` -> `evidence/camera-level-fusion.json`:

| conjunto | politica | propostas | mais perto | mais longe | erro medio (nada) | erro medio | dentro de 0,5 grau |
|---|---|---|---|---|---|---|---|
| desenvolvimento (358) | detector atual | 26 | 12 | 12 | 0,824 | 0,835 | 141 |
| desenvolvimento (358) | camera + cena | 268 | 185 | 62 | 0,824 | **0,598** | 186 |
| holdout (186) | detector atual | 0 | 0 | 0 | 0,996 | 0,996 | 58 |
| holdout (186) | camera + cena | 148 | 101 | 37 | 0,996 | **0,710** | 85 |

- Resultado nas 544: 378 pela camera, 38 eixo da cena confirmado pela camera, 125 ja nivelada, 3 inclinacao intencional.
- Honestidade: cerca de 1 em cada 4 correcoes fica mais longe do angulo do fotografo (o sensor erra ~+-1 grau). Por faixa de inclinacao da camera (mais perto/mais longe): <1 grau 100/44; 1-2 graus 121/30; 2-5 graus 65/25. Ganho claro na media; nao e perfeito foto a foto.
- Amostra real de 8 RAWs pelo caminho do motor (metadata_for + horizon_for): identica ao replay em todas.

## 5. Leitura do RollAngle no motor
- `-fast2` (usado antes) pula as MakerNotes -> sem RollAngle. Trocado por `-fast`.
- Com `-fast` sem grupo, o ExifTool passou a preferir o FocalLength das MakerNotes em 12 de 546 RAWs (entrada do modelo de estilo!). Todas as tags agora sao fixadas no grupo EXIF (`-EXIF:ISO`, `-EXIF:FocalLength#` ...): 546 de 546 identicas a leitura antiga, com RollAngle em todas. Custo medido: 34 s -> 65 s para 546 fotos num ExifTool (~0,06 s por foto).
- `local_engine.horizon_for(image, swapped, detector, camera_roll)`; o `analyze()` passa `meta.get('RollAngle')`. O `culling_engine.py` e o `prepare_raw_dataset.py` continuam com `-fast2` (nao usam o nivel).
- Testes: `test_horizon_analysis.CameraLevelTests` (6), `test_local_engine` (render real + RollAngle, opcoes de metadados).

## 6. Pendente / limites
- Outras cameras: so a R6 Mark II foi medida. Corpos sem RollAngle seguem exatamente o detector antigo.
- Nao testado dentro do Lightroom real (o Lua nao mudou: a proposta continua `PROPOSAL_ONLY` + `imageSlopeDegrees`).
- Uma rede de IA de enquadramento (recorte/estetica) poderia aproveitar a GPU (nota 47); o nivel da camera resolve a cobertura agora sem modelo novo.
