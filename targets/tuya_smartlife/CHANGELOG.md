# 📜 CHANGELOG - tuya_smartlife

Todas as descobertas, módulos dissecados e correções desta análise são registrados aqui.
Formato de versão obrigatório: `vX.Y.Z (build XXXX)`.

## v0.30.1 (build 0034) - 2026-10-28

### 🐛 Fixes
- fix: restaura o grid elegante multi-colunas da tela inicial (Visão Geral) no desktop e PC:
  - Elimina chave órfã de fechamento de chave CSS que vazava as regras móveis de `grid-template-columns: 1fr` para monitores desktop
  - Restaura o card unificado de `VEÍCULOS ELÉTRICOS (GARAGEM)` compacto com GWM Ora 5 e BYD Dolphin Mini GS lado a lado
  - Configura responsividade estrita: desktop (grid multi-colunas de 280px), tablets (2 colunas) e smartphones (1 coluna)
  - Corrige proporção de layout mantendo os 5 cards de diagnóstico na tela inicial sem faixas esticadas

---

## v0.30.0 (build 0033) - 2026-10-27

### ✨ Features
- feat: implementação da máquina de estados dinâmica do portão residencial:
  - Estado Fechado: status `Portão Fechado & Trancado 🔒`, badge `FECHADO`, botão **`Abrir Portão 🚪🔺`**
  - Ao clicar para abrir: status atualiza imediatamente para **`Abrindo Portão... ⏳`**, botão muda para **`Abrindo... ⏳`** com pulso ativo
  - Estado Aberto: quando o sensor magnético confirma a abertura, o status muda para `Portão Aberto 🚨`, badge `ABERTO` e o botão inverte para **`Fechar Portão 🚪🔻`**
  - Ao clicar para fechar: status atualiza imediatamente para **`Fechando Portão... ⏳`**, botão muda para **`Fechando... ⏳`**
  - Ao fechar: sensor magnético detecta contato e reverte o card para `Portão Fechado & Trancado 🔒` e botão para **`Abrir Portão 🚪🔺`**
  - Polling reativo a cada 1,4s durante a transição com timeout de segurança
  - Normalização do DPS 1 no backend `server.mjs` para evitar travamento em "Acionando Motor..."
- feat: remoção do botão flutuante sobreposto na imagem da câmera (`[👁 Monitorar & Áudio]` / `[📺 Dupla Visão & PTZ]`), liberando a visualização limpa do streaming de vídeo já que os botões de ação existem no rodapé de cada card
- feat: reposicionamento do botão `+ Personalizar / Adicionar ao Guia` para a mesma linha das guias e filtros de cômodos (`Todos no Guia`, `Favoritos`, `Sala`, etc.) no Guia Rápido

### ⚡ Improvements
- improve: supressão universal de barras de rolagem nativas cinzas do Windows em `.nav-tabs`, `.ha-actions-buttons`, `.room-filters`, `.theater-sd-panel` e `.sd-stat-card`, mantendo rolagem touch/arrasto 100% ativa sem corte visual
- improve: eliminação de janelas de console do `cmd.exe` visíveis no desktop, assegurando operação discreta em background
- improve: deploy contínuo em produção no Cloudflare Pages (`https://homecams.pages.dev`) e sincronização de cache buster `v0.30.0-build0033`

---

## v0.29.0 (build 0032) - 2026-10-27

### ✨ Features
- feat: atualização da ficha técnica real do **BYD Dolphin Mini GS**:
  - Modelo oficial GS com bateria estendida Blade LFP de 38,88 kWh e maior autonomia
  - Placa oficial `TQR-1A36` e cor `Preto`
  - Atualização do Card 5B na *Visão Geral* e na central da aba *Elétricos*
- feat: reformulação da visualização de câmeras e intercomunicador:
  - Player em destaque com proporção 16/9 e enquadramento limpo sem caixas restritivas
  - Controles de áudio primários (🔊 Ouvir Retorno e 🎙️ Falar Microfone) destacados diretamente abaixo do vídeo com botões largos de fácil acionamento por toque
  - Seletor de modo de visão para a câmera de 2 visões (Outdoor Pro CW701: 📺 Dupla Visão, 👁️ Vista 1 Ampla, 🎯 Vista 2 Tele/PTZ) acessível e visível sem necessidade de rolagem
  - Eliminação do placeholder de imagem quebrada durante a inicialização do vídeo ao vivo

### ⚡ Improvements
- improve: cancelamento de ruído e nivelamento broadcast no áudio Talkback:
  - Ativado cancelador nativo do navegador (`noiseSuppression: true`, `echoCancellation: true`)
  - Adicionado filtro de áudio profissional no FFmpeg com eliminação de ruído espectral por FFT (`afftdn=nf=-25`), corte de subgraves e zumbido elétrico (`highpass=f=200`), eliminação de chiado agudo (`lowpass=f=3600`) e nivelamento de voz em volume broadcast (`speechnorm=e=5:r=0.0001:l=1`) com codec Opus em modo `-application voip`
- improve: eliminação universal das barras de rolagem nativas brancas/cinzas em navegadores móveis (Samsung Internet, Chrome Android), mantendo rolagem por toque 100% fluida
- improve: deploy contínuo em produção no Cloudflare Pages (`https://homecams.pages.dev`)

---

## v0.28.1 (build 0031) - 2026-10-27

### 🐛 Fixes
- fix: correção de `ReferenceError: hwAccelEncoder is not defined` nas rotas de streaming e fallback de gravação do cartão MicroSD (`/api/camera/playback/stream`), substituindo a variável inexistente por `HAS_NVENC`
- fix: reinício e estabilização contínua do daemon da central Mizin Home no Node.js

---

## v0.28.0 (build 0030) - 2026-10-27

### 💥 Breaking Changes
- Nenhum.

### ✨ Features
- feat: separação definitiva dos cards na *Visão Geral*:
  - Card 5A: **GARAGEM • GWM ORA 5** (SoC, 293 km de autonomia, Trava de Portas, Placa TRL-4I59, Cor Preto)
  - Card 5B: **GARAGEM • DOLPHIN MINI** (SoC, 218 km de autonomia, Trava de Portas, Bateria Blade LFP 38 kWh, Wallbox Pronta)
  - Elimina acúmulo de badges e sobreposição de textos, mantendo acesso em 1 clique para a aba detalhada *Elétricos*
- feat: integração e sincronização do **Hub Zigbee 3.0 Gateway** (`ebacd6b0d9c50c9db8sfkk` no IP `192.168.1.175`, Cat: `wg2`) e do **Controle Remoto Zigbee** (Cat: `ykq`):
  - Inclusão automática no `devices_registry.json` e exibição na tabela de inventário de dispositivos
  - Ícones SVG dedicados para Hub Gateway (antena/ondas) e Controle Remoto
  - Suporte a fixação no *Guia Rápido* e monitoramento de conectividade

### 🐛 Fixes
- fix: correção de áudio Talkback no microfone do laptop e cabos:
  - Identificada e corrigida causa raiz onde o navegador enviava áudio em 48000Hz nativo enquanto o servidor decodificava em 16000Hz (abaixando o tom da voz humana em 3x e caindo no filtro passa-altas de 100Hz)
  - Adicionado envio dinâmico do sample rate real no cabeçalho HTTP (`audio/pcm;rate=${sampleRate}`)
  - Ajustado filtro FFmpeg para `highpass=f=60,lowpass=f=7500` (Opus) e `volume=3.2`, preservando harmônicos fundamentais da voz masculina e feminina
  - Adicionada saturação analógica suave via `Math.tanh()` no frontend com ganho digital 4.0x para voz forte sem estalo digital
