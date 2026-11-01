// Ponte MQTT entre o portal Mizin Home e o broker do Home Assistant (REV: migração HA, 2026-11-01).
//
// Processo separado do portal (mesmo padrão de camera-archive-runner.mjs / r2-sync-runner.mjs): fala
// com server.mjs só por HTTP, autenticado pelo segredo em mqtt-bridge-token.json (nunca uma sessão de
// usuário). Publica MQTT Discovery uma vez ao conectar/reconectar, sincroniza estado a cada poll, e
// processa comandos (set) vindos do HA de volta para o portal. A campainha é publicada como evento
// assim que uma nova entrada dela aparece no Logbook do portal -- nunca por DPS (o toque não tem data
// point confiável, só é detectado hoje por escuta UDP bruta em doorbell_listener.py).
//
// Variáveis de ambiente (lidas só dentro de run(), nunca no import -- isso mantém o módulo testável com
// dependências 100% injetadas, sem precisar de um ambiente real configurado):
//   MIZIN_WORKSPACE, MIZIN_MQTT_URL (ex: mqtt://192.168.1.50:1883),
//   MIZIN_MQTT_USERNAME/MIZIN_MQTT_PASSWORD (opcionais), MIZIN_PORTAL_URL (ex: http://127.0.0.1:19860),
//   MIZIN_MQTT_BRIDGE_TOKEN (ou lido do arquivo gerado por scripts/generate-mqtt-bridge-token.mjs).
import mqttLib from 'mqtt';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildDiscovery, statePayload} from './mqtt-discovery.mjs';

const PREFIX = 'homeassistant';
const NODE = 'mizin_home';
const STATUS_TOPIC = `${PREFIX}/${NODE}/bridge/status`;
const DOORBELL_DEVICE_ID = 'eb7f7b175bf04774f0qnwh';

function resolveBridgeToken(workspace) {
  if (process.env.MIZIN_MQTT_BRIDGE_TOKEN) return process.env.MIZIN_MQTT_BRIDGE_TOKEN;
  try { return JSON.parse(readFileSync(join(workspace, 'targets/tuya_smartlife/runtime/mqtt-bridge-token.json'), 'utf8')).token; }
  catch { throw new Error('Token da ponte MQTT não encontrado; rode scripts/generate-mqtt-bridge-token.mjs primeiro.'); }
}

