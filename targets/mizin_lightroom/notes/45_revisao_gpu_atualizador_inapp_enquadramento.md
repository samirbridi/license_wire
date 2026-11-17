# Revisao das mudancas nao commitadas (GPU + atualizador in-app) e diagnostico do enquadramento

2026-11-16, America/Sao_Paulo. Revisao da nota 44 e dos arquivos nao commitados sobre o build 0043 (v0.28.1). Nada foi alterado no codigo nesta revisao.

## 1. GPU: hoje e so interface

- `PluginInfoProvider.lua` grava `prefs.useGPU` e `prefs.batchSize`, mas nenhum outro arquivo le essas prefs; nada chega ao motor.
- `gpu_detector.py` nao e importado por `culling_engine.py` nem `local_engine.py` (a nota 44 diz que sim; nao e verdade no codigo).
- O texto "Deteccao automatica (GPU NVIDIA ativa)" e fixo, aparece mesmo sem NVIDIA.
- O runtime empacotado usa `opencv_python_headless 4.13.0.92`: `cv2.cuda.getCudaEnabledDeviceCount()` = 0, build sem CUDA. `DNN_BACKEND_CUDA` nao funcionaria mesmo se fosse ligado.
- Detector funciona nesta maquina: GTX 1660 Ti, 6 GB, driver CUDA 13.1.

### Onde o tempo realmente vai (medido, CR3 real `private/qa/local-engine-c25a3676/new-raw-original/CRI_0001.CR3`, runtime do 0043)
- Demosaico LibRaw half-size: 0.51 s. JPEG embutido (`extract_thumb`): 0.006 s (2,8 MB, resolucao cheia).
- Hough + LSD do horizonte em 1024 px: 0.86 s.
- ExifTool em sessao: ~0.2 s (nota 37).
- Nenhum paralelismo no motor (sem ThreadPool/ProcessPool); maquina tem 12 threads.
- Conclusao: o ganho grande vem de processar fotos em paralelo (CPU) e opcionalmente usar o JPEG embutido; GPU so compensa quando houver rede neural de verdade (estilo/corte/culling). Para isso, `onnxruntime-directml` (qualquer GPU DX12, sem DLLs CUDA de ~1 GB) e mais viavel que recompilar OpenCV com CUDA.

## 2. Atualizador in-app: duas falhas bloqueantes

1. **Aspas do cmd (regressao do bug do 0043).** `CheckUpdates.lua` monta `quote(python) .. ' -I ' .. quote(script) ...` sem as aspas externas. Reproduzido com `os.system` (mesmo cmd /c do `LrTasks.execute`): linha nova rc=1, nao executa; linha antiga com aspas externas rc=0, executa. O teste Lua passa porque `Tasks.execute` e simulado. Resultado no Lightroom: barra de progresso parada 300 s e "Tempo limite esgotado".
2. **Sobrescreve o runtime em uso.** `InApp-UpdatePlugin.py` roda com `Runtime/pythonw.exe` do proprio plugin e copia o pacote por cima da pasta do plugin. Teste numa copia do Runtime: `python.exe`, `python3.dll`, `python313.dll` -> PermissionError. A copia para no meio: plugin misturado (versao nova + velha), sem backup e sem rollback. O fluxo antigo (`Update-CrispixPlugin.ps1`, Lightroom fechado, backup) nao tem esse problema.

Outros pontos:
- Canal rede local: `downloadUrl` fica nil, updater recebe `''` e falha.
- `--sha256 ''` quando o manifesto nao tem hash: validacao e pulada em silencio.
- Arquivos removidos na versao nova continuam no plugin (copia por cima, sem limpeza).
- Timeout fixo de 300 s para pacote de ~84 MB+ em conexao lenta.
- `Restart-Lightroom.py` usa `taskkill` sem /F (ok), mas sem tratar a janela de backup do catalogo.

Caminho sugerido: manter a UI nova (janelas com identidade, progresso), mas baixar e validar em staging dentro do Lightroom, e trocar a pasta so com o Lightroom fechado pelo `Update-CrispixPlugin.ps1` (que ja tem backup); restaurar as aspas externas no `Tasks.execute`.