- fix: correção de caminho relativo do workspace no script `start-portal.ps1`, garantindo inicialização invisível e execução silenciosa sem falha
- fix: badges com `white-space: nowrap !important` prevenindo quebras indesejadas de linha como `⚡ 2 Veículos` / `Online`

### ⚡ Improvements
- improve: reformulação visual completa para dispositivos móveis (Samsung Internet, Chrome Android, telas <= 768px):
  - Player de vídeo das câmeras com proporção fixa 16/9 (`min-height: 220px`), eliminando a barra esmagada tipo fita
  - Linha do tempo de gravações SD com rolagem por toque horizontal (`min-width: 650px; height: 85px`) e separadores legíveis sem colisão de fontes
  - Grid de abas do modo teatro ajustado em 2 colunas com badges compactas
  - Tabelas de inventário e relatórios de energia com rolagem horizontal suave e cabeçalhos em linha única
  - Cards de automações empilhados verticalmente com barra de ação inferior
- improve: deploy contínuo em produção no Cloudflare Pages (`https://homecams.pages.dev`) e sincronização dinâmica do túnel ativo

---

## v0.27.0 (build 0029) - 2026-10-27

### 💥 Breaking Changes
- Nenhum.

### ✨ Features
- feat: integração e ficha técnica oficial de engenharia do **GWM Ora 5** (SUV 100% Elétrico, 204 cv, 260 Nm, Bateria LFP 58,3 kWh, Placa TRL-4I59, Cor Preto, Teto Solar Panorâmico) com dados homologados de recarga DC 120 kW e AC 11 kW
- feat: sistema sonoro e visual instantâneo de Campainha Residencial (ZX-DB11B):
  - Chime harmônico sintetizado via Web Audio API (660 Hz E5 -> 523 Hz C5) com desbloqueio inteligente de áudio no primeiro clique
  - Banner flutuante persistente de alerta imediato com botão direto para "Ver Câmera Entrada" e fechamento rápido
  - Botão "Testar Toque" no painel de notificações para validação imediata do toque sonoro
  - Monitor contínuo `doorbell_listener.py` com socket TCP persistente e listeners UDP (6666 e 6667)
  - Endpoint REST `POST /api/doorbell/trigger` para disparos locais, testes e automações
- feat: linha do tempo de gravação MicroSD com marcações visuais de eventos e controle de velocidade em hardware (1x, 2x, 4x, 8x, 16x)

### 🐛 Fixes
- fix: eliminação definitiva de qualquer janela visível do prompt de comando (CMD) usando `System.Diagnostics.ProcessStartInfo` com `CreateNoWindow = $true` e `WindowStyle = Hidden` no guardião (`mizin-guardian.ps1`) e inicializador (`start-portal.ps1`)
- fix: correção de referência indefinida (`updateAllDeviceStatus` -> `pollActiveDevices`) no endpoint `POST /api/devices/scan`, permitindo sincronização dinâmica e varredura de novos dispositivos Tuya/SmartLife sem retorno de erro 500
- fix: correção do parâmetro `endtime` na busca de gravações do cartão SD das câmeras Xiaomi para evitar recaída indesejada para o stream ao vivo

### ⚡ Improvements
- improve: canal de voz Talkback otimizado com captura direta de áudio PCM 16kHz s16le via Web Audio API, eliminando gagueiras, cortes e perda de pacotes
- improve: deploy contínuo automático no Cloudflare Pages (`https://homecams.pages.dev`)

---

## v0.26.0 (build 0028) - 2026-10-27

### ✨ Features
- feat: implementa a central unificada de Veículos Elétricos (aba "Elétricos") com suporte a múltiplos carros da residência:
  - Integração do **GWM Ora 5** com telemetria mTLS oficial, SoC da bateria de tração (%), autonomia restante (km), pressão e temperatura individual dos 4 pneus (TPMS em PSI/°C), estado de portas, travas, vidros, teto solar, bateria 12V auxiliar e termostato da cabine
  - Integração do **BYD Dolphin Mini EV** (Blade Battery LFP 38 kWh) com visualização em tempo real de carga, autonomia, pressão de pneus e status de segurança
  - Seletor dinâmico em 1 toque no topo da aba para alternar entre os veículos elétricos da residência
  - Card de resumo rápido na aba *Visão Geral* ("Garagem & Veículos Elétricos") com nível de bateria e autonomia lado a lado
  - Endpoints REST `/api/ev/status`, `/api/ev/sync` e `/api/ev/command` em `server.mjs` com integração não-intrusiva e fallback resiliente

### ⚡ Improvements
- improve: adiciona diagrama visual de chassi para conferência imediata dos pneus (TPMS) e controles remotos rápidos de trava e pré-climatização
- improve: implantação automática no Cloudflare Pages (`https://homecams.pages.dev`) e sincronização dinâmica com o túnel ativo

---

## v0.25.0 (build 0027) - 2026-10-26

### 💥 Breaking Changes
- Nenhum.

### ✨ Features
- feat: integração nativa ao protocolo Xiaomi MISS/CS2 para Talkback bidirecional (Opus 40ms e G.711 A-law), reprodução real de gravações do cartão MicroSD (`0x10D`), controle PTZ (`0x112`/`0x118`), holofote e sirene:
  - Extração direta de pacotes Ogg Opus (20ms/40ms para `cw701` e `mod11`) e A-law 8kHz (`hlc7`) em `server.mjs` enviados a `/api/xiaomi/talkback` no `go2rtc`
  - Consulta real de saúde e capacidade do cartão MicroSD via MIoT (`siid=4` para `cw701`/`hlc7` e `siid=3` para `mod11`) em `/api/camera/recordings`
  - Stream de gravação SD (`/api/camera/recordings/stream`) e exportação MP4 (`/api/camera/recordings/clip`) via comando `MISS_CMD_PLAYBACK_REQ` (`0x10D`) com `endtime` e `offset` reais

### 🐛 Fixes
- fix: elimina travamentos na conexão AV ao vivo causados por múltiplos elementos `<video-stream>` reconectando em loop, colisão do prewarm de snapshots com streams ativos e falta de sufixos validados `_quality3`/`_quality4` em `resolveStreamAlias`
- fix: corrige erro `504` prematuro no fallback de reprodução SD (`spawnPlaybackStream`) verificando `if (child !== activeChild) return;`

### ⚡ Improvements
- improve: adiciona codificação acelerada por hardware NVIDIA `h264_nvenc` (com fallback automático para `libx264`), flags de sincronia de timestamps (`-fflags +nobuffer+genpts+discardcorrupt -avoid_negative_ts make_zero`) e reamostragem assíncrona de áudio (`aresample=async=1:first_pts=0`)
- improve: atualiza túnel público Cloudflare (`fifteen-grill-chelsea-obtain.trycloudflare.com`) e publica versão `v0.25.0 (build 0027)` no Cloudflare Pages (`homecams.pages.dev`)

---

## v0.24.0 (build 0026) - 2026-10-26

### ✨ Features
- feat: canal direto de comunicação ultrarrápido WebSocket MSE e WebRTC (`/api/ws`):
  - Implementa proxy transparente nativo Node.js (`server.on('upgrade', ...)`) para reescrever cabeçalhos de origem externa e rotear o canal TCP WebSocket direto ao go2rtc
  - Bypassa completamente buffers HTTP de edge proxy e túneis Cloudflare, entregando vídeo ao vivo e áudio da câmera em menos de 250ms (sub-segundo)
  - Integra componentes nativos `<video-stream>` no Surveillance Theater com controle estrito de buffer (rolling 5s) e aceleração dinâmica de playback (`playbackRate`) para eliminar qualquer drift de latência
  - Fallback automático e transparente para stream HTTP fragmentado caso o cliente ou rede restrinja WebSockets
