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

Atualização em preparação: autenticação própria com usuário/e-mail e senha, TOTP, passkeys e recuperação pelo administrador. Convidados podem visualizar e usar os controles cotidianos; alterações de configuração e usuários ficam restritas ao administrador. O painel completo anterior foi preservado em `portal-shell.html`, entregue somente depois da autenticação; a página pública passou a ser o login. O primeiro administrador deve criar pessoalmente sua senha pelo link privado `identity/owner-setup.json` no NAS.

A retenção autorizada organiza arquivos originais por câmera/ano/mês/dia no fuso de São Paulo. A quota proposta é 750 GiB, limpeza aos 92% até 85%, reserva física de 50 GiB, protegendo arquivos em gravação, desconhecidos e concluídos há menos de 15 minutos. A migração preserva o snapshot atual do NAS, sem reintroduzir dados antigos do Windows. A instalação efetiva no Volume 4 e a publicação serão registradas após validação real.

O bucket privado `homecams-recordings` foi criado no R2 Standard. O sincronizador está implementado, mas permanece desativado até existirem credenciais S3 exclusivas desse bucket: limite de 120 GiB, 600 mil operações conservadoras por mês, envio a 1 MiB/s, verificação de SHA-256/ETag/tamanho e pausa após três falhas. A estimativa conservadora adicional é R$47,57/mês a R$7/US$, sem presumir franquias gratuitas disponíveis; não é um teto de faturamento imposto pela Cloudflare. O transporte para a nuvem ainda precisa de teste com credenciais reais. A importação do acervo histórico dos cartões SD continua pendente; gravar o fluxo ao vivo não equivale a copiar arquivos antigos do SD.

