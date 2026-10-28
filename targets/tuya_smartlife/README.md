# 🎯 ALVO: tuya_smartlife

> **Descrição**: Análise, descoberta local, mapeamento de protocolos e controle de dispositivos Tuya/SmartLife  
> **Versão da Análise**: `v0.15.1 (build 0016)`  
> **Criado em**: 2026-10-25

---

## 📊 1. Informações do Alvo
- **Categoria**: IoT / Smart Home Ecosystem & Local Protocol
- **Segmento de Rede**: `192.168.1.0/24`
- **Protocolos Identificados**: Tuya Local Protocol v3.3, v3.4, v3.5 (TCP 6668, UDP 6666/6667)
- **Criptografia**: AES-128-CBC / GCM com chaves locais de 16 caracteres (`local_key`)

---

## 🎯 2. Objetivos da Engenharia Reversa e Integração
- [x] Escanear a rede local e mapear todos os dispositivos Tuya/SmartLife ativos
- [x] Identificar versões de protocolo, Device IDs (`gwId`) e Product Keys
- [x] Validar conectividade na porta TCP 6668 (100% dos 18 dispositivos acessíveis)
- [x] Correlacionar Product Keys com modelos de hardware (TOMZN, Kowsi, Moes, tomadas 16A, EKAZA Garagem)
- [x] Obter o mapeamento de 100% das `local_key`s via Tuya QR Authorization Service
- [x] Construir controlador local em Python / Node.js para leitura de telemetria e comando liga/desliga
- [x] Integrar no Portal Unificado Mizin Home (junto com as câmeras Xiaomi de `targets/xiaomi_home`)
- [x] Implementar túnel seguro Cloudflare HTTPS público sem abertura de portas
- [x] Desenvolver Logbook e Central de Notificações em tempo real no padrão Home Assistant
- [x] Desenvolver monitoramento avançado de energia com histórico comparativo (Consumo kWh vs Custos R$), telemetria do quadro de disjuntores (DPS 108 temperatura NTC) e isolamento da Wallbox BYD
- [x] Lançador interativo de Faturas CEEE anteriores com cálculo automático e auditoria histórica precisa
- [x] Alinhamento visual e responsividade no padrão Home Assistant (Lovelace UI para Desktop, Tablet e Mobile)
- [x] Sistema de Atalhos Rápidos 100% Personalizáveis com verificação de status em tempo real e modal de gerenciamento (adicionar/excluir)
- [x] Sincronização Centralizada de Configurações no Servidor (interligando modo local e modo online 100% em tempo real)
- [x] Personalização Completa da Barra de Resumo do Topo (Glance Bar) com opção de ocultar e reordenar badges
- [x] Simulador Mobile & Companion App Viewport (Google Artemis) para projetar o app nativo Android em smartphones reais (Pixel 8 Pro, iPhone 15 e Tablet)
- [x] Configuração PWA Standalone (`manifest.json` e ícone SVG) para instalação em tela cheia no Android como app oficial
- [x] Ícones animados Morphicons com micro-interações CSS de brilho, pulso e shimmer
- [x] Arquitetura de Navbar 2-Tier Lovelace eliminando aperto e quebra de linhas em telas 1080p, com suporte a telas 2.5K/4K
- [x] Separação de hardware de câmeras: PTZ & Zoom exclusivo na Outdoor Pro (Poste); Câmera Fixa com áudio bidirecional e atalhos para as demais
- [x] Multiview das Câmeras (Modo 3 Colunas, 2x2 e Foco Único)
- [x] Modal avançado de controle PTZ, Zoom, Zonas Pré-definidas e Áudio Bidirecional (Ouvir & Falar PTT)
- [x] Motor de Automações & Cenas Inteligentes (Lovelace Engine) com 5 cenas pré-configuradas e 5 regras ativas em segundo plano
- [x] Pulso de Contato Seco Anti-Travamento no Portão (`executeGatePulse()` com auto-reset de 800ms) permitindo abrir e fechar confiavelmente
- [x] Watchdog Contínuo de Segurança do Portão (alerta crítico se aberto > 60s) e Watchdog de Queda de Internet WAN
- [x] CRUD Completo & Transparência Total de Cenas Inteligentes (inspeção de aparelhos, adicionar/remover ações, testar e excluir)
- [x] CRUD Completo & Transparência Total de Regras de Automação (gatilhos automáticos, processos, testes e exclusão)
- [x] Gráfico Histórico Contínuo das Últimas 24 Horas com curvas vetoriais SVG de Watts, Tensões Trifásicas e Temperatura NTC do Quadro
- [x] Sistema de Snapshots & Backup Completo em 1 Clique (JSON unificado e restauração limpa)
- [x] Webhook de Comandos de Voz compatível com Google Home, Alexa, Siri Shortcuts e automações HTTP
- [ ] Configurar a integração com o Google Home (Matter/Local Home SDK)