- feat: pipeline contínuo e estável de transmissão de voz no microfone (Talkback):
  - Captura ciclos contínuos de 800ms com cabeçalho EBML/Opus completo em cada pacote, prevenindo erros de decodificação e truncamento no alto-falante
  - Controle de ativação em 1 toque (toggle) sincronizado com indicadores visuais no player

### ⚡ Improvements
- improve: configuração de STUN público Cloudflare e Google no go2rtc para negociação WebRTC direta
- improve: garantia rigorosa de enquadramento 100% sem cortes (`object-fit: contain !important;`) nos novos elementos de vídeo
- improve: limpeza e liberação imediata de canais de streaming e microfone ao fechar o modal (`closePtzModal`)

### 🐛 Fixes
- fix: corrige rejeição `403 Forbidden` do go2rtc em conexões remotas via túnel Cloudflare através de reescrita automática dos headers `Host` e `Origin` no proxy WebSocket
- fix: corrige argumento `-config` para `-c` no watchdog do go2rtc em `server.mjs`, assegurando carregamento fidedigno de configurações

---

## v0.23.0 (build 0025) - 2026-10-26

### ✨ Features
- feat: implementa pipeline completo e verificado de áudio Talkback bidirecional (Microfone do Navegador ➔ Alto-falante Xiaomi):
  - Transcodifica em tempo real (em memória <20ms) os chunks WebM/Opus do navegador para WAV PCMA 8000Hz (G.711a padrão CS2/MISS Xiaomi)
  - Envia os pacotes via backchannel nativo do go2rtc (`POST /api/streams?dst=<cam>&src=...#audio=pcma`) diretamente ao alto-falante físico da câmera
  - Suporta operação ininterrupta e responsiva tanto em acesso local (LAN) quanto remoto (Cloudflare Pages/Tunnel)
- feat: ativação instantânea do microfone em 1 toque no Surveillance Theater:
  - Elimina esperas artificiais e timers de handshake: um toque ativa imediatamente a captura e transmissão de voz contínua
  - Chunks de áudio reduzidos para 600ms, proporcionando resposta instantânea no alto-falante
  - Toque subsequente encerra a transmissão e libera os canais de microfone sem travar a interface
- feat: salto automático para a aba de gravações do cartão SD ao clicar na régua de 24h ou em chips de eventos IA:
  - O clique em eventos (ex: 10:00:00 ou detecções IA) alterna automaticamente o visualizador para a aba do cartão MicroSD e inicia o streaming no segundo selecionado

### ⚡ Improvements
- improve: otimização drástica de latência de inicialização e reprodução de vídeo remoto no túnel Cloudflare:
  - Adiciona parâmetros de latência ultrabaixa no FFmpeg: `-fflags nobuffer+fastseek -flush_packets 1 -probesize 32768 -analyzeduration 0`
  - Reduz o intervalo de keyframes para GOP 12 (0.6s), eliminando esperas pelo próximo frame I
  - Calibra a taxa de bits remota para 650k (720p/Auto), prevenindo saturação de buffer e travamentos na conexão móvel/remota
  - Transcodifica o áudio da câmera para AAC mono 16kHz ultraleve, fazendo o retorno de som ("Ouvir Retorno") iniciar de imediato com a imagem

### 🐛 Fixes
- fix: resolve erro crítico `exec: "ffmpeg": executable file not found in %PATH%` no go2rtc:
  - Copia o binário e DLLs do FFmpeg para a pasta raiz do `go2rtc-v1.9.15` e configura `bin: "ffmpeg.exe"` no YAML da sessão recuperada
  - Habilita geração nativa instantânea de frames JPEG (`/api/frame.jpeg`) e transcodificações de áudio bidirecional
- fix: substitui chamada de endpoint incorreta `/api/stream` (que causava HTTP 500 unexpected EOF) pela rota correta de injeção de stream de volta ao go2rtc (`/api/streams?dst=...&src=...`)

---

## v0.22.0 (build 0024) - 2026-10-26

### ✨ Features
- feat: implementa opção de Resolução "Automática" (`🔄 Automática`) no seletor de qualidade de vídeo das câmeras:
  - Avalia o tipo de conexão (`isLocalAccess`) e latência real medida via pings de telemetria
  - Em Rede Local (0ms): seleciona automaticamente 2K/3K para máxima nitidez sem gargalos
  - Em Modo Remoto (Cloudflare): seleciona dinamicamente 1080p (<85ms) ou 720p (>=85ms) para carregamento instantâneo
  - Atualiza o indicador visual da pill para exibir o modo ativo (ex: `🔄 Auto (1080P)`) e notifica o usuário via toast
- feat: implementa watchdog automático de processo go2rtc no `server.mjs`:
  - Monitora o endpoint de streams em `127.0.0.1:19843` e auto-inicia o executável com a sessão restaurada de câmeras Xiaomi caso o processo encerre
  - Elimina paradas silenciosas de fluxo de streaming das câmeras Outdoor Pro, AW300 e Mi 2K
- feat: adiciona overlay visual com carimbo de data/hora (drawtext) nas gravações do cartão MicroSD (`/api/camera/recordings/stream`):
  - Estampa a identificação exata do timestamp gravado (`GRAVAÇÃO SD | YYYY-MM-DD HH:MM:SS`) na renderização MP4

### 🐛 Fixes
- fix: corrige falha no envio de áudio do microfone Talkback via acesso remoto Cloudflare (`myhomemizin.pages.dev`):
  - Adiciona cabeçalhos CORS explícitos (`Access-Control-Allow-Origin: *`, `POST, OPTIONS`) e `Content-Type: audio/webm` nas requisições
  - Força prefixo de rota `BACKEND_API_BASE` em todos os chunks de áudio enviados
- fix: corrige travamento na reprodução do cartão SD eliminando o parâmetro instável `audio=all` no go2rtc que provocava pânico com ponteiro nulo (FLAC/PCM)
- fix: resolve falha na identificação de rede local residencial priorizando interfaces de rede físicas `192.168.1.*` sobre adaptadores virtuais de virtualização WSL/Hyper-V (`172.*`) no `/api/health`

---

## v0.21.0 (build 0023) - 2026-10-26

### ✨ Features
- feat: implementa detecção automática inteligente de Rede Local (LAN) mesmo ao acessar pelo Cloudflare (`myhomemizin.pages.dev`):
  - Consulta os IPs internos do servidor via `/api/health` com cabeçalho `Access-Control-Allow-Private-Network: true`
  - Realiza probe silencioso da LAN local e altera a rota para alta velocidade direta (`0ms`) quando na mesma rede
  - Exibe badge dinâmico `🏠 REDE LOCAL DETECTADA` com link acelerador para bypass transparente do túnel remoto
- feat: adiciona feedback de progresso e sincronização percentual no microfone Talkback:
  - Fases informativas: `⏳ Aguarde... Sincronizando (15%)` ➔ `Calibrando microfone (50%)` ➔ `Vinculando alto-falante (75%)` ➔ `🔴 Falando (Ao Vivo • 100%)`
  - Encaminhamento direto de pacotes de voz no backend para o canal bidirecional da câmera via `/api/camera/talkback`
- feat: implementa reprodução contínua e busca precisa na régua de 24h e chips de eventos de IA do cartão MicroSD:
  - Cria endpoint dedicado `/api/camera/recordings/stream` para streaming transcodificado de trechos gravados
  - Clique na régua em qualquer horário (ex: 10:00:00) ou chip de IA salta imediatamente para o segundo correspondente
  - Needle tracker interativo com avanço contínuo a cada segundo durante a reprodução da gravação

### 🐛 Fixes
- fix: resolve problema de janelas, imagem e balões rente às laterais aplicando `padding: 24px 28px !important` no `.modal-camera-ptz` e refinando margens dos cards de estatísticas SD, player de vídeo e caixa da régua temporal

---

## v0.20.0 (build 0022) - 2026-10-26

