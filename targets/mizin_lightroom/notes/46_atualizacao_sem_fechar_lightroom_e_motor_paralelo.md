# Atualizacao sem fechar o Lightroom (como o Neurapix) e motor paralelo

2026-11-17, America/Sao_Paulo. Substitui a parte "atualizador" das notas 44 e 45.

Entregue como **v0.30.0 (build 0045)** (commits `7b0a456` fix e `b98517d` feat; `evidence/release-build-0045.json`). Pacote `private/deliveries/CRISPIX-0.30.0-build0045-e4038373/CRISPIX-0.30.0-build0045-motor-local.zip`, 84.213.634 bytes, SHA-256 `985ad32bc9617b0702904d599285745725c4e1ff482dd554f974072e69136730`, 1.752 arquivos, mesmos insumos do 0040. `verify_editing_release.py --unit-tests-passed 250` ok (`evidence/editing-plugin-qa-0045.json`). Atualizacao real 0044 -> 0045 pelo fluxo novo: 11,1 s, plugin identico ao pacote, backup de 7 arquivos. Publicado em 2026-11-17 (internet R2+Pages e rede), conferido ao vivo: `evidence/publication-0045.json`.

## 1. Por que a atualizacao "nao fazia nada" (0043/0044)

Relato do usuario: aparece o aviso, nada acontece, o Lightroom nao fecha e nao ha aviso; ao fechar e abrir manualmente, parece atualizado.

O fluxo do 0044 baixava e conferia o pacote dentro do Lightroom, mas a troca de arquivos dependia de `Update-CrispixPlugin.ps1` fechar o Lightroom com `Process.CloseMainWindow()` e esperar ate 180 s. O sintoma bate exatamente com o Lightroom ignorando esse pedido: o instalador fica esperando; quando o usuario fecha, ele troca os arquivos e reabre. Nao foi possivel ler o `update.log` da maquina do Lightroom (acesso ao compartilhamento negado nesta sessao), entao a causa exata do `CloseMainWindow` nao foi confirmada nela.

Como o Neurapix faz (pasta `Downloads/PLUGIN LIGHTROOM`): os binarios pesados ficam FORA do plugin (`Preferences\npx`: `npx.exe`, `Neurapix Culling.exe`, `nets/`, `gpucheck.exe`, `update.exe`). O plugin e so Lua; o `postinstall.bat` apenas pede para reiniciar o Lightroom. Ele nunca fecha o Lightroom para instalar.

## 2. Novo fluxo (CRISPIX)

`CheckUpdates.lua`, uma unica barra de progresso nativa, Lightroom aberto o tempo todo:
1. `Launch-InAppUpdate.py` -> `InApp-UpdatePlugin.py`: baixa, confere SHA-256, extrai em `%TEMP%` (0-50%).
2. `Launch-CrispixUpdate.py --in-place --progress-file ...` -> PowerShell oculto -> `Update-CrispixPlugin.ps1 -InPlace -ProgressFile` (50-100%):
   - confere o SHA-256 de novo, extrai com `ZipFile` do .NET;
   - compara arquivo por arquivo (tamanho + data EXATAMENTE igual; qualquer diferenca -> SHA-256). Uma tolerancia de 2 s foi tentada e descartada: declarou iguais dois arquivos diferentes de mesmo tamanho gravados no mesmo instante (pego pela suite completa);
   - troca so os alterados, copia os novos, remove os obsoletos; originais vao para `<plugin>.bak-<guid>` (so os arquivos trocados);
   - `BuildInfo.json` por ultimo; qualquer falha desfaz tudo na ordem inversa e grava `stage=error`.
   - Nenhum arquivo do plugin esta em uso: o instalador e PowerShell, o Python do plugin ja terminou (copia com 20 tentativas de 0,5 s para a corrida de saida).
3. Janela de conclusao com a marca: "Reiniciar o Lightroom agora" / "Continuar trabalhando". Os comandos ja usam a versao nova (cada item de menu faz `dofile` a cada uso); menus novos e o painel do Gerenciador so mudam ao reiniciar.
4. Reiniciar: `Launch-CrispixUpdate.py --restart-lightroom` envia WM_CLOSE para a janela `AgWinMainFrame` (fallback `MainWindowHandle`), espera ate 10 min (backup do catalogo) e reabre o mesmo executavel. Nunca forca.