---

## 📍 3. Estado Atual e Próximos Passos (Multi-IDE Sync)
*Atualizado por: Antigravity*

### Concluído recentemente:
- [x] **Correção do Pulso do Portão (v0.15.0)**: O relé de contato seco agora desenergiza automaticamente após 800ms (DPS 1: true -> 800ms -> DPS 1: false), restaurando o estado de repouso e permitindo que o segundo acionamento feche o portão perfeitamente.
- [x] **Watchdog de Portão Aberto > 1 min & Queda de Conexão WAN**: Emite alerta visual e sonoro imediato se o portão permanecer aberto por mais de 60s e monitora a conectividade da residência.
- [x] **Edição, Transparência & CRUD de Cenas e Automações**: O usuário agora tem acesso completo para inspecionar quais dispositivos e ações estão configurados em cada cena e regra, podendo editar tudo, adicionar/remover aparelhos ou excluir regras existentes e padrões de fábrica.

### Próximos passos prioritários:
1. Implementar empacotador WebView Android nativo (APK com Gradle) baseado no ecossistema Artemis / Home Assistant Companion.
2. Avançar na integração direta com Google Home via Cloudflare Webhook / Home Assistant Bridge.

---

## 📂 4. Arquivos Relevantes
- `evidence/scan_results.json`: Dados brutos da descoberta UDP dos 12 dispositivos.
- `notes/05_dispositivos_descobertos.md`: Tabela com IPs, IDs, modelos e status de cada dispositivo.
- `notes/02_architecture.md`: Diagrama da arquitetura unificada (Tuya + Xiaomi + Google Home).
- `notes/03_protocols_apis.md`: Especificação dos protocolos Tuya LAN e Cloud API.
- `scripts/scan_network.py`: Scanner de rede local UDP 6666/6667.
- `scripts/check_ports.py`: Verificador de porta TCP 6668.


## Estado Atual e Próximos Passos — integração NAS (2026-10-28)

O portal completo de Antigravity permanece como aplicação principal em `reconstructed/mizin-portal`. O pacote do NAS inclui seus dispositivos, energia, cenas e câmeras; não deve ser substituído pela interface do protótipo Xiaomi.

A regressão da fala veio da leitura do inventário por expressão regular incompatível com o YAML atual. A resolução agora usa JSON estruturado, aguarda confirmação real da ponte e informa falhas em vez de simular transmissão. O envio no protocolo não comprova som audível no alto-falante.

O pacote privado do DS425+ utiliza a ponte Xiaomi Linux verificada por SHA-256, mantém os serviços em loopback e reaproveita a autenticação remota. A UI acessa a mesma origem HTTPS. O modo piloto suspende automações e comandos Tuya durante a validação, evitando execução duplicada no Windows e NAS.

As gravações usam cópia de codecs para Matroska com áudio. O destino autorizado e conferido no DSM é `/volume4/HDD 1TB - V2/Mizin-Cameras`. O teste inicial valida dez segundos de cada uma das sete visões. Somente após todos passarem o gravador tenta segmentos sucessivos de cinco minutos. O limite inicial é 100 GiB; pausa antes de esgotar o espaço e não apaga arquivos. Pode haver intervalos nas reconexões entre segmentos; monitoramento de continuidade 24h permanece pendente. A prévia do arquivo no navegador usa H.264/AAC e o download conserva o arquivo original.

O versionamento do portal passou a ser calculado a partir dos commits pelo `scripts/version-build.mjs`, com build incremental, changelog rastreável e testes de migração da versão legada. Consulte `VERSION` para o número gerado.

Próximos passos: confirmar o teste no DS425+, examinar arquivos e áudio, efetuar a troca controlada do túnel e testar o portal completo sem processos Windows. O backup ao R2 e eventual VPS ficam para a etapa seguinte. Não há publicação nem migração comprovadas por esses testes locais.


### Validação física no DS425+ e continuidade

O primeiro teste real no NAS produziu arquivos com áudio em seis visões: três HLC7 em 2304×1296/HEVC+FLAC 8 kHz, as duas CW701 em 2880×1620/HEVC+Opus 48 kHz e a AW300 Garagem em 2304×1296/HEVC+Opus 48 kHz. A AW300 Portão teve timeout UDP no NAS e abriu na ponte Windows. O relatório privado `evidence/private/nas-initial-test-status.json` registra os resultados sem substituir falhas por sucessos.

O gravador foi ajustado para validar e tentar novamente cada câmera de forma independente. A gravação contínua mantém uma conexão por visão e divide os arquivos sem encerrar o fluxo a cada cinco minutos. Um teste com FFmpeg real confirmou os 70 pacotes originais de vídeo preservados através de todos os segmentos, com áudio. A quota considera também arquivos incompletos. A validação da versão nova no NAS e a troca do túnel ainda precisam ser concluídas.