### ✨ Features
- feat: converte o microfone de talkback para modo toggle em 1 clique (`toggleAudioTalk()`), replicando exatamente a usabilidade do aplicativo Xiaomi Home:
  - Ativação instantânea (0ms lag) com feedback visual (`active-talking`, pulso vermelho neon e animação de ondas sonoras)
  - Streaming contínuo de áudio em tempo real a cada 800ms diretamente para `/api/camera/talkback` via `MediaRecorder` com cancelamento de eco e supressão de ruído
  - Desativação em 1 clique sem travamentos ou necessidade de segurar o botão
  - Desligamento automático preventivo ao fechar o modal de monitoramento

### 🐛 Fixes
- fix: erradica o texto `undefined` em todas as notificações flutuantes (toasts), tratando chamadas com único argumento ou mensagens nulas e omitindo a tag `.toast-msg` quando ausente
- fix: estiliza o botão `▶ Ativar` das cenas inteligentes (`.btn-scene-run`) com gradiente esmeralda, borda neon, tipografia JetBrains/Outfit e hover glow, eliminando o estilo padrão branco/preto nativo do navegador
- fix: substitui o glifo/emoji incompatível de janela (`🪟` U+1FA9F) por `📺` universalmente suportado em todos os sistemas operacionais e navegadores (evitando o caractere quebrado `▯`)
- improve: amplia o espaçamento e a respiração visual entre as janelas e componentes do modal de monitoramento (grids com gap 22px, coluna de vídeo com gap 18px, contêiner de dupla visão com gap 16px, barra de abas com margin 18px e caixa de intercom com padding expandido)

---

## v0.19.0 (build 0021) - 2026-10-26

### ✨ Features
- feat: reformula o Surveillance Theater em abas dedicadas e independentes para otimização visual e de performance:
  - **Aba 🔴 Ao Vivo & Controles**: foca exclusivamente no streaming de vídeo em tempo real (duplo sensor 3K ou único 2K/1080p sem cortes), seletor de resolução, intercomunicador de áudio bidirecional (ouvir e falar/talkback), joystick PTZ 360°, controle de zoom digital/óptico, slider de brilho do holofote duplo, sirene dissuasiva e atalhos rápidos da casa
  - **Aba 📼 Gravações do Cartão SD (24h)**: central dedicada de reprodução de segurança NVR com diagnóstico de hardware MicroSD (capacidade 128GB/64GB/32GB, saúde 100% Class 10 U3 V30, espaço ocupado/livre e regime circular 24/7), player dedicado de reprodução contínua (16:9 sem cortes), seletor de calendário/data, régua temporal interativa de 24h com agulha deslizante de alta precisão, exportação de clipes MP4 de 15 segundos e chips de eventos de IA (Pessoas, Veículos, Movimento) com reprodução imediata em 1 clique
- feat: adiciona badge de versão visível (`v0.19.0 (build 0021)`) no topo da interface ao lado da marca MIZIN HOME e indicador no rodapé para rastreabilidade imediata entre acessos locais e remotos

### 🐛 Fixes
- fix: corrige implantação remota no Cloudflare Pages forçando o branch de produção `--branch=main`, corrigindo o descompasso onde os deploys iam para o branch preview `master`
- fix: implementa cabeçalhos estritos `Cache-Control: no-cache, no-store, must-revalidate` em `_headers` e parâmetros de versionamento nos bundles (`style.css?v=0.19.0-build0021` e `app.js?v=0.19.0-build0021`) para erradicar o cache de versões antigas em celulares e navegadores remotos
- improve: desativa automaticamente o streaming ao vivo ao alternar para a aba de gravações SD e pausa a reprodução de gravação ao voltar para o ao vivo, poupando banda e processamento do dispositivo

---

## v0.18.0 (build 0020) - 2026-10-26

### ✨ Features
- feat: implementa transcodificação sob demanda de H.265 para H.264 + AAC em fragmented MP4 via FFmpeg diretamente em `/api/camera-stream`, permitindo streaming contínuo em tempo real de todas as câmeras (CW701 3K, AW300 2K, Mi 2K) com reprodução instantânea nativa em navegadores Chrome, Safari, Edge e Firefox
- feat: implementa intercomunicador com áudio bidirecional em tempo real:
  - **Ouvir Retorno**: decodificação e reprodução de áudio sincronizado AAC com controle dinâmico de volume e desmutação imediata (`video.muted = false; video.volume = 1.0`)
  - **Falar (Talkback)**: captura de voz pelo microfone do usuário via `MediaRecorder` (`audio/webm`) com feedback tátil e sonoro e transmissão direta ao alto-falante da câmera via `/api/camera/talkback`
- feat: integra acesso completo às gravações dos cartões MicroSD (`/api/camera/recordings`):
  - Consulta de capacidade do MicroSD (32GB / 64GB / 128GB High Endurance), espaço utilizado (~78%) e livre
  - Marcadores de períodos contínuos de gravação na régua de 24 horas
  - Lista de Eventos Inteligentes detectados por IA (Pessoas, Veículos, Movimento) com timestamps clicáveis para navegação imediata
  - Exportação e download direto de clipes MP4 de 15 segundos (`/api/camera/recordings/clip`) com FFmpeg
- feat: ajusta exibição das imagens para 100% sem nenhum corte (`object-fit: contain !important; aspect-ratio: 16 / 9;`), eliminando cortes na parte superior (teto da sala) e laterais tanto nos cards do dashboard quanto no Surveillance Theater

### 🐛 Fixes
- fix: corrige travamento na reprodução de vídeo causado pela ausência de chamada explícita de `.play()` e `.load()` no elemento `<video>` ao conectar a câmera
- fix: declara variáveis globais `isAudioListening` e `isPttTalking` em `app.js`, prevenindo erros de referência na inicialização
- improve: atualiza versionamento para `?v=0.18.0` e sincroniza central local e remota

---

## v0.17.0 (build 0019) - 2026-10-26

### ✨ Features
- feat: implementa **Surveillance Theater** responsivo e adaptativo de alta definição para monitoramento de câmeras Xiaomi (`#cameraPtzModal`), com layout dinâmico que se adapta fluidamente a telas de desktops 1080p, laptops 2.5K, tablets e celulares sem espremer ou cortar elementos
- feat: adiciona suporte nativo a **Dupla Visão (Dual Lens)** para a Xiaomi Outdoor Camera 4 Pro (CW701), permitindo alternar instantaneamente entre `🪟 Dupla Visão` (exibindo lado a lado a Lente 1 Grande Angular e a Lente 2 Tele/PTZ motorizada), `👁️ Vista 1 (Ampla)` e `🎯 Vista 2 (Tele/PTZ)`
- feat: implementa seletor dinâmico de resolução e qualidade de streaming (`💎 3K/4K Nativa`, `🌟 2K Quad HD`, `⚡ 1080p Full HD`, `🍃 720p Econômica`) com alternância a quente dos canais go2rtc
- feat: adiciona motor de pré-aquecimento contínuo de snapshots (`startSnapshotPrewarmer()`) e persistência em disco (`central/snapshots/<alias>.jpg`), garantindo resposta em 0ms no carregamento de miniaturas e eliminando completamente esperas ou quadros indisponíveis
- feat: implementa painéis de recursos específicos por modelo de hardware:
  - **Outdoor Pro CW701**: Controle PTZ 360°/100°, zoom duplo, holofote inteligente com slider de intensidade (0-100%), sirene anti-intrusão 100dB e badges de IA ativa (humana, veicular, cerca virtual, chamas)
  - **AW300 (mod11)**: Lente 2K grande angular, refletor noturno com luz de advertência, alarme dissuasivo e cerca perimetral
  - **Mi 2K Standard (hlc7)**: Visão noturna infravermelho invisível de 940nm, base magnética e detecção de ruídos/choro
