# 📜 CHANGELOG - tuya_smartlife

Todas as descobertas, módulos dissecados e correções desta análise são registrados aqui.
Formato de versão obrigatório: `vX.Y.Z (build XXXX)`.

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
