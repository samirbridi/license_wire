# 04 — Checklist para a sessão de execução remota

O proprietário pediu para executar isto remotamente assim que a máquina Linux nova estiver pronta. Esta
é a ordem recomendada — cada passo depende do anterior ter funcionado, então pare e confirme antes de
seguir se algo não bater com o esperado.

## 0. Antes de começar: o que eu (Claude) preciso que esteja pronto

- Acesso remoto à máquina nova (SSH, ou o que o ambiente de execução remota desta sessão permitir).
- Docker e Docker Compose já instalados na máquina (não cobre isso aqui — é passo de SO).
- Confirmação de qual decisão de gravação foi tomada (ver `03_cameras_no_ha.md`) — isso muda se o
  `recorder` precisa ou não subir nesta máquina.

## 1. Home Assistant + MQTT (base, sem dependência de câmera/IA)

```bash
cd targets/mizin_home_assistant/artifacts
cp .env.example .env
# editar .env: TZ, MIZIN_MQTT_USERNAME/PASSWORD, MIZIN_PORTAL_URL, MIZIN_MQTT_BRIDGE_TOKEN
bash bootstrap.sh   # gera mosquitto/passwd a partir da senha do .env
docker compose -f docker-compose.homeassistant.yml up -d
```

Verificar: `http://<maquina>:8123` abre o assistente de boas-vindas do HA. `docker logs mizin-mqtt-bridge`
mostra `[mqtt-bridge] Conectado ao broker MQTT.` sem erro de `fetch failed` repetido (se aparecer,
confirmar que `MIZIN_PORTAL_URL` e `MIZIN_MQTT_BRIDGE_TOKEN` no `.env` estão certos — o token precisa
ser o MESMO gerado do lado do portal/NAS).

## 2. Gerar/confirmar o token da ponte MQTT, do lado do portal

Isto roda no lado do NAS/repositório, não na máquina nova:

```bash
node targets/tuya_smartlife/scripts/generate-mqtt-bridge-token.mjs
# copia o campo "token" de targets/tuya_smartlife/runtime/mqtt-bridge-token.json para o .env da máquina nova
```

Se o token já existe (gerado nesta sessão, 2026-11-01), o script não sobrescreve — só confirma que já
existe e mostra o caminho do arquivo.

## 3. Confirmar os dispositivos Tuya aparecendo no HA

Depois do passo 1, dentro de ~5s (ciclo de poll do `mqtt-bridge-runner.mjs`) os dispositivos devem
aparecer sozinhos no HA via MQTT Discovery — nenhuma configuração manual de entidade necessária.
Conferir: Settings → Devices & Services → MQTT → deve listar os dispositivos (nomeados "mizin_<nome>").
Testar especificamente o portão (`cover`) com um clique de Abrir, e confirmar no Logbook do portal
(`https://homecams.pages.dev`, aba Atividades) que o evento "Acionamento de Pulso" apareceu com origem
"Home Assistant".

## 4. Câmeras (dividir em dois grupos, ver `03_cameras_no_ha.md`)

- **Mi2K (Externa/Sala/Estúdio)**: via integração "Generic Camera" nativa do HA, apontando para a ponte
  go2rtc do NAS. Não depende do Frigate.
- **AW300/Outdoor (escopo de segurança)**: via Frigate + integração oficial HACS. Decisão de onde o
  Frigate roda (GTX deste PC vs. a máquina nova) já tomada em `02_decisao_hardware.md` — recomendação é
  manter na GTX por enquanto.

### 4a. Ligar o vídeo ao vivo do Frigate (independente da máquina nova — roda neste PC)

Não depende de o Home Assistant existir ainda; pode ser feito a qualquer momento. Ordem exata, cada
passo depende do anterior:

1. **`artifacts/bridge-rtsp-enable.md`** — editar `bridge.yaml` no NAS (3 linhas: ligar RTSP, definir
   usuário/senha) e reiniciar o container `bridge` no Container Manager.
2. **`artifacts/bridge-firewall-dsm.md`** — liberar a porta 8554 só para este PC no firewall do DSM
   (mesma decisão já aprovada por você: "abrir porta só para este PC").
3. Neste PC, em `targets/tuya_smartlife/reconstructed/mizin-vision/`:
   ```bash
   cp .env.live.example .env.live
   # editar .env.live: a MESMA senha definida no bridge.yaml (passo 1)
   docker compose -f docker-compose.local.yml down        # para o banco de testes com amostras
   docker compose -f docker-compose.local-live.yml --env-file .env.live up -d
   ```
4. Verificar: `curl http://127.0.0.1:5005/api/stats` deve mostrar `"connection_quality"` diferente de
   `"unusable"` para as 4 câmeras, com `camera_fps` > 0 depois de alguns segundos. Se continuar
   `"unusable"` com `reconnects_last_hour` subindo, os passos 1-2 não foram aplicados corretamente —
   confira primeiro com `ffprobe` direto (comando no final de `bridge-rtsp-enable.md`) antes de suspeitar
   do Frigate.

**Testado nesta sessão** (1/11/2026): o config e o compose de "ao vivo" foram validados de ponta a ponta
— suberam com `healthy`, as 4 câmeras tentando conectar na porta 8554 do NAS (ainda fechada no momento
do teste) com reconexão automática isolada por câmera, sem crash do container. Container restaurado ao
estado original (amostras em loop) depois do teste. **Não testado**: a conexão RTSP de fato funcionando
contra o `bridge.yaml` real, porque os passos 1-2 (editar o NAS, liberar o firewall) ainda não foram
aplicados — essa é a parte que só você pode fazer.

Se Frigate acabar rodando na máquina nova em vez de aqui (mudança de `02_decisao_hardware.md`), usar
`artifacts/frigate-config-homeassistant.yml` como base em vez de `config-live.yml`, trocando
`hwaccel_args` para `preset-vaapi`.

## 5. Validar a regra de segurança da placa antes de qualquer coisa ao vivo

Antes de considerar isto "em produção": confirmar de novo, com um teste real (não só revisão de
código), que uma leitura de placa nunca abre o portão sozinha — só gera notificação pendente. Os testes
automatizados (`plate-gate.test.mjs`) já cobrem isso, mas vale um teste manual ponta a ponta com uma
placa real antes de declarar pronto.

## 6. O que fica como próximo passo, não desta sessão de execução

- App móvel: o HA Companion já cobre isso de graça (Android/iOS, Wear OS, Android Auto) — não precisa
  construir nada, só instalar o app e apontar para a URL do HA.
- Notificação acionável (Abrir/Ignorar direto da notificação do HA, para o fluxo de placa): usar o
  blueprint/padrão de "actionable notification" do HA, perguntar ao proprietário se prefere manter o
  caminho Telegram já construído em paralelo ou migrar esse fluxo específico para notificação nativa do
  HA Companion.