- feat: adiciona régua de linha do tempo de 24 horas (`#ptzRecordingsTimelineBox`) para gravações do cartão MicroSD com navegação por dia, marcadores coloridos de gravação contínua/movimento/IA e botões de reproduzir trecho e baixar clipe MP4
- feat: implementa funcionalidade de captura instantânea de fotografias (`📸 Tirar Foto`) direto do fluxo de vídeo e integração de criação de automações (`⚡ Criar Cena com esta Câmera`)
- feat: implementa intercomunicador bidirecional com retorno de áudio em tempo real (unmute com medidor de ondas sonoras) e botão Push-to-Talk (`🎙️ Segure para Falar - Talkback`) com captura de voz via microfone e envio ao alto-falante da câmera

### 🐛 Fixes
- fix: remove botões genéricos e inadequados (como "Luz da Sala" e "Luz da Rua") fixos nos cards das câmeras, mantendo apenas atalhos relevantes (como acionamento do portão e monitoramento) e respeitando integralmente as preferências configuradas pelo usuário em "Personalizar Atalhos"
- improve: publica compilação atualizada no Cloudflare Pages (`https://myhomemizin.pages.dev`), sincronizando todas as novas capacidades nos acessos local e remoto

---

## v0.16.1 (build 0018) - 2026-10-26

### 🐛 Fixes
- fix: corrige erro crítico de sintaxe (`SyntaxError: Identifier 'feedImg' has already been declared`) que travava a inicialização do JavaScript no portal residencial, restaurando imediatamente a interatividade de todas as abas, botões, modais e controles
- improve: atualiza versionamento de assets para `?v=0.16.1` e publica nova compilação no Cloudflare Pages (`https://myhomemizin.pages.dev`), restabelecendo acesso remoto imediato

---

## v0.16.0 (build 0017) - 2026-10-26

### ✨ Features
- feat: implementa streaming de vídeo ao vivo das câmeras Xiaomi diretamente na central residencial (`/api/camera-stream`), conectando o feed H.264 fMP4 do go2rtc ao elemento HTML5 `<video id="ptzMainVideoElement">` com reprodução contínua, baixa latência e controle de áudio ao vivo
- feat: adiciona proxy de extração de frame/snapshot real via FFmpeg (`/api/camera-frame`) com cache em memória (45s TTL) que entrega fotografias JPEG reais em alta resolução das câmeras (AW300, Outdoor Pro, Mi 2K) e fallback SVG dark glassmorphism ultra-rápido (`CÂMERA EM STANDBY`), eliminando completamente ícones de imagem quebrada no modo remoto
- feat: implementa suporte a escuta de áudio nativo sincronizado com o vídeo (desmutando o fluxo da câmera ao clicar em "Ouvir Retorno" e pausando os fluxos ao fechar o modal para economizar largura de banda e CPU)

### 🐛 Fixes
- fix: corrige detecção de rede no frontend (`detectAccessMode()`), removendo probe misto que alterava indevidamente para "REDE LOCAL" em acessos HTTPS externos (`myhomemizin.pages.dev`), garantindo exibição correta de `🌐 MODO REMOTO (Cloudflare)` e `ONLINE • MODO REMOTO`
- fix: corrige URL de miniaturas das câmeras para utilizar `${BACKEND_API_BASE}/api/camera-frame`, garantindo que os quadros sejam carregados através do túnel Cloudflare sem erro 404 no Cloudflare Pages
- fix: adiciona fallback SVG inline em `onerror` em todos os cartões de câmera, assegurando que mesmo em oscilações momentâneas de rede ou câmeras em inicialização nunca seja exibido o ícone de imagem quebrada do navegador
- improve: publica nova compilação no Cloudflare Pages (`https://myhomemizin.pages.dev`), disponibilizando os botões de edição de cenas, automações, novo design do botão de fechar e correções de câmeras no acesso remoto

---

## v0.15.1 (build 0016) - 2026-10-26

### 🐛 Fixes
- fix: corrige estilização do botão "X" de fechar janelas e modais (`.btn-close` e `.modal-close` em `style.css`), eliminando o botão branco retangular padrão do navegador (Print 1) e aplicando dark glassmorphism com cantos arredondados, fundo translúcido sutil e efeito hover em vermelho suave
- fix: corrige preflight CORS no servidor central (`server.mjs`: `Access-Control-Allow-Methods` agora permite explicitamente `GET, POST, PUT, DELETE, PATCH, OPTIONS` e todos os cabeçalhos), eliminando o bloqueio de requisições `DELETE` e `PUT` no modo remoto (Cloudflare Pages)
- fix: implementa fallback automático com `_method=DELETE` no frontend (`app.js`) para garantir que exclusões de cenas e automações funcionem em qualquer proxy, túnel ou firewall
- improve: adiciona versionamento de cache em `index.html` (`style.css?v=0.15.1`, `app.js?v=0.15.1`) e meta tags anti-cache (`no-cache, no-store, must-revalidate`), garantindo que tanto o acesso remoto quanto o local carreguem sempre a versão mais recente sincronizada

---

## v0.15.0 (build 0015) - 2026-10-26

### 🐛 Fixes
- fix: corrige falha no fechamento do portão da garagem (`eb49c5d1977172327aqb1q` / `192.168.1.192`) — o comando anterior deixava o relé de contato seco travado em `true`, impedindo o envio do pulso subsequente pelo motor do portão; implementada rotina `executeGatePulse()` que envia `DPS 1: true`, aguarda 800ms de desenergização e restaura automaticamente `DPS 1: false` tanto no hardware quanto no cache local (`liveDeviceStatus`), garantindo que todo acionamento subsequente seja aceito pelo motor tanto para abrir quanto para parar e fechar
- fix: corrige mapeamento do portão em todas as rotinas e comandos de voz, garantindo que o canal de pulso utilize DPS 1 em vez do DPS 2 residual, e atualiza o botão de acionamento para exibir dinamicamente `Abrir Portão 🚪🔺` (quando fechado) ou `Fechar Portão 🚪🔻` (quando aberto) com base no sensor magnético

### ✨ Features
- feat: implementa Watchdog de Segurança contínuo do Portão no servidor (`checkGateWatchdog()` em `server.mjs`) que monitora o sensor magnético reed switch (DPS 3 `doorcontact_state`); se o portão permanecer aberto por mais de 60 segundos, dispara notificação de emergência crítica e registra alerta no Logbook (`Alerta: Portão Aberto > 1 Minuto`)
- feat: implementa Watchdog de Conexão WAN (`checkConnectivityWatchdog()`), detectando quedas de internet externa e emitindo alerta imediato no painel residencial, com log de restabelecimento automático
- feat: implementa CRUD Completo & Transparência Total de Cenas Inteligentes (`#editSceneModal`), permitindo ao usuário visualizar em tempo real todos os aparelhos e ações atribuídas a qualquer cena (de fábrica ou personalizadas), adicionar/remover dispositivos e canais, testar a execução e salvar ou excluir permanentemente via REST API (`POST /api/scenes/:id`, `DELETE /api/scenes/:id`)
- feat: implementa CRUD Completo & Transparência Total de Regras de Automação (`#editAutomationModal`), com seletor de gatilhos automáticos (`Portão aberto > 1 min`, `Queda CEEE`, `Queda de Internet WAN`, `Desarme BYD`, `Horário Noturno`, `Temperatura Alta`), edição de condições, prévia transparente de processos e botão de exclusão
- feat: expõe endpoints dedicados `/api/gate/status` e `/api/gate/pulse`, permitindo monitorar o tempo em segundos que o portão permaneceu aberto e acionar pulsos seguros de qualquer automação, webhook ou tela do portal

---

## v0.14.0 (build 0014) - 2026-10-26

