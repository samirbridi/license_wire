# Aceleracao por IA (ONNX Runtime: NVIDIA CUDA / DirectML / CPU) e previa embutida como padrao

2026-11-17, America/Sao_Paulo. Complementa a nota 46 (secao 4 "GPU" passa de plano a implementacao). Pedido do usuario: usar IA com CUDA (vai usar RTX 4090) e tambem ONNX Runtime com DirectML; o plugin detecta a compatibilidade e escolhe a melhor. Previa do RAW como padrao na selecao (como o Adobe Bridge), com opcao de desligar. Ainda nao empacotado nem publicado.

## 1. Previa embutida como padrao (selecao)
- `CullingReview.lua`: padrao `embedded` ("Previa JPEG embutida no RAW (recomendado; mais leve, como o Adobe Bridge)"); opcao "Revelacao tecnica completa do RAW (mais pesado)". Lembrada em `prefs.cullPreviewSource`. Motor: padrao `embedded` quando o pedido nao traz a opcao.
- So afeta a selecao. A edicao analisa a revelacao tecnica do RAW (dominio em que o estilo foi treinado) e a exportacao do Lightroom sempre parte do RAW.

## 2. Arquitetura da aceleracao
- `onnxruntime-gpu` e `onnxruntime-directml` instalam o mesmo modulo `onnxruntime`: cada um vive num pacote proprio, ativado so quando escolhido (`accelerator.activate`).
- `scripts/build_accel_packs.py --wheels private/runtime/wheels --out private/runtime/accel` (rodas oficiais do PyPI, cp313 win_amd64):
  - `directml`: onnxruntime-directml 1.24.4 (ultima; DirectML em manutencao na Microsoft) + flatbuffers/packaging/protobuf, 69 MB. Vai DENTRO do plugin em `Runtime/accel/directml` (`build_lightroom_local.py`). Inclui o provedor CPU.
  - `cuda`: onnxruntime-gpu 1.32.0 + CUDA 13.5 runtime, cuBLAS, cuFFT, cuRAND, NVRTC, nvJitLink, cuDNN 9.28; 1.883 MB descompactado, ZIP 1,33 GB em 6 partes de 250 MB (o `wrangler r2 object put` recusa objetos > 300 MiB). Componente OPCIONAL instalado em `%AppData%\MizinLightroomLocal\accel\cuda`. Exige driver NVIDIA com CUDA >= 13 (R580+). Manifesto `accel-cuda.json` com SHA-256 de cada parte e do total.
  - numpy NAO entra nos pacotes (usa o numpy fixado do runtime).
- `reconstructed/local-engine/accelerator.py`:
  - ordem automatica: CUDA > DirectML > CPU; preferencia manual coloca a escolhida primeiro e mantem as outras como reserva;
  - cada candidato instalado e TESTADO num processo proprio com o modelo real YuNet (sessao + 20 inferencias), conferindo o provedor que o ONNX Runtime realmente usou (ele cai em CPU em silencio quando um provedor GPU falha);
  - status: `READY`, `FAILED`, `NOT_INSTALLED`, `NO_NVIDIA_GPU`, `DRIVER_TOO_OLD` (mensagem pedindo driver R580+), `MISSING_FROM_PLUGIN`;
  - cache em `%AppData%\MizinLightroomLocal\accelerator.json`, refeito quando muda GPU, driver, pacotes ou preferencia;
  - `session_for(model, plugin)` para o codigo do motor: sessao no melhor provedor pronto, com reserva.
- `scripts/Install-AccelPack.py`: `--detach`; baixa as partes conferindo SHA-256, confere o total, extrai em staging, valida `accel-pack.json`, troca com um rename, testa de novo e informa o escolhido. Falha nao altera o estado anterior.
- Lightroom:
  - `Acceleration.lua` (status, descricao, novo teste, instalacao com barra nativa);
  - `PluginInfoProvider.lua`: secao "Aceleracao por IA (GPU)": aceleracao em uso, GPU NVIDIA/driver, cada provedor com o tempo medido, preferencia (Automatico/NVIDIA CUDA/DirectML/Somente CPU), "Testar novamente", "Instalar aceleracao NVIDIA (CUDA, ~1,3 GB)...";
  - `LearningInit.lua`: ao abrir o Lightroom, atualiza a escolha em segundo plano (so testa de novo se algo mudou).

## 3. Verificado nesta maquina (GTX 1660 Ti 6 GB, driver 591.74 = CUDA 13.1)
| provedor | YuNet 640x640, mediana | criacao da sessao |
|---|---|---|
| NVIDIA CUDA | 4,6 ms | 1,4 s |
| DirectML | 3,0-3,1 ms | 3,3 s |
| CPU | 9,1-9,4 ms | 0,3 s |
- O YuNet e minusculo: o custo fixo pesa e o DirectML empata/ganha. Em redes pesadas (recorte inteligente, estetica, estilo) o CUDA+cuDNN costuma ganhar em NVIDIA, por isso a ordem automatica mantem CUDA primeiro. Quando o primeiro modelo pesado entrar, medir de novo e, se for o caso, escolher pelo tempo medido no modelo real.
- Componente CUDA real: 6 partes servidas por rede simulada -> instalado em 40 s -> escolha automatica "NVIDIA CUDA", com os tres provedores READY.
- Testes: `test_accelerator.py` (8, inclui sondas reais DirectML/CPU com o Python empacotado), `test_install_accel_pack.py` (4), `test_acceleration_lua.py` (5); suite completa 267 OK.

## 4. Pendente
- Nenhum modelo do motor usa o ONNX Runtime ainda: a infraestrutura escolhe e prova a GPU, mas o ganho real vem com o primeiro modelo de IA pesado (recorte/enquadramento inteligente, olhos fechados, estetica). `session_for` ja e o ponto de entrada.
- Publicar: subir as 6 partes em `r2://crispix-updates/accel/` e publicar `accel-cuda.json` no Pages (`https://crispixlr.pages.dev/accel-cuda.json`, URL fixa em `Acceleration.lua`). Antes disso o botao de instalar mostra erro de download e nada muda.
- Maquina de edicao atual (RTX 3060, driver 572.16 = CUDA 12.8): CUDA aparece como "driver NVIDIA antigo" e o CRISPIX usa DirectML ate o driver ser atualizado. RTX 4090 com driver atual: CUDA.
- Nao testado no Lightroom real (painel, botoes, barra de progresso).
