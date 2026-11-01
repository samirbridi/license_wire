// Mapeamento Tuya -> MQTT Discovery do Home Assistant (REV: migração HA, 2026-11-01).
//
// Lógica pura, sem rede: recebe o registro de dispositivos (o mesmo JSON que /api/devices já expõe,
// sem local_key/token — ver server.mjs) e devolve as entidades MQTT Discovery equivalentes. mqtt-
// bridge-runner.mjs é quem de fato publica isso num broker; este módulo só decide o quê publicar.
//
// Um dispositivo físico vira um ou mais `topics` (um por entidade HA: switch, binary_sensor etc.),
// todos agrupados sob o mesmo `device.identifiers` para aparecerem como um cartão só no HA.
const PREFIX = 'homeassistant';
// mizin-home: nome do runtime, não confundir com o id Tuya do dispositivo (evita colisão de unique_id
// entre este bridge e qualquer outra integração MQTT que a casa já tenha).
const NODE = 'mizin_home';
// ID real do dispositivo "Campanhia" (categoria 'mal'), confirmado em server.mjs/doorbell_listener.py.
const DOORBELL_DEVICE_ID = 'eb7f7b175bf04774f0qnwh';

function baseDevice(dev) {
  return {identifiers: [`mizin_${dev.id}`], name: dev.name, manufacturer: 'Tuya', model: dev.product_name || dev.category};
}
function availability() {
  return [{topic: `${PREFIX}/${NODE}/bridge/status`, payload_available: 'online', payload_not_available: 'offline'}];
}

// Uma entidade "switch" padrão: liga/desliga por DPS booleano, com estado refletido.
function switchEntity(dev, {dpsKey = '1', objectId = dev.id, name = null, icon} = {}) {
  const uid = `mizin_${dev.id}_${objectId === dev.id ? 'switch' : objectId}`;
  return {
    component: 'switch', objectId: uid,
    config: {
      name, unique_id: uid, device: baseDevice(dev), availability: availability(),
      command_topic: `${PREFIX}/switch/${uid}/set`, state_topic: `${PREFIX}/switch/${uid}/state`,
      payload_on: 'ON', payload_off: 'OFF', state_on: 'ON', state_off: 'OFF',
      ...(icon ? {icon} : {}),
    },
    dpsKey, deviceId: dev.id,
  };
}
function binarySensorEntity(dev, {dpsKey, objectId, name = null, deviceClass} = {}) {
  const uid = `mizin_${dev.id}_${objectId}`;
  return {
    component: 'binary_sensor', objectId: uid,
    config: {
      name, unique_id: uid, device: baseDevice(dev), availability: availability(),
      state_topic: `${PREFIX}/binary_sensor/${uid}/state`, payload_on: 'ON', payload_off: 'OFF',
      ...(deviceClass ? {device_class: deviceClass} : {}),
    },
    dpsKey, deviceId: dev.id,
  };
}
// O portão é um 'cover' no vocabulário do HA (abre/para/fecha), não um switch comum: o motor físico já
// é um contato seco de pulso único (ver executeGatePulse em server.mjs), o mesmo pulso serve para abrir,
// parar e fechar dependendo do estado atual — então aqui 'open'/'close'/'stop' mandam o mesmo comando.
function gateCoverEntity(dev) {
  const uid = `mizin_${dev.id}_cover`;
  return {
    component: 'cover', objectId: uid,
    config: {
      name: null, unique_id: uid, device: baseDevice(dev), availability: availability(), device_class: 'gate',
      command_topic: `${PREFIX}/cover/${uid}/set`, state_topic: `${PREFIX}/cover/${uid}/state`,
      payload_open: 'OPEN', payload_close: 'CLOSE', payload_stop: 'STOP',
      state_open: 'open', state_closed: 'closed',
    },
    dpsKey: '3', deviceId: dev.id, kind: 'gate',
  };
}
// Fechadura (jtmspro): sem índice numérico confirmado em server.mjs para nenhum campo de desbloqueio
// (os nomes vistos em devices_registry.json["status"], ex. "unlock_fingerprint", vêm da Tuya Cloud API,
// que usa um vocabulário diferente do estado local -- mesmo erro de categoria já corrigido acima para
// os wattímetros). Sem publicar nada até confirmar a tabela de DPS local real deste dispositivo.
function lockSensors() {
  return [];
}
// Campainha (categoria 'mal', mesma do alarme SOS): NÃO é lida por DPS -- o próprio projeto já descobriu
// que o evento de toque chega só por escuta UDP bruta (doorbell_listener.py), sem data point confiável.
// Por isso vira um componente 'event' do HA (ocorrência momentânea, sem estado on/off persistente -- ver
// pesquisa sobre event.mqtt), alimentado pelo mesmo runner que hoje lê o stdout do doorbell_listener.py,
// nunca por um DPS. Detectado pelo nome porque não há campo de categoria mais específico que o separe
// do alarme "SOS Tereza", que compartilha a mesma categoria 'mal' mas não deve virar este evento.
function doorbellEvent(dev) {
  const uid = `mizin_${dev.id}_ring`;
  return {
    component: 'event', objectId: uid,
    config: {
      name: null, unique_id: uid, device: baseDevice(dev), availability: availability(),
      state_topic: `${PREFIX}/event/${uid}/state`, event_types: ['ring'], device_class: 'doorbell',
    },
    deviceId: dev.id, kind: 'doorbell-event',
  };
}
// sensor somente-leitura. `scale` divide o valor bruto do DPS (Tuya costuma mandar inteiro escalado,
// ex. décimos de V, centésimos de kWh) -- nunca assumir unidade direta sem confirmar a tabela de DPS
// do dispositivo. IMPORTANTE: estes índices numéricos são os do estado LOCAL (tinytuya/local_control.py,
// liveDeviceStatus em server.mjs), e são DIFERENTES dos nomes `code` que a Tuya Cloud API usa em
// devices_registry.json["status"] (ex: "power_total") -- as duas fontes não compartilham vocabulário.
// Confirmados só para os dois wattímetros já em uso (ver server.mjs:898-903,1541-1589); nenhum outro
// dispositivo dlq/zndb da casa deve herdar estes índices sem confirmar a própria tabela de DPS dele.
function energySensor(dev, {dpsKey, objectId, name, unit, deviceClass, stateClass, scale = 1}) {
  const uid = `mizin_${dev.id}_${objectId}`;
  return {
    component: 'sensor', objectId: uid,
    config: {
      name, unique_id: uid, device: baseDevice(dev), availability: availability(),
      state_topic: `${PREFIX}/sensor/${uid}/state`, unit_of_measurement: unit,
      device_class: deviceClass, state_class: stateClass,
    },
    dpsKey, deviceId: dev.id, numeric: true, scale,
  };
}
// IDs confirmados em server.mjs: Wattímetro Home (zndb, ebce2ea581c2690311qvem) DPS 135=potência (W,
// direto), 102/104/106=energia acumulada por fase (centésimos de kWh, soma as 3 abaixo).
const HOME_WATTMETER_DEVICE_ID = 'ebce2ea581c2690311qvem';
// Wallbox BYD / Wattímetro Gerador (dlq): DPS 118=potência (W, direto). Energia acumulada por DPS
// numérico não tem confirmação própria no código existente (só o nome Cloud errado 'total_forward_
// energy', que nunca bate contra o estado local) -- não publicada até alguém confirmar o índice certo.
function wattmeterEntities(dev) {
  if (dev.category === 'zndb' && dev.id === HOME_WATTMETER_DEVICE_ID) {
    return [
      energySensor(dev, {dpsKey: '135', objectId: 'power', name: 'Potência', unit: 'W', deviceClass: 'power', stateClass: 'measurement'}),
    ];
  }
  if (dev.category === 'dlq') {
    return [
      energySensor(dev, {dpsKey: '118', objectId: 'power', name: 'Potência', unit: 'W', deviceClass: 'power', stateClass: 'measurement'}),
    ];
  }
  return []; // zndb de outro dispositivo: índices não confirmados, melhor não publicar que publicar errado
}