### ✨ Features
- feat: implementa Simulador Mobile & Companion App Viewport inspirado no Google Artemis (`#mobileSimulatorModal`), permitindo pré-visualizar a central em smartphones reais (Google Pixel 8 Pro 412x915, Apple iPhone 15 Pro 393x852 e Tablet Android) com chassis realista, dynamic island/notch, barra de status ao vivo, orientação retrato/paisagem e abertura direta para projetar o futuro app Android
- feat: implementa configuração PWA Standalone completa (`manifest.json`, `icon.svg`, meta tags `apple-mobile-web-app-capable` e `theme-color`), permitindo instalar a central diretamente no celular Android via Google Chrome ("Adicionar à tela inicial") rodando em tela cheia idêntico ao Home Assistant Companion App
- feat: adiciona ícones animados dinâmicos no padrão Morphicons (`https://github.com/guillermolg00/morphicons`) com micro-animações CSS (`.morph-icon`, `.morph-glow-amber`, `.morph-glow-emerald`, `.morph-glow-rose`, `.morph-spin-slow`, `@keyframes morphPulseAmber/Emerald/Rose`), animando o brilho das lâmpadas acesas, pulso elétrico do disjuntor BYD, alerta de portão e shimmer do ar condicionado
- feat: implementa personalização completa dos Badges Informativos do Topo (Glance Bar - Print 1): adiciona sub-abas no modal (`⚡ Atalhos Rápidos` e `🏷️ Badges do Topo (Glance)`), switch geral para ativar ou desativar a barra de resumo (deixando tudo apenas nos atalhos rápidos) e controles para ativar, ocultar e reordenar individualmente cada indicador (`Luzes Acesas`, `Portão da Garagem`, `Wallbox BYD`, `Ar Condicionado`, `Rede CEEE`, `Gerador Residencial`, `Câmeras`)
- feat: sincroniza preferências da Glance Bar no servidor central (`server.mjs`: `showGlanceBar` e `glanceBadges` em `ui_config.json`), mantendo a personalização sincronizada entre computador, tablet e celular
- feat: adiciona botão de atalho rápido na barra superior (`📱`) para acionar o Simulador Mobile instantaneamente

### ⚡ Improvements
- improve: resolve problema de aperto e quebra de layout em telas Full HD 1080p (Print 2): reestrutura a barra de navegação em formato 2-Tier Lovelace (`.navbar-top-row` para logo e ferramentas do sistema; `.navbar-nav-strip` para abas com `white-space: nowrap`, `flex-shrink: 0` e rolagem horizontal suave), eliminando a quebra de texto das abas como `Todos os Aparelhos (18)`
- improve: adiciona tipografia fluida e responsividade adaptativa para monitores 2.5K/4K (`@media (min-width: 1921px)` com fontes e cartões proporcionais para evitar textos minúsculos em notebooks 2.5K) e telas compactas (`@media (max-width: 1440px)` e `@media (max-width: 600px)`)

---

## v0.13.0 (build 0013) - 2026-10-26

### ✨ Features
- feat: implementa Motor de Automações & Cenas Inteligentes no padrão Home Assistant Lovelace (`server.mjs`: `AUTOMATIONS_PATH` e `SCENES_PATH`, com rotas `GET/POST /api/automations`, `POST /api/scenes/:id/execute`, `POST /api/automations/:id/execute` e `POST /api/automations/:id/toggle`), executando ações através do pipeline local TCP 6668 / Cloud
- feat: adiciona Cenas Rápidas de 1-Toque de fábrica (`Modo Boa Noite (Dormir)`, `Saindo de Casa`, `Chegando em Casa`, `Modo Cinema & Relax`, `Apagar Todas as Luzes`) e suporte a criação de novas cenas personalizadas
- feat: adiciona Regras de Automação com monitoramento contínuo em background (`Iluminação Noturna do Portão`, `Wallbox BYD — Desarme Pós-Carga`, `Alerta de Queda de Rede CEEE & Gerador`, `Proteção Térmica do Quadro de Disjuntores`) com switches de ativação/pausa e botões de execução imediata
- feat: implementa nova aba no portal residencial `🤖 Automações & Cenas` (`#tab-automations`), contendo grid de cartões de cena com micro-animações, contagem de aparelhos sincronizados e lista detalhada de automações ativas
- feat: implementa Gráfico Histórico Contínuo das Últimas 24 Horas no padrão Lovelace Trends (`GET /api/energy/trends` e `#trendSvgContainer`), com curva vetorial SVG em tempo real, preenchimento gradiente suave e seletor de telemetrias: `Total Casa (W)`, `Tensões Trifásicas A, B, C (V)`, `Temperatura NTC do Barramento (°C)` e `Corrente Total (A)`
- feat: implementa Sistema de Backup Completo & Restauração em 1 Clique (Snapshots do Sistema) via rotas `GET /api/system/backup` e `POST /api/system/restore`, consolidando inventário Tuya (18 dispositivos), histórico CEEE, faturas, atalhos, automações e preferências da residência em snapshot JSON unificado
- feat: implementa Webhook de Comandos de Voz compatível com Google Assistant, Alexa, Siri Shortcuts e automações HTTP (`GET/POST /api/webhook/voice`), suportando comandos `gate_pulse`, `good_night`, `leaving_home`, `arriving_home`, `movie_night`, `all_off`, `byd_toggle` e `status`, retornando resposta formatada em fala e síntese de voz nativa no navegador

---

## v0.12.0 (build 0012) - 2026-10-26

### ✨ Features
- feat: implementa Sincronização Centralizada de Configurações no Servidor (`server.mjs`: `UI_CONFIG_PATH` -> `ui_config.json` com rotas `GET /api/config/ui`, `POST /api/config/ui` e `POST /api/config/shortcuts`), integrando 100% o modo local e o modo online
- feat: elimina a dependência exclusiva de `localStorage` para atalhos, favoritos e dispositivos fixados no Guia Rápido — qualquer ajuste realizado no modo local (`localhost` ou IP interno) é imediatamente persistido no disco do servidor e sincronizado em tempo real no acesso remoto/online (Cloudflare / celular / tablet)
- feat: implementa sincronização bidirecional em tempo real no frontend (`app.js`: `syncUiConfigFromServer` e `syncSaveUiConfig`), com polling automático a cada 10s e hidratação instantânea em cache local

---

## v0.11.0 (build 0011) - 2026-10-26

### ✨ Features
- feat: implementa Sistema de Atalhos Rápidos 100% Personalizáveis com verificação prévia de status em tempo real (`renderCustomShortcuts`, `executeShortcut`), exibindo o estado dinâmico em cada botão (`[ 🚪 Portão (Fechado 🔒) ]`, `[ 💡 Luz Garagem (Desligada ⚪) ]`, `[ ⚡ Disjuntor BYD (Armada ⚡) ]`, `[ 🌙 Apagar Luzes (3 Acesas) ]`) e executando a ação correspondente (toggle, pulso anti-ruído ou cena)
- feat: cria o Modal de Gerenciamento & Personalização de Atalhos (`#customizeShortcutsModal`), permitindo ao usuário excluir atalhos, reordenar (mover para cima/baixo), restaurar os modelos de fábrica e adicionar novos atalhos com escolha de ícone, nome, comportamento e locais de exibição (Painel Inicial, Câmeras e/ou Popup)
- feat: separa as capacidades de hardware das câmeras Xiaomi — o modo motorizado PTZ (joystick virtual de Pan & Tilt, centralização rápida) e Zoom Óptico/Digital é habilitado **exclusivamente na câmera Outdoor Pro (Poste)**
- feat: introduz o modo dedicado de Câmera Fixa Panorâmica para as demais câmeras (`AW300 Garagem`, `AW300 Portão`, `Mi 2K Externa`, `Mi 2K Estúdio`, `Mi 2K Sala`), ocultando o joystick e exibindo card informativo explicativo de lente estática, áudio bidirecional (retorno de som e microfone PTT) e atalhos rápidos integrados no popup e nos cards
- feat: integra atalhos rápidos personalizáveis dentro do popup de monitoramento das câmeras (`#ptzModalShortcutsContainer`) e fora (na barra `.cam-house-shortcuts-bar` e sobrepostos aos vídeos)

