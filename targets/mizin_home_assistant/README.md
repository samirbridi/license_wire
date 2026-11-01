# 🎯 ALVO: mizin_home_assistant

> **Descrição**: Plano e artefatos prontos para migrar o Mizin Home (Tuya local, câmeras Xiaomi, Visão
> Inteligente) para o Home Assistant, numa máquina Linux dedicada que o proprietário vai montar.
> **Versão**: `v0.3.0 (build 3)`
> **Criado em**: 2026-11-01

Este alvo não é engenharia reversa de um binário de terceiro — é planejamento e artefatos de deploy
construídos e testados, prontos para uma sessão de execução remota quando a máquina estiver pronta.
A estrutura de pastas segue a convenção do repositório (`AGENTS.md`) mesmo onde não se aplica
literalmente (ex: `ghidra/` fica vazio aqui, não há binário para decompilar).

---

## Estado atual e próximos passos

### Concluído (2026-11-01)
- [x] Decisão de hardware tomada e documentada com dados reais: detecção de objetos continua na GTX
  1660 Ti deste PC (RX 580 sem suporte ROCm oficial — ver `notes/02_decisao_hardware.md`).
- [x] `docker-compose.homeassistant.yml` pronto: Home Assistant + Mosquitto + ponte MQTT, com
  `bootstrap.sh` e `.env.example` para a primeira subida.
- [x] `mqtt-discovery.mjs` + `mqtt-bridge-runner.mjs` já commitados em `targets/tuya_smartlife` e
  **testados de ponta a ponta contra um broker Mosquitto real** (não só mock) — discovery, estado,
  comando HA→dispositivo, e o evento da campainha.
- [x] `scripts/prepare-mqtt-bridge-package.py` (em `targets/tuya_smartlife/scripts/`) empacota só a
  ponte MQTT (não o portal inteiro) para o volume `mqtt-bridge-app` do compose — testado, gera um
  pacote que de fato roda (achou e corrigiu um bug real de detecção de entrypoint no processo).
- [x] `frigate-config-homeassistant.yml`: variante do config local com MQTT ligado, validada como YAML.
- [x] Bot do Telegram para a confirmação de abertura por placa (pedido separado do proprietário) — já
  construído e commitado em `targets/tuya_smartlife`, não depende desta migração.
- [x] Vídeo ao vivo do Frigate: `config-live.yml` + `docker-compose.local-live.yml` (neste PC, GTX)
  conectando a 4 câmeras via RTSP na ponte go2rtc do NAS, com `preset-rtsp-restream` e credencial
  dedicada. **Testado de verdade**: subiu `healthy`, isolamento de falha por câmera confirmado (sem
  crash do container com a porta do NAS ainda fechada). `bridge-rtsp-enable.md` (3 linhas no
  `bridge.yaml`) e `bridge-firewall-dsm.md` (regra de firewall) documentam a parte que só o
  proprietário pode aplicar no NAS — não testada ainda, porque exige acesso que esta sessão não tem.
- [x] `docker-compose.frigate-opt-in.yml`: serviço Frigate opcional para a máquina nova, desligado por
  padrão (a recomendação continua sendo a GTX) — pronto se a decisão de hardware mudar no futuro.

### Pendente, depende da máquina física ou de ação do proprietário no NAS
- [ ] **Ação do proprietário, pode ser feita antes da máquina nova existir**: aplicar
  `bridge-rtsp-enable.md` (editar `bridge.yaml`, reiniciar o container `bridge`) e
  `bridge-firewall-dsm.md` (liberar a porta 8554 só para este PC) no NAS — depois disso, rodar
  `docker-compose.local-live.yml` aqui conecta de verdade às câmeras reais.
- [ ] Rodar `docker compose up` de verdade na máquina Linux nova (ver
  `notes/04_passo_a_passo_remoto.md` para o checklist completo, na ordem certa).
- [ ] Decisão final de onde gravar as câmeras (NAS vs. HDDs/SSD da máquina nova) — números reais de
  referência em `notes/03_cameras_no_ha.md`, decisão em aberto do proprietário.
- [ ] Validar com um teste manual real (não só os testes automatizados) que a leitura de placa nunca
  abre o portão sozinha, antes de considerar isto "em produção".

### Explicitamente fora de escopo desta rodada
- App móvel próprio: o HA Companion (Android/iOS/Wear OS/Android Auto) já cobre isso de graça — ver
  `notes/04_passo_a_passo_remoto.md`, item 6.
- Notificação acionável nativa do HA para o fluxo de placa (alternativa ao Telegram já construído):
  decisão do proprietário, não tomada ainda.

---

## Guia rápido dos arquivos

- `artifacts/` — tudo pronto para colar/rodar na máquina nova:
  - `docker-compose.homeassistant.yml` — HA + Mosquitto + ponte MQTT.
  - `docker-compose.frigate-opt-in.yml` — Frigate opcional para esta máquina, desligado por padrão.
  - `.env.example`, `bootstrap.sh`, `mosquitto/mosquitto.conf` — configuração da primeira subida.
  - `frigate-config-homeassistant.yml` — variante do config do Frigate com MQTT ligado e câmeras ao vivo.
  - `bridge-rtsp-enable.md` / `bridge-firewall-dsm.md` — as duas mudanças no NAS para ligar o vídeo ao
    vivo (ação do proprietário, pendente).
  - `mqtt-bridge-app/` — pacote empacotado (gerado, gitignored — reconstruir com
    `python targets/tuya_smartlife/scripts/prepare-mqtt-bridge-package.py`).
- `notes/01_overview.md` — pedido do proprietário (verbatim) e visão geral.
- `notes/02_decisao_hardware.md` — por que a GPU continua sendo a GTX, com números reais.
- `notes/03_cameras_no_ha.md` — como as câmeras entram no HA e a decisão de gravação em aberto.
- `notes/04_passo_a_passo_remoto.md` — checklist para a sessão de execução remota.

O código de verdade (a ponte MQTT, o bot do Telegram, a fila de confirmação de placa) mora em
`targets/tuya_smartlife/reconstructed/mizin-portal/`, não aqui — este alvo só guarda o que é específico
da migração para o HA: os artefatos de deploy e as decisões documentadas.