// category Tuya (ver devices_registry.json) -> gerador de entidades. Sem entrada aqui, o dispositivo é
// listado mas nenhuma entidade MQTT é publicada para ele — melhor omitir do que adivinhar um DPS errado.
export function entitiesFor(dev) {
  switch (dev.category) {
    case 'ckmkzq': // Portão - Interruptor (contato seco de pulso)
      return [gateCoverEntity(dev)];
    case 'kg': // interruptores de parede, 1-2 canais
    case 'dj': // lâmpadas/tomadas Wi-Fi simples
    case 'cz': // tomadas com monitor de energia
      return [switchEntity(dev, {name: null, icon: 'mdi:power-socket-br'})];
    case 'jtmspro': // Fechadura: sem DPS local confirmado, ver lockSensors()
      return lockSensors(dev);
    case 'mal': // alarme multifuncional -- categoria compartilhada por "SOS Tereza" e "Campainha"
      // A campainha real (ID confirmado em server.mjs/doorbell_listener.py) tem evento próprio por UDP,
      // não por DPS. Qualquer outro device 'mal' (ex. o SOS) não tem DPS confirmado: nada é publicado.
      return dev.id === DOORBELL_DEVICE_ID ? [doorbellEvent(dev)] : [];
    case 'zndb': // Wattímetro Home (consumo total)
    case 'dlq': // Wallbox BYD / Wattímetro Gerador (disjuntor com medição)
      return wattmeterEntities(dev);
    default:
      return [];
  }
}

// Para todo o registro: devolve {config: [...entidades a publicar com retain]} e um index por deviceId
// para o runner saber quais tópicos de estado atualizar quando o DPS daquele dispositivo mudar.
export function buildDiscovery(devices) {
  const entities = devices.flatMap(entitiesFor);
  const byDevice = new Map();
  for (const e of entities) {
    if (!byDevice.has(e.deviceId)) byDevice.set(e.deviceId, []);
    byDevice.get(e.deviceId).push(e);
  }
  return {entities, byDevice};
}

// Converte o valor bruto do DPS (bool, number, ou o objeto live_dps inteiro vindo de /api/devices) no
// payload MQTT esperado por cada tipo de entidade. Não cobre 'doorbell-event': esse não tem DPS nenhum
// por trás, é publicado direto pelo runner quando doorbell_listener.py emite um toque via stdout.
export function statePayload(entity, dps) {
  if (entity.kind === 'doorbell-event') return null;
  const raw = dps?.[entity.dpsKey];
  if (entity.kind === 'gate') {
    if (raw === true) return 'open';
    if (raw === false) return 'closed';
    return null; // estado desconhecido: não publica (HA mantém o último retido, não assume nada)
  }
  if (entity.numeric) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    return String(raw / (entity.scale || 1));
  }
  if (typeof raw === 'boolean') return raw ? 'ON' : 'OFF';
  return null;
}