export async function run({
  mqttClient = null,
  devicesFetcher = null,
  commandSender = null,
  pollMs = Number(process.env.MIZIN_MQTT_POLL_MS || 5000),
  doorbellPollMs = 3000,
  onLog = console.log,
} = {}) {
  const portalUrl = process.env.MIZIN_PORTAL_URL || 'http://127.0.0.1:19860';
  // Só resolve token/URL do broker quando de fato precisar criar algo (fetcher/sender/client padrão não
  // foram injetados) -- um teste que injeta os três nunca toca o ambiente real nem arquivos em disco.
  const bridgeToken = (devicesFetcher && commandSender && mqttClient) ? null : resolveBridgeToken(process.env.MIZIN_WORKSPACE || (() => { throw new Error('MIZIN_WORKSPACE não configurado.'); })());

  const fetchDevices = devicesFetcher || (async () => {
    const resp = await fetch(`${portalUrl}/api/mqtt-bridge/devices`, {headers: {'x-mqtt-bridge-token': bridgeToken}});
    if (!resp.ok) throw new Error(`Portal respondeu ${resp.status} em /api/mqtt-bridge/devices`);
    return resp.json();
  });
  const sendCommand = commandSender || (async (devId, dps, value) => {
    const resp = await fetch(`${portalUrl}/api/mqtt-bridge/command`, {
      method: 'POST', headers: {'Content-Type': 'application/json', 'x-mqtt-bridge-token': bridgeToken},
      body: JSON.stringify({devId, dps, value}),
    });
    if (!resp.ok) throw new Error(`Portal respondeu ${resp.status} em /api/mqtt-bridge/command`);
    return resp.json();
  });
  const client = mqttClient || (() => {
    const mqttUrl = process.env.MIZIN_MQTT_URL;
    if (!mqttUrl) throw new Error('MIZIN_MQTT_URL não configurado (ex: mqtt://192.168.1.50:1883).');
    return mqttLib.connect(mqttUrl, {
      username: process.env.MIZIN_MQTT_USERNAME || undefined,
      password: process.env.MIZIN_MQTT_PASSWORD || undefined,
      will: {topic: STATUS_TOPIC, payload: 'offline', retain: true, qos: 1},
    });
  })();

  let discovery = {entities: [], byDevice: new Map()};
  const entityByObjectId = new Map(); // objectId -> entity, para rotear command_topic -> dpsKey

  function publishDiscovery(entities) {
    for (const ent of entities) {
      client.publish(`${PREFIX}/${ent.component}/${ent.objectId}/config`, JSON.stringify(ent.config), {retain: true, qos: 1});
      entityByObjectId.set(ent.objectId, ent);
      if (ent.config.command_topic) client.subscribe(ent.config.command_topic, {qos: 1});
    }
  }

  function publishStates(devices) {
    const byId = new Map(devices.map(d => [d.id, d]));
    for (const [deviceId, entities] of discovery.byDevice) {
      const dev = byId.get(deviceId);
      const dps = dev?.live_dps;
      for (const ent of entities) {
        if (ent.kind === 'doorbell-event') continue; // publicado só quando o evento real acontece
        const payload = statePayload(ent, dps);
        if (payload !== null) client.publish(ent.config.state_topic, payload, {retain: true, qos: 1});
      }
    }
  }

  async function poll() {
    try {
      const devices = await fetchDevices();
      const fresh = buildDiscovery(devices);
      // Só republica discovery quando o conjunto de tópicos muda (dispositivo novo/removido): republicar
      // tudo a cada poll fica ruidoso no broker e reinicia o estado "unknown" de cada entidade no HA à toa.
      const freshIds = fresh.entities.map(e => e.objectId).sort().join(',');
      const currentIds = discovery.entities.map(e => e.objectId).sort().join(',');
      if (freshIds !== currentIds) { discovery = fresh; publishDiscovery(fresh.entities); }
      publishStates(devices);
    } catch (err) {
      onLog(`[mqtt-bridge] Falha ao sincronizar: ${err.message}`);
    }
  }

  client.on('connect', () => {
    onLog('[mqtt-bridge] Conectado ao broker MQTT.');
    client.publish(STATUS_TOPIC, 'online', {retain: true, qos: 1});
    poll();
  });

  client.on('message', async (topic, payload) => {
    const text = payload.toString();
    for (const ent of entityByObjectId.values()) {
      if (ent.config.command_topic !== topic) continue;
      try {
        let value;
        if (ent.kind === 'gate') {
          if (text === 'STOP') continue; // sem DPS de "parar" isolado confirmado; abrir/fechar usam o mesmo pulso
          value = true; // OPEN ou CLOSE: o motor físico é um pulso único que alterna estado (ver executeGatePulse)
        } else {
          value = text === 'ON';
        }
        await sendCommand(ent.deviceId, ent.dpsKey, value);
      } catch (err) {
        onLog(`[mqtt-bridge] Falha ao executar comando de ${topic}: ${err.message}`);
      }
    }
  });

  // Campainha: nenhum DPS confiável existe para o toque (ver mqtt-discovery.mjs). O runner observa o
  // Logbook do próprio portal (que já recebe o evento via doorbell_listener.py) e publica 'ring' só
  // quando aparece uma entrada NOVA da campainha desde a última checagem -- nunca na primeira leitura
  // (evitaria publicar um "toque" fantasma referente a um evento antigo, de antes do processo subir).
  let lastDoorbellLogId = null;
  async function pollDoorbell() {
    try {
      const resp = await fetch(`${portalUrl}/api/logs?limit=5`);
      if (!resp.ok) return;
      const {logs} = await resp.json();
      const latest = logs?.find(l => l.devId === DOORBELL_DEVICE_ID);
      if (latest && latest.id !== lastDoorbellLogId) {
        if (lastDoorbellLogId !== null) client.publish(`${PREFIX}/event/mizin_${DOORBELL_DEVICE_ID}_ring/state`, JSON.stringify({event_type: 'ring'}), {qos: 1});
        lastDoorbellLogId = latest.id;
      }
    } catch (err) {
      onLog(`[mqtt-bridge] Falha ao checar campainha: ${err.message}`);
    }
  }

  const pollTimer = setInterval(poll, pollMs);
  const doorbellTimer = setInterval(pollDoorbell, doorbellPollMs);
  return {
    client,
    stop() {
      clearInterval(pollTimer);
      clearInterval(doorbellTimer);
      client.publish(STATUS_TOPIC, 'offline', {retain: true, qos: 1});
      client.end();
    },
    // Exposto para teste: força um ciclo sem esperar o timer.
    _poll: poll,
    _pollDoorbell: pollDoorbell,
    _discovery: () => discovery,
  };
}

// pathToFileURL (não um replace manual de barras) lida corretamente com espaços e outros caracteres
// especiais no caminho -- achado testando o pacote empacotado de verdade (prepare-mqtt-bridge-package.py)
// rodado como entrypoint direto: a comparação ingênua nunca batia e o processo saía sem fazer nada,
// sem erro nenhum visível, porque argv[1] pode ser relativo enquanto import.meta.url é sempre absoluto.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bridge = await run();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { bridge.stop(); process.exit(0); });
}
