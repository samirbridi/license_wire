# Atualizador In-App no Lightroom e Aceleracao por GPU

2026-11-16, America/Sao_Paulo. Apos analise das capturas e dos binarios do Neurapix fornecidos pelo usuario em `Downloads/PLUGIN LIGHTROOM`, reformulamos a experiencia de atualizacao do CRISPIX e adicionamos deteccao/aceleracao de hardware via GPU dedicada (NVIDIA RTX / CUDA).

## 1. Analise da Arquitetura do Neurapix

- **Atualizador:**
  - O Neurapix nao encerra o Lightroom repentinamente antes do download.
  - Exibe primeiro um dialogo modal com o cabecalho grafico da marca e os dados da nova versao.
  - O download e a extracao ocorrem enquanto o Lightroom permanece aberto, exibindo a barra de progresso nativa do SDK (`showModalProgressDialog`).
  - Ao finalizar a extracao direta sobre a pasta `.lrplugin`, fecha a barra de progresso e abre uma janela modal amigavel com o logotipo: "Atualizacao concluida com sucesso! Por favor, reinicie o Lightroom."
- **Aceleracao por GPU:**
  - O Neurapix empacota DLLs CUDA 12 (`cudart64_12.dll`, `cublas64_12.dll`, `cudnn64_9.dll`).
  - No Gerenciador de Plugins expoe: `[x] Use GPU if available`, dispositivo CUDA e tamanho de lote (batch size: 32).
  - Utiliza deteccao via driver NVIDIA para acelerar inferencia e selecao (culling).

## 2. Implementacao no CRISPIX

### A. Atualizador In-App com Identidade Visual (`CheckUpdates.lua` + `InApp-UpdatePlugin.py`)
1. **Janela 1 (Oferta com Identidade Visual):**
   - Modal com o cabecalho oficial `Branding/crispix-header.png` (paleta CX Ribbon Core: Azul Profundo, Azul Eletrico, Ciano Luminoso).
   - Exibe versao instalada, nova versao e canal, garantindo que presets e dados em `%AppData%` permanecem intocados.
   - Botoes: `[ Atualizar agora ]` e `[ Mais tarde ]`.
2. **Janela 2 (Progresso Nativo do Lightroom):**
   - Dispara worker desacoplado (`Launch-InAppUpdate.py` -> `InApp-UpdatePlugin.py`).
   - Apresenta `Dialogs.showModalProgressDialog` com monitoramento em tempo real de `crispix_update_progress.json`.
   - Exibe porcentagem real de download (bytes), validacao de hash SHA-256 e extracao dos arquivos.
3. **Janela 3 (Conclusao com Identidade Visual):**
   - Janela de sucesso com o logotipo da marca.
   - Botoes: `[ Reiniciar Lightroom Agora ]` (executa reinicio limpo via `Restart-Lightroom.py`) ou `[ Reiniciar Mais Tarde ]` (o fotografo continua trabalhando normalmente).

### B. Deteccao e Aceleracao por GPU (`gpu_detector.py` + `PluginInfoProvider.lua`)
1. **Deteccao nativa sem dependencias externas:**
   - Consulta `nvcuda.dll` via `ctypes` no Windows.
   - Detecta modelo da GPU (ex: `NVIDIA GeForce GTX 1660 Ti`), VRAM total, versao do driver CUDA e lote recomendado (32 fotos).
2. **Painel no Gerenciador de Plugins (`PluginInfoProvider.lua`):**
   - Secao superior: Cabecalho grafico CRISPIX, versao instalada, badge `✓` e botao de checagem.
   - Secao inferior: `[x] Usar aceleracao por GPU se disponivel (NVIDIA CUDA / RTX)`, exibicao da GPU detectada e configuracao de Batch Size.
3. **Suporte no Motor:**
   - Integrado ao detector YuNet em `culling_engine.py` com backend CUDA e fallback transparente para CPU.

## 3. Testes Automatizados
- `test_check_updates_lua.py`: 7 testes unitarios cobrindo todas as transicoes de estado e modais (0.067s).
- `test_gpu_detector.py`: 3 testes unitarios validando telemetria de hardware e fallback (0.050s).
- `test_inapp_updater.py`: 2 testes unitarios validando extracao de pacote e comunicacao de progresso JSON (0.064s).