## 3. Enquadramento em poucas fotos: causa

Por desenho (nota 37): o detector geometrico propoe em ~2% das fotos (11 de 544), porque todas as variantes que propunham mais pioravam mais fotos do que melhoravam. Alem disso `withinCropTolerance(before)` pula foto que ja tem corte. O fotografo nivela 78% das fotos (425/544, tipicamente 0.3-1.5 grau). E so endireitamento; nao existe reenquadramento (corte de composicao).

Caminhos com potencial (ja previstos na nota 37):
1. Upright "Nivel" nativo do Lightroom (`PerspectiveUpright`) como modo "Endireitar" — analise da Adobe, cobre todas as fotos; exige QA nativo.
2. Aprender `CropAngle` e o retangulo de corte (CropLeft/Top/Right/Bottom) do fotografo como controles, com features de linha e posicao de rostos (YuNet ja roda) — base para "Auto Crop" e "Studio Crop" como no Neurapix. Dados: 3.601 fotos em 8 trabalhos no catalogo.

## 4. Lacunas frente ao Neurapix (telas em Downloads/PLUGIN LIGHTROOM)

- Opcoes de corte em 4 modos com preview: sem corte / so endireitar / auto crop + endireitar / studio crop.
- "Optimize consistency" (temos `sceneConsistency`, mas nao como opcao clara).
- Culling: metodo de marcacao (bandeira / rotulo de cor / estrelas), carregar de previews do Lightroom ou JPEG embutido do RAW, cache global/por catalogo com limite em GB.
- Configuracoes avancadas: pasta de dados, log, CUDA device, batch size, timeout.
- "Prepare photos for culling after editing" (pre-processamento em segundo plano).
- Assistente de criacao de estilo: Kickstart (20 RAW editados) x Regular (500 fotos), e "Ajustar estilo" selecionando ate 9 fotos.

## 5. Correcoes aplicadas (build 0044, 2026-11-16 a noite)

As duas falhas bloqueantes da secao 2 foram corrigidas:

1. **Aspas do cmd:** `wrapAsCmdLine()` em `CheckUpdates.lua` envolve a linha inteira num
   par extra de aspas antes de `Tasks.execute`. Reproduzido o bug e a correcao com
   `os.system` fora do Lightroom: sem o invólucro, rc=1 e nada roda; com ele, rc=0.
2. **Sobrescrita do runtime em uso:** o atualizador in-app foi dividido em duas etapas.
   `InApp-UpdatePlugin.py` agora SO baixa, confere SHA-256 e extrai para uma pasta de
   staging em `%TEMP%` — nunca escreve na pasta do plugin instalado. A troca de
   arquivos continua 100% a cargo do `Update-CrispixPlugin.ps1` ja comprovado (fecha o
   Lightroom, faz backup, extrai, reabre), agora com um parametro novo
   `-PrestagedArchive` que pula o download/consulta ao manifesto e usa o pacote ja
   validado. A janela "atualizacao concluida" foi movida para `LearningInit.lua`, pois
   so faz sentido depois que o Lightroom reabre com o plugin novo carregado de verdade.

GPU: a secao 1 continua valendo como diagnostico. `gpu_detector.py` ganhou
`opencv_cuda_actually_available()`, que consulta `cv2.dnn.getAvailableTargets()` em vez
de confiar em `setPreferableBackend()` (que nao lanca erro mesmo sem suporte real).
`PluginInfoProvider.lua` foi reescrito para mostrar a GPU detectada como informacao,
sem checkbox "usar GPU" nem campos de prefs que nao chegam a lugar nenhum — a UI para
de prometer algo que o motor ainda nao faz. A aceleracao de verdade (onnxruntime com
CUDA ou DirectML) continua como trabalho futuro, nao incluido neste build.

Publicado nos dois canais; recibo completo em `evidence/publication-0044.json`.
Pendente (igual ao 0043): validacao nativa dentro do Lightroom real da maquina de
edicao -- o codigo cobre o fluxo, mas `showModalProgressDialog` e o handoff completo
para `Update-CrispixPlugin.ps1` nunca rodaram dentro do aplicativo de verdade.