Um WebSocket autenticado distribui leituras do painel a cada cinco segundos e encerra acessos revogados. Isso reduz as requisições periódicas ao Worker, sem assumir que o R2 pago inclua um plano Workers pago. Referências: [R2](https://developers.cloudflare.com/r2/pricing/), [limites Workers](https://developers.cloudflare.com/workers/platform/limits/). Os registros de build e QA distinguem testes locais de validação no NAS, de continuidade por 24h e da confirmação física da fala.

O portal completo de Antigravity permanece como aplicação principal em `reconstructed/mizin-portal`. O pacote do NAS inclui seus dispositivos, energia, cenas e câmeras; não deve ser substituído pela interface do protótipo Xiaomi.

A regressão da fala veio da leitura do inventário por expressão regular incompatível com o YAML atual. A resolução agora usa JSON estruturado, aguarda confirmação real da ponte e informa falhas em vez de simular transmissão. O envio no protocolo não comprova som audível no alto-falante.

O pacote privado do DS425+ utiliza a ponte Xiaomi Linux verificada por SHA-256, mantém os serviços em loopback e reaproveita a autenticação remota. A UI acessa a mesma origem HTTPS. O modo piloto suspende automações e comandos Tuya durante a validação, evitando execução duplicada no Windows e NAS.

As gravações usam cópia de vídeo para Matroska com áudio. O destino autorizado e conferido no DSM é `/volume4/HDD 1TB - V2/Mizin-Cameras`. Cada visão passa por um teste independente de dez segundos; as aprovadas iniciam gravação contínua e as demais tentam novamente. Uma conexão permanece aberta entre segmentos, com alvo de cinco minutos; o corte depende dos quadros-chave da câmera e pode gerar arquivos mais longos. O limite inicial é 100 GiB, com reserva de 2 GiB livres e sem apagar arquivos. A prévia no navegador usa H.264/AAC; o download preserva o arquivo armazenado. Continuidade por 24h e política definitiva de retenção permanecem pendentes.

O versionamento do portal passou a ser calculado a partir dos commits pelo `scripts/version-build.mjs`, com build incremental, changelog rastreável e testes de migração da versão legada. Consulte `VERSION` para o número gerado.

Próximos passos: confirmar fisicamente a fala, estabilizar a gravação e a reprodução simultânea das duas visões da Outdoor e medir continuidade por 24h. O backup ao R2 e eventual VPS ficam para a etapa seguinte.


### Validação física no DS425+ e continuidade

O primeiro teste real no NAS produziu arquivos com áudio em seis visões: três HLC7 em 2304×1296/HEVC+FLAC 8 kHz, as duas CW701 em 2880×1620/HEVC+Opus 48 kHz e a AW300 Garagem em 2304×1296/HEVC+Opus 48 kHz. A AW300 Portão teve timeout UDP no NAS e abriu na ponte Windows. O relatório privado `evidence/private/nas-initial-test-status.json` registra os resultados sem substituir falhas por sucessos.

O gravador foi ajustado para validar e tentar novamente cada câmera de forma independente. Um teste com FFmpeg real confirmou os 70 pacotes originais de vídeo preservados através dos segmentos, com áudio. A quota considera arquivos incompletos e tolera ENOENT quando um segmento é renomeado durante a medição; erros de permissão continuam sendo reportados.

### Publicação do portal completo — build 0039

O portal completo está publicado em `https://homecams.pages.dev`, com login e backend no DS425+. A passagem privada Cloudflare `homecams-portal` aponta para `127.0.0.1:19860`, com Worker `homecams-portal-gateway`. O túnel roda no NAS e não requer portas abertas no roteador. Comandos e automações existentes foram reativados após autorização explícita do usuário.

O projeto `mizin-home` mantém os dados e a ponte em `/volume1/docker/nas-portal-build-0036`; o contexto da imagem atual é `../nas-portal-build-0039/app`. O arquivo anterior foi preservado como `compose-build0038-backup.yaml`. Uma referência antiga do Container Manager ao gravador foi corrigida reiniciando o pacote oficial; a criação final terminou com código zero e imagem `a6dfa60b209d`.

O login público, os estados dos 24 aparelhos cadastrados, seis prévias de câmeras e reprodução de vídeo a 1280×720 foram verificados no navegador. Uma gravação real da Outdoor foi reproduzida e baixada pelo portal: HEVC 2880×1620, Opus 48 kHz estéreo, 10,023 s, 1.215.925 bytes. SHA-256: `d650e704c86075ed911a93950217d11f11053ee81bf13fb559ab3cb896076e75`.

A API apresentava 154 arquivos e modo contínuo na amostra. A inspeção dos arquivos abertos confirmou seis escritores com atualizações de 0 a 6 segundos: as três Mi 2K, as duas AW300 e a visão secundária da Outdoor. A visão principal da Outdoor produziu arquivos válidos, mas não havia escritor ativo na amostra, apesar do status `recording`: esse estado não comprova continuidade e precisa de investigação. A dupla visão ao vivo também não está completamente validada. A leitura de capacidade do SD da Outdoor respondeu; busca, reprodução e exportação de SD em todos os modelos exigem validação adicional.

As pontes do Windows e seus túneis foram encerrados, e não havia ouvintes nas portas 19843/19845/19846/19853/19860/19861 na verificação. A inicialização `Iniciar-Mizin-Permanente.vbs` foi renomeada reversivelmente com sufixo `.disabled-nas-migration-20261028`. Não reativar o guardian Windows nem publicar a interface do protótipo Xiaomi sobre este portal. O NAS e a internet precisam permanecer ligados.

O convite inicial fica no File Station, em `docker/nas-portal-build-0036/data/xiaomi/runtime/central/owner-remote-access.json`; é privado, de uso único e renovado a cada oito minutos. O navegador de entrega já foi conectado, sem expor o código no chat. Não publicar pacotes ZIP privados, sessões, chaves ou vídeos de teste. Evidências sanitizadas: `evidence/nas-integration-20261028.json`; dados detalhados ficam em `evidence/private/`.