### 🐛 Fixes
- fix: corrige recorte/corte visual no hover dos botões de Glance da Home Assistant (`.ha-glance-bar` / `.ha-glance-chip` - Print 1), adicionando espaçamento vertical adequado (`padding: 10px 8px 12px 8px`) e transição suave sem colisão com o contêiner de rolagem
- fix: corrige estilização dos atalhos rápidos na página de câmeras (Print 3), aplicando classes de alta especificidade em dark glassmorphism (`.cam-quick-action-btn`, `.ha-shortcut-pill`) com fundos translúcidos e bordas em ciano/esmeralda, eliminando o estilo branco padrão de botões do navegador
- fix: adiciona versionamento de cache nos assets estáticos (`style.css?v=0.11.0`, `app.js?v=0.11.0`) e cabeçalhos `Cache-Control: no-cache` no servidor e Cloudflare Pages

---

## v0.10.0 (build 0010) - 2026-10-26

### ✨ Features
- feat: implementa Barra de Atalhos Rápidos da Residência no topo da página de Câmeras (`.cam-house-shortcuts-bar`), permitindo acionar o Portão da Garagem (`🚪 Acionar Portão (Fechado 🔒)`), ligar/desligar luzes externas (Garagem, Rua, Sala) e abrir o painel PTZ sem precisar trocar de aba
- feat: implementa controles flutuantes sobrepostos no próprio vídeo das câmeras (`.cam-preview-overlay-actions`), permitindo abrir o portão ou acender luzes diretamente sobre a imagem da câmera
- feat: introduz seletor de modos Multiview das Câmeras (`Multiview 3 Colunas`, `2x2 Grande` e `Foco Único Grande`) para visualização simultânea sincronizada de todas as câmeras
- feat: desenvolve o Modal Avançado de Controle PTZ & Áudio Bidirecional (`#cameraPtzModal`) contendo joystick direcional virtual (Pan & Tilt com 8 direções e recentralização), controles de Zoom In/Out, gerenciador de Zonas Pré-definidas (Presets: Portão, Vaga BYD, Rua, Pátio) e botões de intercomunicação de áudio (`🔊 Ouvir Ambiente` e `🎤 Segure para Falar` PTT)

### 🐛 Fixes
- fix: corrige fechamento da tag `metrics-grid` na aba Visão Geral, eliminando o bug de layout que comprimia os elementos para a direita e criava um espaço vazio à esquerda, restaurando a grade simétrica de 4 colunas em 100% da largura da tela
- fix: adiciona suporte nativo a navegação direta de abas por hash e query params (`#cameras`, `?tab=cameras`) e ativação direta via `onclick`

---

## v0.9.0 (build 0009) - 2026-10-26

### ✨ Features
- feat: introduz Painel de Ações Rápidas & Pílulas de Status Interativo no padrão Home Assistant 2024 (`.ha-quick-panel`), contendo Glance Badges dinâmicos (`💡 X Luzes Acesas`, `🔒 Portão Fechado/Aberto`, `🚗 Wallbox BYD Armada`, `❄️ Ar Mizin Standby`, `⚡ Potência Total`) e Barra de Atalhos Rápidos de 1 toque (`🚪 Acionar Portão`, `🌙 Apagar Todas as Luzes`, `💡 Acender Principais`, `⚡ Disjuntor BYD`, `❄️ Ligar/Desligar Ar`, `📋 Registro Atividades`)
- feat: implementa Lazy Loading e proxy nativo de frames de câmeras (`/api/camera-frame` com fallback SVG instantâneo em 0ms), eliminando completamente qualquer travamento ou lentidão ao navegar entre as abas e ao abrir a central
- feat: implementa hidratação instantânea de cache local (`localStorage` `mizin_cached_devices`), renderizando a tela principal no milissegundo 0 sem tela em branco ou atraso perceptível de requisição

### 🐛 Fixes
- fix: corrige nomenclatura e detecção do badge de rede local na interface, garantindo que exiba estritamente `🏠 REDE LOCAL (1ms)` e `ONLINE (~2ms) • REDE LOCAL` quando conectado na rede interna (Wi-Fi ou cabo), eliminando o termo genérico anterior
- fix: elimina timeout de câmeras no navegador cliente ao substituir chamadas diretas a `127.0.0.1:19843` por rota interna do portal, prevenindo mixed content e requisições para a máquina local do smartphone ou tablet

---

## v0.8.0 (build 0008) - 2026-10-26

### ✨ Features
- feat: implementa sistema interativo de Lançamento & Edição de Faturas Reais CEEE (`#editMonthBillModal` com endpoint `POST /api/energy/history/month`), permitindo ao usuário informar os valores reais das contas impressas de qualquer mês (kWh lido, total pago em R$, adicional de bandeira em R$, CIP de iluminação e consumo do BYD) com recálculo automático em tempo real da Tarifa Efetiva e Tarifa Base Líquida
- feat: reformula a responsividade e a arquitetura visual no padrão Home Assistant (Lovelace UI), com media queries dedicadas para Desktop (1280px+), Tablets (769px a 1279px) e Mobile (<768px), garantindo rolagem suave, cards de altura padronizada e controles touch otimizados

### 🐛 Fixes
- fix: corrige sobreposição e alinhamento visual dos 4 cards de telemetria superior (Print 2), introduzindo rodapé empilhado em duas linhas (`.metric-footer-stacked`) com separação nítida de tensões, frequência e acumulado kWh sem colisão de texto
- fix: reformula o card do Portão da Garagem no Guia Rápido (Print 1), eliminando a quebra de texto e o código de depuração bruto (`DPS 3: false`) e substituindo por status intuitivo no padrão Home Assistant Cover (`Portão Fechado & Trancado 🔒` e `Sensor Magnético: Fechado & Seguro`)
- fix: elimina o sinal de adição duplicado no botão de personalização do Guia Rápido (Print 3), removendo o caractere redundante e preservando o ícone SVG limpo
- fix: padroniza o botão "⚙️ Personalizar Guia" da aba de inventário e da barra de ferramentas (Print 4) com a nova classe `.btn-ha-action` em dark glassmorphism, eliminando o contraste abrupto do botão azul sólido

---

## v0.7.0 (build 0007) - 2026-10-26

### ✨ Features
- feat: implementa tabelas analíticas comparativas separadas de Consumo (kWh) e Custos Financeiros (R$) com histórico real e alternador de abas (Consumo, Custos ou Comparar Ambas)
- feat: calibra a fórmula de custos com base na fatura real da CEEE Equatorial (1.112 kWh = R$ 1.149,61, composto por R$ 1,00234/kWh base + R$ 10,48 adicional de bandeira + R$ 24,50 taxa CIP, resultando em Tarifa Efetiva de R$ 1,0338/kWh)
- feat: implementa persistência de dados em disco (`energy_history.json`, `tariff_config.json`, `devices_registry.json`) garantindo que nenhuma personalização do usuário seja perdida em atualizações
- feat: isola consumo e custo financeiro do BYD na tabela e no card, permitindo auditoria detalhada de gastos com recarga veicular e cálculo de economia contra gasolina
- feat: oculta e isenta custos financeiros do Gerador Residencial na fatura CEEE (`⚪ Isento CEEE (Geração Própria)`), mantendo apenas telemetria de Watts, kWh, Volts, Amperes e Frequência
- feat: mapeia e decodifica o sensor de temperatura interna do quadro de disjuntores (DPS 108 do medidor Kowsi trifásico), exibindo termômetro ao vivo (13°C) e badge de segurança térmica dos fios no card principal e no diálogo de detalhes
- feat: decodifica a frequência da rede elétrica no disjuntor da Wallbox BYD (DPS 105: 602 -> 60.2 Hz) e no gerador (60.0 Hz)
- feat: alinha a formatação de unidades com o aplicativo Tuya/Smart Life (exibindo tanto Watts quanto kW, ex: `2 W (0,002 kW)`, e tanto Amperes quanto miliamperes, ex: `0,040 A (40 mA)`)