### Verificado
- Ponta a ponta com pacotes reais: plugin 0043 extraido do proprio ZIP numa pasta com espaco (`...\Cris Bridi\CRISPIX.lrplugin`), comando identico ao do Lua via `cmd /c` com o `pythonw.exe` do proprio plugin, instalando o ZIP real do 0044: resultado identico ao pacote 0044 (1.751 arquivos, 0 diferencas); 8 alterados + 4 novos, backup de 8 arquivos; 10,5 s no total. Evolucao medida: 78 s (Expand-Archive + Get-FileHash) -> 51 s (ZipFile .NET) -> 41 s (SHA-256 reaproveitado) -> 10,5 s (tamanho + data exata).
- Suite completa: 250 testes OK (`python -I -m pytest scripts`).
- Reversao real: DLL travada com `msvcrt.locking` -> nada muda no plugin, progresso `error`.
- Reinicio: `Lightroom.exe` falso (WinForms compilado) fechou por WM_CLOSE e foi reaberto (PID novo). Classe `AgWinMainFrame` do Lightroom real NAO testada aqui (sem Lightroom nesta maquina).

### Pendente / transicao
- A PRIMEIRA atualizacao a partir do 0044 ainda roda o codigo do 0044 instalado (que espera o Lightroom fechar). Para ir do 0044 para o proximo: clicar em atualizar e fechar o Lightroom manualmente dentro de 3 minutos, ou rodar `Atualizar-CRISPIX.cmd`. Dai em diante o fluxo novo vale.
- QA nativo: atualizar pelo Lightroom e testar "Reiniciar o Lightroom agora" na maquina de edicao.

## 3. Motor paralelo

- `culling_engine.py`: ExifTool em lote (1 processo por 250 fotos, antes 1 por foto, ~1,6 s cada); analise em `ThreadPoolExecutor` (`worker_count`: min(8, nucleos-2)); YuNet por thread; trava de leitura, hash antes/depois e checagem de estabilidade desde a leitura dos metadados mantidas.
- Opcao "Carregar previas a partir de" (Neurapix: "RAW files (Embedded thumbnails)"): `cullingOptions.previewSource` = `raw` (padrao) ou `embedded` (JPEG da camera via `extract_thumb`, orientado pelo `flip` do LibRaw; risco de exposicao continua lendo o sensor). Lembrada em `prefs.cullPreviewSource`.
- `local_engine.py` (`run_job`, analise/edicao): fotos em paralelo; ExifTool persistente serializado por trava; modelo P&B com trava; YuNet por thread; coleta de referencias continua sequencial (recusa de RAW duplicado depende da ordem). Nenhuma foto comeca a ler o RAW depois do pedido de cancelar (`CancelledBeforeStart`).

### Medido (120 RAWs reais do fotografo, runtime do 0044, 8 workers) — `evidence/culling-preview-benchmark-0045.json`
| modo | s/foto | 120 fotos |
|---|---|---|
| antes (ExifTool por foto, sequencial) | ~3,3 (estimado: 1,75 + ~1,6) | ~400 s |
| RAW sequencial com ExifTool em lote | 1,75 | 210 s |
| RAW paralelo | 0,53 | 64 s — decisoes identicas ao sequencial |
| JPEG embutido paralelo | 0,47 | 56 s — 98,3% das escolhidas iguais, rostos 99,2%, foco Spearman 0,77 |

Por isso o padrao continua `raw`. O JPEG embutido rende pouco aqui porque o resto do tempo e leitura do sensor (`raw_image_visible` descompacta o CR3) e as duas leituras de hash.

## 4. GPU: estado honesto e caminho

- Hoje nao ha carga neural pesada no motor: YuNet custa milissegundos por foto na CPU; decode LibRaw, Hough/LSD, ORB e hash nao rodam em GPU no runtime atual. O ganho real veio do paralelismo (CPU de 16 threads da maquina de edicao: i7-11800H).
- O OpenCV empacotado nao tem CUDA. Recompilar OpenCV+CUDA custaria ~1 GB de DLLs.
- Curiosidade medida: o proprio Neurapix, na maquina de edicao (RTX 3060 Laptop 6 GB, driver 572.16), grava `gpuCheck.json` com `"compatible_gpus": []` — ele tambem nao esta usando a GPU la.
- Caminho recomendado: `onnxruntime-directml` (qualquer GPU DirectX 12, sem DLLs CUDA, ~20 MB) com provedor `DmlExecutionProvider` e queda automatica para CPU, entrando JUNTO com o primeiro modelo neural que justifique: (a) recorte/enquadramento inteligente (Neurapix usa `nets/smartcrop/seg/yolact_resnet50.onnx`), (b) olhos fechados/piscada no culling, (c) estetica/expressao. Sem um desses, a GPU nao muda o tempo.

## 5. Proximos passos sugeridos
1. Publicar um build com este atualizador e fazer a transicao manual uma vez (secao 2).
2. Enquadramento em todas as fotos (nota 45): aprender CropAngle/corte do fotografo ou Upright "Nivel" nativo.
3. GPU com ONNX Runtime DirectML junto com o primeiro modelo neural (secao 4).
4. Opcoes do Neurapix ainda faltando: metodo de marcacao (bandeira/rotulo/estrelas), cache com limite em GB, assistente Kickstart/Regular.