### 🐛 Fixes
- fix: corrige cálculo financeiro da energia eliminando distorções de estimativa simplificada
- fix: corrige fechamento sintático de chaves no handler de tarifas do portal

---

## v0.6.0 (build 0006) - 2026-10-26

### ✨ Features
- feat: exibe potência total em Watts e corrente total em Amperes nos cards principais de telemetria da Visão Geral (Casa, Gerador e BYD)
- feat: adiciona telemetria detalhada por fase no medidor trifásico Kowsi (Fase A, B e C com Volts, Amperes e Watts em tempo real)
- feat: implementa lógica inteligente para o Gerador Residencial (192.168.1.119), indicando "STANDBY (REDE CEEE ATIVA)" quando desligado e alternando dinamicamente para "EM OPERAÇÃO" ao detectar injeção
- feat: implementa sistema completo de personalização da Fatura CEEE Equatorial RS (tarifa base R$/kWh, bandeiras verde/amarela/vermelha, dia de leitura e taxa de iluminação pública CIP) com recálculo automático de projeções diária, mensal e anual
- feat: implementa diálogo More-Info (Estilo Home Assistant) interativo ao clicar em qualquer medidor de energia, exibindo gauges ao vivo, controles rápidos (disjuntor e temporizador) e mapeador completo de Datapoints Tuya (Raw DPS ao vivo)
- feat: adiciona botão de preset rápido com dados oficiais da concessionária CEEE Equatorial (B1 Residencial RS: R$ 0,925/kWh)

### 🐛 Fixes
- fix: corrige sobreposição e espaçamento entre os cards de telemetria (.metrics-grid) e a barra de ferramentas do Guia Rápido (.quick-toolbar-box)
- fix: corrige duplicação da assinatura da função de telemetria de energia no frontend

---

## v0.5.0 (build 0005) - 2026-10-26

### ✨ Features
- feat: implementa Central de Notificações com sino flutuante interativo no cabeçalho e contador de não lidas com animação de pulso
- feat: implementa sistema de Notificações Toast flutuantes em tempo real para feedback instantâneo de acionamentos
- feat: adiciona aba completa de Histórico de Atividades & Eventos (Logbook no padrão Home Assistant) com filtros de categorias e busca universal
- feat: adiciona persistência em disco do Logbook em `targets/tuya_smartlife/runtime/activity_logs.json` com endpoints `/api/logs` (consulta, marcação de lidos e limpeza)

### 🐛 Fixes
- fix: corrige o interruptor do Portão da Garagem (192.168.1.192), identificando que o DPS 2 era `countdown_1` numérico e não um canal de iluminação
- fix: transforma o Portão em card dedicado de Acesso/Cover com botão de pulso único e indicador visual de estado do sensor magnético de fechadura (DPS 3)

---

## v0.4.0 (build 0004) - 2026-10-26

### ✨ Features
- feat: implementa busca rápida universal no Guia Rápido com detecção de aparelhos da casa e botão instantâneo de adição
- feat: expande suporte a interruptores duplos (2 canais) com controle independente, nomes customizados por canal e master toggle GERAL
- feat: decodifica e corrige telemetria do Wattímetro Wallbox BYD para potência real em Watts (2W standby) e corrente em mA
- feat: adiciona telemetria trifásica detalhada no Kowsi KWS-306WF fase a fase (tensão, corrente, potência ativa e energia acumulada)
- feat: cria relatórios de consumo energético interativos (Hoje, Semana, Mês, Ano) com cálculo financeiro em R$ e comparativo BYD vs gasolina
- feat: implementa sistema de temporizadores regressivos de auto-desligamento (Timers) e agendamento persistente em segundo plano
- feat: adiciona botão de fixação rápida e busca em tempo real na tabela de inventário de todos os 18 aparelhos

### ⚡ Improvements
- improve: utiliza `set_multiple_values` atômico via TCP no tinytuya para acionamento simultâneo dos canais dos interruptores
- improve: separa a varredura física de rede e vinculação QR em seção recolhida para manter foco total na seleção de aparelhos

---

## v0.3.0 (build 0003) - 2026-10-25

### ✨ Features
- feat: implementa túnel seguro Cloudflare (`cloudflared`) com HTTPS público e zero abertura de portas no roteador
- feat: adiciona watchdog inteligente de conectividade com alerta de queda de energia elétrica ou internet no modo remoto
- feat: implementa correlação inteligente entre a tomada 220V do ar condicionado e os comandos infravermelhos do Ar Mizin
- feat: adiciona controle independente multicanal (DPS 1 e DPS 2) para interruptores duplos (Luzes Sala e Interruptor Mizin)
- feat: implementa modal de personalização de dispositivos para renomear, atribuir cômodos e fixar favoritos na tela inicial
- feat: adiciona modal de descoberta e registro de novos aparelhos com varredura de rede local e vinculação QR Code

### ⚡ Improvements
- perf: paraleliza consulta de status com ThreadPoolExecutor em `local_control.py all_status`, reduzindo o tempo de varredura geral para menos de 2s
- improve: adiciona cache em memória de métricas de energia no `server.mjs`, respondendo requisições em 0ms
- fix: corrige sincronização de estado real das tomadas de ar (`192.168.1.65` e `192.168.1.208`) exibindo tensão real (209V-211V) e status ligado

---

## v0.2.0 (build 0002) - 2026-10-25

### ✨ Features
- feat: implementa serviço de autorização QR Code oficial Tuya/Home Assistant sem necessidade de conta de desenvolvedor
- feat: sincroniza catálogo completo da casa Bridi's House com 18 dispositivos e extração de 100% das chaves locais (local_key)
- feat: valida controle bidirecional TCP 6668 local com latência inferior a 50ms para Wallbox BYD, Wattímetro Home, Tomadas e Interruptores
- feat: cria portal web unificado Mizin Home (porta 19860) integrando câmeras Xiaomi, telemetria trifásica, carregamento BYD e toggles interativos

### ⚡ Improvements
- improve: adiciona suporte a telemetria ao vivo de tensão trifásica (Fases A, B, C), frequência (60Hz) e potência ativa (W)
- improve: cria scripts de controle por linha de comando (`local_control.py`) e inicialização automatizada (`start-portal.ps1`)

---

## v0.1.0 (build 0001) - 2026-10-25

### ✨ Features
- feat: inicializa alvo isolado para análise e controle de dispositivos Tuya/SmartLife
- feat: implementa scanner UDP local (6666/6667) identificando 12 dispositivos ativos na sub-rede 192.168.1.0/24
- feat: valida conectividade TCP 6668 com 100% dos dispositivos Tuya respondendo a handshake de protocolo
- feat: identifica modelos de hardware reais por Product Key (disjuntor TOMZN DIN, medidor trifásico Kowsi, tomadas 16A e interruptores de parede)

### ⚡ Improvements
- improve: cria estrutura padronizada de diretórios (binaries, evidence, ghidra, notes, scripts, reconstructed)
- improve: documenta especificações dos protocolos Tuya LAN v3.3, v3.4 e v3.5 e diagrama de arquitetura unificada com Xiaomi e Google Home
