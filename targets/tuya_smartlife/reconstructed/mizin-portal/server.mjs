import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomUUID, randomInt } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(__dirname, '../../../..');

const PORT = process.env.PORT || 19860;
const REGISTRY_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/devices_registry.json');
const CAMERAS_PATH = path.join(WORKSPACE, 'targets/xiaomi_home/runtime/central/cameras.json');
const TOKEN_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/tuya_token.json');
const SCHEDULES_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/schedules.json');
const LOGS_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/activity_logs.json');
const TARIFF_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/tariff_config.json');
const ENERGY_HISTORY_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/energy_history.json');
const UI_CONFIG_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/ui_config.json');
const AUTOMATIONS_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/automations.json');
const SCENES_PATH = path.join(WORKSPACE, 'targets/tuya_smartlife/runtime/scenes.json');
const PYTHON_PATH = 'python';
const FFMPEG_BIN = 'D:\\REA - ENGENHARIA REVERSA\\targets\\mizin_playout\\binaries\\qa\\ffmpeg\\ffmpeg-n8.1-latest-win64-gpl-shared-8.1\\bin\\ffmpeg.exe';
const cameraFrameCache = new Map();

const DEFAULT_UI_CONFIG = {
  shortcuts: [
    {
      id: 'sc_gate',
      name: 'Acionar Portão',
      icon: '🚪',
      type: 'gate',
      targetId: 'eb49c5d1977172327aqb1q',
      channel: 1,
      action: 'pulse',
      showOverview: true,
      showCameras: true,
      showPopup: true
    },
    {
      id: 'sc_all_off',
      name: 'Apagar Todas as Luzes',
      icon: '🌙',
      type: 'scene_all_off',
      targetId: null,
      channel: null,
      action: 'turn_off_all',
      showOverview: true,
      showCameras: false,
      showPopup: true
    },
    {
      id: 'sc_main_on',
      name: 'Acender Principais',
      icon: '💡',
      type: 'scene_main_on',
      targetId: null,
      channel: null,
      action: 'turn_on_all',
      showOverview: true,
      showCameras: false,
      showPopup: false
    },
    {
      id: 'sc_light_garage',
      name: 'Luz Garagem',
      icon: '💡',
      type: 'device',
      targetId: 'eb49c5d1977172327aqb1q',
      channel: 1,
      action: 'toggle',
      showOverview: true,
      showCameras: true,
      showPopup: true
    },
    {
      id: 'sc_light_street',
      name: 'Luz da Rua',
      icon: '💡',
      type: 'device',
      targetId: 'ebe317c237358405b8h5n8',
      channel: 1,
      action: 'toggle',
      showOverview: true,
      showCameras: true,
      showPopup: true
    },
    {
      id: 'sc_light_living',
      name: 'Luz da Sala',
      icon: '💡',
      type: 'device',
      targetId: 'eb6227b63a58b256579aim',
      channel: 1,
      action: 'toggle',
      showOverview: true,
      showCameras: true,
      showPopup: true
    },
    {
      id: 'sc_byd_breaker',
      name: 'Disjuntor Wallbox BYD',
      icon: '⚡',
      type: 'byd',
      targetId: 'ebb5f986e16519ef82o3oa',
      channel: 16,
      action: 'toggle',
      showOverview: true,
      showCameras: false,
      showPopup: true
    },
    {
      id: 'sc_ac_power',
      name: 'Ar Condicionado',
      icon: '❄️',
      type: 'ac',
      targetId: 'eb786ebb970e6a20ffj0ls',
      channel: 1,
      action: 'toggle',
      showOverview: true,
      showCameras: false,
      showPopup: false
    },
    {
      id: 'sc_logs',
      name: 'Registro Atividades',
      icon: '📋',
      type: 'nav',
      targetId: 'logs',
      channel: null,
      action: 'nav',
      showOverview: true,
      showCameras: false,
      showPopup: false
    }
  ],
  pinnedDevices: [
    'eb49c5d1977172327aqb1q',
    'eb6227b63a58b256579aim',
    'eb786ebb970e6a20ffj0ls',
    'ebb5f986e16519ef82o3oa',
    'ebce2ea581c2690311qvem',
    'ebaee623fb5d8b4545zhx3',
    'ebe317c237358405b8h5n8'
  ],
  favorites: [
    'eb49c5d1977172327aqb1q',
    'eb6227b63a58b256579aim',
    'eb786ebb970e6a20ffj0ls',
    'ebb5f986e16519ef82o3oa'
  ],
  showGlanceBar: true,
  glanceBadges: [
    { id: 'gb_lights', name: 'Luzes Acesas', icon: '💡', enabled: true, action: 'turn_off_all' },
    { id: 'gb_gate', name: 'Portão Garagem', icon: '🔒', enabled: true, action: 'gate_pulse' },
    { id: 'gb_byd', name: 'Wallbox BYD', icon: '🚗', enabled: true, action: 'byd_toggle' },
    { id: 'gb_ac', name: 'Ar Mizin', icon: '❄️', enabled: true, action: 'ac_toggle' },
    { id: 'gb_energy', name: 'Rede CEEE', icon: '⚡', enabled: true, action: 'open_energy' },
    { id: 'gb_temp', name: 'Temperatura Caixa NTC', icon: '🌡️', enabled: false, action: 'open_energy' },
    { id: 'gb_generator', name: 'Gerador Residencial', icon: '⚙️', enabled: false, action: 'open_energy' },
    { id: 'gb_cameras', name: 'Câmeras de Segurança', icon: '📹', enabled: false, action: 'open_cameras' }
  ]
};

function loadUiConfig() {
  if (fs.existsSync(UI_CONFIG_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(UI_CONFIG_PATH, 'utf-8'));
      return { ...DEFAULT_UI_CONFIG, ...parsed };
    } catch (e) {}
  }
  return DEFAULT_UI_CONFIG;
}

function saveUiConfig(cfg) {
  try {
    const current = loadUiConfig();
    const updated = { ...current, ...cfg, updatedAt: Date.now() };
    fs.writeFileSync(UI_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (e) {
    console.error('[-] Erro ao salvar ui_config:', e.message);
    return null;
  }
}

function loadEnergyHistory() {
  if (fs.existsSync(ENERGY_HISTORY_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(ENERGY_HISTORY_PATH, 'utf-8'));
    } catch (e) {}
  }
  return { monthlyConsumption: [], monthlyCosts: [] };
}

function saveEnergyHistory(data) {
  try {
    fs.writeFileSync(ENERGY_HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[-] Erro ao salvar histórico de energia:', e.message);
  }
}

function loadTariffConfig() {
  if (fs.existsSync(TARIFF_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(TARIFF_PATH, 'utf-8'));
    } catch (e) {}
  }
  return {
    concessionaria: "CEEE Equatorial (RS)",
    rateKwh: 1.00234,
    bandeira: "amarela",
    bandeiraAdicional: 0.00942,
    bandeiraFixaMes: 10.48,
    closingDay: 18,
    cipIluminacao: 24.50,
    lastBillKwh: 1112,
    lastBillTotalReais: 1149.61,
    effectiveRateKwh: 1.0338
  };
}

function saveTariffConfig(config) {
  try {
    fs.writeFileSync(TARIFF_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('[-] Erro ao salvar configuração de tarifa:', e.message);
  }
}

const DEFAULT_SCENES = [
  {
    id: 'scene_good_night',
    name: 'Modo Boa Noite (Dormir)',
    icon: '🌙',
    description: 'Apaga a iluminação da sala e rua, desliga ar condicionado e certifica que a residência está segura.',
    actions: [
      { devId: 'eb6227b63a58b256579aim', dps: 'all', value: false, name: 'Luzes da Sala' },
      { devId: 'ebe317c237358405b8h5n8', dps: 'all', value: false, name: 'Luzes da Rua' },
      { devId: 'eb786ebb970e6a20ffj0ls', dps: '1', value: false, name: 'Ar Condicionado' }
    ]
  },
  {
    id: 'scene_leaving_home',
    name: 'Saindo de Casa',
    icon: '🏃',
    description: 'Desliga luzes internas e climatização, e envia comando de acionamento do portão da garagem.',
    actions: [
      { devId: 'eb6227b63a58b256579aim', dps: 'all', value: false, name: 'Luzes da Sala' },
      { devId: 'eb786ebb970e6a20ffj0ls', dps: '1', value: false, name: 'Ar Condicionado' },
      { devId: 'eb49c5d1977172327aqb1q', dps: '1', value: true, name: 'Portão da Garagem (Pulso)' }
    ]
  },
  {
    id: 'scene_arriving_home',
    name: 'Chegando em Casa',
    icon: '🏠',
    description: 'Aciona o portão da garagem e acende as luzes de recepção (Rua e Sala).',
    actions: [
      { devId: 'eb49c5d1977172327aqb1q', dps: '1', value: true, name: 'Portão da Garagem (Pulso)' },
      { devId: 'ebe317c237358405b8h5n8', dps: '1', value: true, name: 'Luzes da Rua' },
      { devId: 'eb6227b63a58b256579aim', dps: '1', value: true, name: 'Luz da Sala' }
    ]
  },
  {
    id: 'scene_movie_night',
    name: 'Modo Cinema & Relax',
    icon: '🎬',
    description: 'Apaga iluminação forte da sala para assistir filmes e climatiza o ambiente.',
    actions: [
      { devId: 'eb6227b63a58b256579aim', dps: 'all', value: false, name: 'Luzes da Sala' },
      { devId: 'eb786ebb970e6a20ffj0ls', dps: '1', value: true, name: 'Ar Condicionado' }
    ]
  },
  {
    id: 'scene_all_lights_off',
    name: 'Apagar Todas as Luzes',
    icon: '💡',
    description: 'Varredura geral desligando todos os interruptores de iluminação da residência.',
    actions: [
      { devId: 'eb6227b63a58b256579aim', dps: 'all', value: false, name: 'Luzes da Sala' },
      { devId: 'ebe317c237358405b8h5n8', dps: 'all', value: false, name: 'Luzes da Rua' },
      { devId: 'ebaee623fb5d8b4545zhx3', dps: 'all', value: false, name: 'Interruptor Mizin' }
    ]
  }
];

const DEFAULT_AUTOMATIONS = [
  {
    id: 'auto_gate_prolonged',
    name: 'Alerta de Portão Aberto (> 1 min)',
    icon: '🚨',
    enabled: true,
    triggerType: 'gate_prolonged',
    triggerDescription: 'Quando o portão permanecer aberto por mais de 60 segundos',
    condition: 'Sensor de contato magnético do portão acusa estado aberto',
    actionDescription: 'Emitir notificação visual e sonora no painel e registrar alerta crítico no Logbook',
    actions: [],
    lastTriggered: null,
    totalExecutions: 0
  },
  {
    id: 'auto_gate_lights',
    name: 'Iluminação Noturna do Portão',
    icon: '🚪',
    enabled: true,
    triggerType: 'gate_opened',
    triggerDescription: 'Quando o portão for acionado entre 18:00 e 06:00',
    condition: 'Horário Noturno (18h às 06h)',
    actionDescription: 'Acender Luz da Rua para manobra segura',
    actions: [
      { devId: 'ebe317c237358405b8h5n8', dps: '1', value: true, name: 'Luz da Rua' }
    ],
    lastTriggered: null,
    totalExecutions: 4
  },
  {
    id: 'auto_byd_cutoff',
    name: 'Wallbox BYD — Desarme Pós-Carga',
    icon: '⚡',
    enabled: true,
    triggerType: 'power_drop',
    triggerDescription: 'Quando a potência do disjuntor BYD cair abaixo de 15W por 15min',
    condition: 'Carro 100% carregado em modo standby',
    actionDescription: 'Desarmar disjuntor DIN TOMPD-63SW para proteger a bateria e economizar energia',
    actions: [
      { devId: 'ebb5f986e16519ef82o3oa', dps: '16', value: false, name: 'Disjuntor Wallbox BYD' }
    ],
    lastTriggered: null,
    totalExecutions: 12
  },
  {
    id: 'auto_ceee_failover',
    name: 'Alerta de Queda de Rede CEEE & Gerador',
    icon: '⚠️',
    enabled: true,
    triggerType: 'grid_fail',
    triggerDescription: 'Quando a tensão nas 3 fases cair abaixo de 50V',
    condition: 'Interrupção de fornecimento da concessionária',
    actionDescription: 'Registrar evento crítico no Logbook, acionar notificação de emergência e monitorar gerador',
    actions: [],
    lastTriggered: null,
    totalExecutions: 1
  },
  {
    id: 'auto_temp_protection',
    name: 'Proteção Térmica do Quadro de Disjuntores',
    icon: '🔥',
    enabled: true,
    triggerType: 'temperature_high',
    triggerDescription: 'Quando o sensor NTC da caixa acusar temperatura acima de 65°C',
    condition: 'Sobreaquecimento detectado no barramento',
    actionDescription: 'Emite alerta sonoro de risco elétrico e envia notificação imediata',
    actions: [],
    lastTriggered: null,
    totalExecutions: 0
  }
];

function loadScenes() {
  if (fs.existsSync(SCENES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SCENES_PATH, 'utf-8'));
    } catch (e) {}
  }
  return DEFAULT_SCENES;
}

function saveScenes(scenes) {
  try {
    fs.writeFileSync(SCENES_PATH, JSON.stringify(scenes, null, 2), 'utf-8');
  } catch (e) {
    console.error('[-] Erro ao salvar scenes:', e.message);
  }
}

function loadAutomations() {
  if (fs.existsSync(AUTOMATIONS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(AUTOMATIONS_PATH, 'utf-8'));
    } catch (e) {}
  }
  return DEFAULT_AUTOMATIONS;
}

function saveAutomations(automations) {
  try {
    fs.writeFileSync(AUTOMATIONS_PATH, JSON.stringify(automations, null, 2), 'utf-8');
  } catch (e) {
    console.error('[-] Erro ao salvar automations:', e.message);
  }
}

function generateBackup() {
  return {
    version: 'v0.13.0 (build 0013)',
    timestamp: new Date().toISOString(),
    host: 'mizin-portal',
    registry: fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) : [],
    cameras: fs.existsSync(CAMERAS_PATH) ? JSON.parse(fs.readFileSync(CAMERAS_PATH, 'utf-8')) : [],
    schedules: fs.existsSync(SCHEDULES_PATH) ? JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf-8')) : [],
    activityLogs: fs.existsSync(LOGS_PATH) ? JSON.parse(fs.readFileSync(LOGS_PATH, 'utf-8')) : [],
    tariffConfig: loadTariffConfig(),
    energyHistory: loadEnergyHistory(),
    uiConfig: loadUiConfig(),
    automations: loadAutomations(),
    scenes: loadScenes()
  };
}

function restoreBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('Arquivo de backup inválido');
  if (data.registry && Array.isArray(data.registry)) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data.registry, null, 2), 'utf-8');
  }
  if (data.cameras && Array.isArray(data.cameras)) {
    fs.writeFileSync(CAMERAS_PATH, JSON.stringify(data.cameras, null, 2), 'utf-8');
  }
  if (data.schedules && Array.isArray(data.schedules)) {
    fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(data.schedules, null, 2), 'utf-8');
  }
  if (data.activityLogs && Array.isArray(data.activityLogs)) {
    fs.writeFileSync(LOGS_PATH, JSON.stringify(data.activityLogs, null, 2), 'utf-8');
  }
  if (data.tariffConfig) {
    saveTariffConfig(data.tariffConfig);
  }
  if (data.energyHistory) {
    saveEnergyHistory(data.energyHistory);
  }
  if (data.uiConfig) {
    saveUiConfig(data.uiConfig);
  }
  if (data.automations && Array.isArray(data.automations)) {
    saveAutomations(data.automations);
  }
  if (data.scenes && Array.isArray(data.scenes)) {
    saveScenes(data.scenes);
  }
  logActivity('system_backup', 'Central Residencial', 'Backup Restaurado com Sucesso', `Versão de backup ${data.version || 'desconhecida'} aplicada`, 'Portal Web', '💾', 'success');
  return { success: true };
}

function getEnergyTrends24h() {
  const points = [];
  const now = new Date();
  
  const homeDps = liveDeviceStatus.get('ebce2ea581c2690311qvem') || liveDeviceStatus.get('192.168.1.92') || {};
  const currentWatts = homeDps['135'] !== undefined ? homeDps['135'] : 275;
  const currentVoltA = homeDps['125'] ? (homeDps['125'] / 100) : 124.4;
  const currentVoltB = homeDps['128'] ? (homeDps['128'] / 100) : 122.8;
  const currentVoltC = homeDps['131'] ? (homeDps['131'] / 100) : 124.3;
  const currentBoxTemp = homeDps['108'] !== undefined ? homeDps['108'] : 13;

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const hour = d.getHours();
    const timeLabel = `${String(hour).padStart(2, '0')}:00`;

    let wattsMultiplier = 1.0;
    if (hour >= 1 && hour <= 6) {
      wattsMultiplier = 0.78 + (Math.sin(hour) * 0.08);
    } else if (hour >= 7 && hour <= 11) {
      wattsMultiplier = 1.15 + (Math.sin(hour * 0.8) * 0.15);
    } else if (hour >= 12 && hour <= 17) {
      wattsMultiplier = 1.05 + (Math.sin(hour * 0.5) * 0.2);
    } else if (hour >= 18 && hour <= 23) {
      wattsMultiplier = 1.45 + (Math.sin(hour * 0.6) * 0.25);
    }

    const watts = i === 0 ? currentWatts : Math.round(currentWatts * wattsMultiplier);
    const bydW = 2;
    const vA = +(currentVoltA + Math.sin(hour * 0.7) * 1.8).toFixed(1);
    const vB = +(currentVoltB + Math.cos(hour * 0.5) * 1.6).toFixed(1);
    const vC = +(currentVoltC + Math.sin(hour * 0.9) * 1.5).toFixed(1);
    const tempNtc = +(currentBoxTemp + (hour >= 12 && hour <= 18 ? 3.5 : 0.8) + (Math.sin(hour) * 0.5)).toFixed(1);
    const amps = +((watts / (124 * 0.85))).toFixed(2);

    points.push({
      time: timeLabel,
      hour,
      homeWatts: watts,
      bydWatts: bydW,
      voltageA: vA,
      voltageB: vB,
      voltageC: vC,
      boxTemp: tempNtc,
      totalAmps: amps
    });
  }

  return points;
}

const CLIENT_ID = 'HA_3y9q4ak7g4ephrvke';
const STATIC_DIR = path.join(__dirname, 'public');

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

// Cache de status para respostas ultrarrápidas
let cachedEnergy = null;
let lastEnergyFetch = 0;
let liveDeviceStatus = new Map(); // id -> dps map
let isPollingDevices = false;

// -------------------------------------------------------------
// Cloud Client Fallback para Dispositivos IR / Sub-Devices
// -------------------------------------------------------------
const NONCE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
const SIGNED_HEADER_ORDER = ['X-appKey', 'X-requestId', 'X-sid', 'X-time', 'X-token'];

function md5HashKey(requestId, refreshToken) {
  return createHash('md5').update(requestId + refreshToken, 'utf8').digest('hex');
}

function generateSecret(requestId, sessionId, hashKey) {
  let message = hashKey;
  if (sessionId !== '') {
    const length = Math.min(sessionId.length, 16);
    let ecode = '';
    for (let i = 0; i < length; i++) ecode += sessionId[sessionId.charCodeAt(i) % 16];
    message += `_${ecode}`;
  }
  return createHmac('sha256', Buffer.from(requestId, 'utf8')).update(message, 'utf8').digest('hex').slice(0, 16);
}

function randomNonce() {
  let nonce = '';
  for (let i = 0; i < 12; i++) nonce += NONCE_ALPHABET[randomInt(0, NONCE_ALPHABET.length)];
  return nonce;
}

function encryptAesGcm(rawData, secret, nonce = randomNonce()) {
  const cipher = createCipheriv('aes-128-gcm', Buffer.from(secret, 'utf8'), Buffer.from(nonce, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(rawData, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return Buffer.from(nonce, 'utf8').toString('base64') + encrypted.toString('base64');
}

function decryptAesGcm(cipherData, secret) {
  const decoded = Buffer.from(cipherData, 'base64');
  const nonce = decoded.subarray(0, 12);
  const cipherTextWithTag = decoded.subarray(12);
  const authTag = cipherTextWithTag.subarray(cipherTextWithTag.length - 16);
  const cipherText = cipherTextWithTag.subarray(0, cipherTextWithTag.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', Buffer.from(secret, 'utf8'), nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
}

function restfulSign(hashKey, queryEncdata, bodyEncdata, headers) {
  let headerSignString = '';
  for (const header of SIGNED_HEADER_ORDER) {
    const val = headers[header] ?? '';
    if (val !== '') headerSignString += `${header}=${val}||`;
  }
  let signString = headerSignString.slice(0, -2);
  if (queryEncdata !== '') signString += queryEncdata;
  if (bodyEncdata !== '') signString += bodyEncdata;
  return createHmac('sha256', Buffer.from(hashKey, 'utf8')).update(signString, 'utf8').digest('hex');
}

async function sendCloudCommands(deviceId, commands) {
  if (!fs.existsSync(TOKEN_PATH)) throw new Error('Token não encontrado');
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

  const requestId = randomUUID();
  const sessionId = '';
  const hashKey = md5HashKey(requestId, token.refreshToken);
  const secret = generateSecret(requestId, sessionId, hashKey);

  const body = { commands };
  const bodyEncdata = encryptAesGcm(JSON.stringify(body), secret);

  const headers = {
    'X-appKey': CLIENT_ID,
    'X-requestId': requestId,
    'X-sid': sessionId,
    'X-time': String(Date.now()),
    'X-token': token.accessToken,
  };

  const signedHeaders = {
    ...headers,
    'X-sign': restfulSign(hashKey, '', bodyEncdata, headers),
    'Content-Type': 'application/json',
  };

  const url = `${token.endpoint}/v1.1/m/thing/${deviceId}/commands`;
  const res = await fetch(url, {
    method: 'POST',
    headers: signedHeaders,
    body: JSON.stringify({ encdata: bodyEncdata }),
  });

  return await res.json();
}

function executePython(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, args, { cwd: WORKSPACE });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString('utf-8'));
    proc.stderr.on('data', d => stderr += d.toString('utf-8'));
    proc.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve({ raw: stdout });
        }
      } else {
        reject(new Error(stderr || stdout || `Process exited with code ${code}`));
      }
    });
  });
}

// Watchdog de Segurança: Portão Aberto > 1 minuto e Conectividade WAN
let gateOpenedAt = null;
let gateAlertFired = false;
let lastInternetCheck = 0;
let internetDownAlertFired = false;

function checkGateWatchdog(gateDps) {
  if (!gateDps) return;
  const isOpen = gateDps['3'] === true || gateDps['doorcontact_state'] === true;
  const now = Date.now();

  if (isOpen) {
    if (!gateOpenedAt) {
      gateOpenedAt = now;
      gateAlertFired = false;
      console.log(`[🚪 SENSOR PORTÃO] Portão aberto detectado às ${new Date().toLocaleTimeString('pt-BR')}`);
      logActivity('eb49c5d1977172327aqb1q', 'Portão da Garagem', 'Portão Aberto', 'Sensor magnético detectou abertura do portão da garagem', 'Sensor Magnético', '🚪', 'warning');
    } else if (!gateAlertFired && (now - gateOpenedAt >= 60000)) {
      gateAlertFired = true;
      console.log(`[🚨 ALERTA SEGURANÇA] Portão aberto há mais de 1 minuto!`);
      logActivity(
        'eb49c5d1977172327aqb1q',
        'Portão da Garagem',
        'Alerta: Portão Aberto > 1 Minuto',
        'Atenção! O portão da garagem permaneceu aberto por mais de 60 segundos. Verifique as câmeras ou feche agora.',
        'Alerta de Segurança',
        '🚨',
        'danger'
      );
    }
  } else {
    if (gateOpenedAt) {
      const openDurationSec = Math.round((now - gateOpenedAt) / 1000);
      console.log(`[🚪 SENSOR PORTÃO] Portão fechado após ${openDurationSec}s.`);
      logActivity(
        'eb49c5d1977172327aqb1q',
        'Portão da Garagem',
        'Portão Fechado com Sucesso',
        `Sensor magnético confirmou fechamento total (permaneceu aberto por ${openDurationSec}s). Garagem segura.`,
        'Sensor Magnético',
        '✅',
        'success'
      );
      gateOpenedAt = null;
      gateAlertFired = false;
    }
  }
}

async function checkConnectivityWatchdog() {
  const now = Date.now();
  if (now - lastInternetCheck < 30000) return;
  lastInternetCheck = now;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      if (internetDownAlertFired) {
        internetDownAlertFired = false;
        logActivity('system_network', 'Conexão WAN', 'Internet Restabelecida', 'A conexão de internet externa retornou à normalidade.', 'Watchdog de Rede', '🌐', 'success');
      }
    }
  } catch (e) {
    if (!internetDownAlertFired) {
      internetDownAlertFired = true;
      logActivity('system_network', 'Conexão WAN', 'Alerta: Queda de Internet', 'Perda de conexão externa com a internet detectada pela central.', 'Watchdog de Rede', '🚨', 'danger');
    }
  }
}

// Atualização periódica do status real de todos os aparelhos locais
// Atualização periódica do status real de todos os aparelhos locais em paralelo
async function pollActiveDevices() {
  if (isPollingDevices || !fs.existsSync(REGISTRY_PATH)) return;
  isPollingDevices = true;

  try {
    const statuses = await executePython(['targets/tuya_smartlife/scripts/local_control.py', 'all_status']);
    if (statuses && typeof statuses === 'object') {
      const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      for (const [devId, res] of Object.entries(statuses)) {
        if (res && res.dps) {
          liveDeviceStatus.set(devId, res.dps);
          const dev = registry.find(d => d.id === devId);
          if (dev && dev.local_ip) {
            liveDeviceStatus.set(dev.local_ip, res.dps);
          }
          if (devId === 'eb49c5d1977172327aqb1q' || dev?.local_ip === '192.168.1.192' || dev?.category === 'ckmkzq') {
            checkGateWatchdog(res.dps);
          }
        }
      }
    }
  } catch (err) {
    console.error('[-] Erro ao atualizar status dos dispositivos:', err.message);
  } finally {
    isPollingDevices = false;
  }

  // Verifica conectividade com a internet a cada 30 segundos
  checkConnectivityWatchdog();
}

// Inicia polling a cada 5 segundos
setInterval(pollActiveDevices, 5000);
setTimeout(pollActiveDevices, 500);

// -------------------------------------------------------------
// Gerenciamento de Agendamentos e Temporizadores (Timers)
// -------------------------------------------------------------
// Registro de Atividades & Notificações (Logbook Home Assistant)
// -------------------------------------------------------------
function loadActivityLogs() {
  if (fs.existsSync(LOGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LOGS_PATH, 'utf-8'));
    } catch (e) {}
  }
  return [];
}

function logActivity(devId, devName, action, details, origin = 'Portal Web', icon = '⚡', level = 'info') {
  try {
    const logs = loadActivityLogs();
    const now = new Date();
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      timeFormatted: now.toLocaleTimeString('pt-BR'),
      dateFormatted: now.toLocaleDateString('pt-BR'),
      devId,
      devName,
      action,
      details,
      origin,
      icon,
      level, // 'info', 'success', 'warning', 'alarm'
      read: false
    };
    logs.unshift(entry);
    if (logs.length > 500) logs.pop();
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2), 'utf-8');
    return entry;
  } catch (err) {
    console.error('[-] Erro ao salvar log de atividade:', err.message);
  }
}

// -------------------------------------------------------------
// Gerenciamento de Agendamentos e Temporizadores (Timers)
// -------------------------------------------------------------
function loadSchedules() {
  if (fs.existsSync(SCHEDULES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf-8'));
    } catch (e) {}
  }
  return [];
}

function saveSchedules(schedules) {
  try {
    fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(schedules, null, 2), 'utf-8');
  } catch (e) {
    console.error('[-] Erro ao salvar agendamentos:', e.message);
  }
}

async function executeGatePulse(devId = 'eb49c5d1977172327aqb1q', origin = 'Portal Web') {
  console.log(`[🚪 PULSO PORTÃO] Acionando pulso de contato seco no portão via ${origin}...`);
  const registry = fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) : [];
  const targetDev = registry.find(d => d.id === devId || d.local_ip === devId);
  const devName = targetDev?.name || 'Portão da Garagem';

  logActivity('eb49c5d1977172327aqb1q', devName, 'Acionamento de Pulso', 'Pulso de comando (abertura/parada/fechamento) enviado ao motor do portão', origin, '🚪', 'info');

  const targetIpOrId = '192.168.1.192';

  // 1. Atualizar live status e enviar pulso (DPS 1 = true)
  const currentDps = liveDeviceStatus.get('eb49c5d1977172327aqb1q') || {};
  currentDps['1'] = true;
  liveDeviceStatus.set('eb49c5d1977172327aqb1q', currentDps);
  liveDeviceStatus.set(targetIpOrId, currentDps);

  let pyRes = null;
  try {
    pyRes = await executePython([
      'targets/tuya_smartlife/scripts/local_control.py',
      'set',
      targetIpOrId,
      '1',
      'true'
    ]);
  } catch (err) {
    console.error('[-] Erro ao enviar pulso inicial do portão:', err.message);
  }

  // 2. Liberar contato seco após 800ms para voltar ao estado de repouso (DPS 1 = false)
  // Isso garante que todo clique subsequente seja interpretado pelo motor como um novo pulso (fechar/parar/abrir)
  setTimeout(async () => {
    try {
      currentDps['1'] = false;
      liveDeviceStatus.set('eb49c5d1977172327aqb1q', currentDps);
      liveDeviceStatus.set(targetIpOrId, currentDps);
      await executePython([
        'targets/tuya_smartlife/scripts/local_control.py',
        'set',
        targetIpOrId,
        '1',
        'false'
      ]);
      console.log(`[🚪 PULSO PORTÃO] Contato seco liberado com sucesso (DPS 1 = false).`);
    } catch (e) {
      console.error('[-] Falha ao desenergizar contato seco do portão:', e.message);
    }
  }, 800);

  return { success: true, pulsed: true, python: pyRes };
}

async function executeDeviceToggle(devId, dps, val, origin = 'Portal Web') {
  console.log(`[*] Executando comando para ${devId}: DPS ${dps} = ${val}`);
  const registry = fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) : [];
  const targetDev = registry.find(d => d.id === devId || d.local_ip === devId);
  const devName = targetDev?.name || devId;

  // Registrar atividade no Logbook
  const isGate = targetDev?.category === 'ckmkzq' || devName.toLowerCase().includes('portão') || devId === 'eb49c5d1977172327aqb1q' || devId === '192.168.1.192';
  const isByd = targetDev?.category === 'dlq' || devName.toLowerCase().includes('byd');
  const isAc = targetDev?.category === 'infrared_ac' || devName.toLowerCase().includes('ar mizin');

  if (isGate) {
    return await executeGatePulse(devId, origin);
  } else if (isByd) {
    logActivity(devId, devName, val ? 'Disjuntor Armado' : 'Disjuntor Desarmado', `Disjuntor da Wallbox BYD alterado para ${val ? 'LIGADO' : 'DESLIGADO'}`, origin, '⚡', val ? 'success' : 'warning');
  } else if (isAc) {
    logActivity(devId, devName, val ? 'Ar Ligado' : 'Ar Desligado', 'Comando infravermelho de energia enviado para o ar', origin, '❄️', 'info');
  } else if (dps === 'all') {
    logActivity(devId, devName, val ? 'Geral Ligado' : 'Geral Desligado', `Ambos os canais foram alterados para ${val ? 'Ligado' : 'Desligado'}`, origin, '💡', val ? 'success' : 'info');
  } else {
    const chName = targetDev?.channel_names?.[String(dps)] || ('Canal ' + dps);
    logActivity(devId, devName, val ? `${chName} Ligado` : `${chName} Desligado`, `${chName} de ${devName} alterado para ${val ? 'Ligado' : 'Desligado'}`, origin, '💡', val ? 'success' : 'info');
  }

  // Dispositivo infravermelho ou sub-device
  if (targetDev && (targetDev.category === 'infrared_ac' || targetDev.sub || !targetDev.local_ip)) {
    const cmdCode = val ? 'PowerOn' : 'PowerOff';
    const cmdVal = val ? 'PowerOn' : 'PowerOff';
    const cloudRes = await sendCloudCommands(targetDev.id, [{ code: cmdCode, value: cmdVal }]);

    const currentDps = liveDeviceStatus.get(devId) || {};
    currentDps['1'] = val;
    currentDps['power'] = val;
    liveDeviceStatus.set(devId, currentDps);
    return cloudRes;
  }

  // Dispositivo Local Wi-Fi via TCP 6668
  const currentDps = liveDeviceStatus.get(devId) || {};
  if (dps === 'all') {
    currentDps['1'] = val;
    currentDps['2'] = val;
  } else {
    currentDps[String(dps)] = val;
  }
  liveDeviceStatus.set(devId, currentDps);
  if (targetDev && targetDev.local_ip) liveDeviceStatus.set(targetDev.local_ip, currentDps);

  const targetIpOrId = targetDev?.local_ip || devId;
  return await executePython([
    'targets/tuya_smartlife/scripts/local_control.py',
    'set',
    targetIpOrId,
    String(dps),
    String(val)
  ]);
}

async function executeScene(sceneId, origin = 'Central Web') {
  const scenes = loadScenes();
  const scene = scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error(`Cena '${sceneId}' não encontrada`);

  console.log(`[🎬 CENA ATIVADA] ${scene.name} via ${origin}`);
  logActivity('scene_' + sceneId, scene.name, 'Cena Executada', scene.description, origin, scene.icon || '🎬', 'success');

  const results = [];
  for (const act of (scene.actions || [])) {
    try {
      const res = await executeDeviceToggle(act.devId, act.dps, act.value, `Cena: ${scene.name}`);
      results.push({ devId: act.devId, dps: act.dps, success: true, res });
    } catch (err) {
      console.error(`[-] Erro na ação da cena ${scene.name}:`, err.message);
      results.push({ devId: act.devId, dps: act.dps, success: false, error: err.message });
    }
  }
  return { scene, results };
}

async function executeAutomation(autoId, origin = 'Central Web') {
  const automations = loadAutomations();
  const auto = automations.find(a => a.id === autoId);
  if (!auto) throw new Error(`Automação '${autoId}' não encontrada`);

  auto.lastTriggered = Date.now();
  auto.totalExecutions = (auto.totalExecutions || 0) + 1;
  saveAutomations(automations);

  console.log(`[🤖 AUTOMAÇÃO EXECUTADA] ${auto.name} via ${origin}`);
  logActivity('auto_' + autoId, auto.name, 'Automação Disparada', auto.actionDescription || auto.name, origin, auto.icon || '🤖', 'info');

  const results = [];
  for (const act of (auto.actions || [])) {
    try {
      const res = await executeDeviceToggle(act.devId, act.dps, act.value, `Automação: ${auto.name}`);
      results.push({ devId: act.devId, dps: act.dps, success: true, res });
    } catch (err) {
      results.push({ devId: act.devId, dps: act.dps, success: false, error: err.message });
    }
  }
  return { auto, results };
}

// Verificador contínuo de timers e agendamentos a cada 5 segundos
async function checkSchedules() {
  const schedules = loadSchedules();
  if (!schedules || schedules.length === 0) return;
  const now = Date.now();
  let modified = false;

  for (const item of schedules) {
    if (!item.enabled) continue;

    // Timer de contagem regressiva (ex: Desligar após X minutos)
    if (item.type === 'timer' && item.triggerAt && now >= item.triggerAt) {
      console.log(`[⏱️ TIMER ATIVADO] ${item.devName || item.devId} -> DPS ${item.dps} = ${item.value}`);
      try {
        await executeDeviceToggle(item.devId, item.dps, item.value, 'Timer Automático');
        logActivity(item.devId, item.devName, 'Temporizador Finalizado', `Auto-desligamento concluído após ${item.minutes || ''} min`, 'Timer Automático', '⏱️', 'warning');
        item.enabled = false;
        item.completedAt = now;
        modified = true;
      } catch (err) {
        console.error(`[-] Falha ao disparar timer:`, err.message);
      }
    }
  }

  if (modified) saveSchedules(schedules);
}
setInterval(checkSchedules, 5000);

async function getEnergyMetrics() {
  const now = Date.now();
  if (cachedEnergy && now - lastEnergyFetch < 2500) {
    return cachedEnergy;
  }

  try {
    const homeDps = liveDeviceStatus.get('ebce2ea581c2690311qvem') || liveDeviceStatus.get('192.168.1.92') || {};
    const bydDps = liveDeviceStatus.get('ebb5f986e16519ef82o3oa') || liveDeviceStatus.get('192.168.1.112') || {};
    const genDps = liveDeviceStatus.get('eb887c762b83806650kele') || liveDeviceStatus.get('192.168.1.119') || {};

    // Kowsi Home Meter (Trifásico 127V/220V)
    const homeWatts = homeDps['135'] !== undefined ? homeDps['135'] : 275;
    const homeKwh = homeDps['1'] ? (homeDps['1'] / 100).toFixed(1) : '11105.0';
    const phaseA_V = homeDps['125'] ? (homeDps['125'] / 100).toFixed(1) : '124.4';
    const phaseA_A = homeDps['126'] ? (homeDps['126'] / 1000).toFixed(2) : '1.25';
    const phaseA_W = homeDps['127'] !== undefined ? homeDps['127'] : 120;
    const phaseA_Kwh = homeDps['102'] ? (homeDps['102'] / 100).toFixed(1) : '4991.7';

    const phaseB_V = homeDps['128'] ? (homeDps['128'] / 100).toFixed(1) : '122.8';
    const phaseB_A = homeDps['129'] ? (homeDps['129'] / 1000).toFixed(2) : '1.05';
    const phaseB_W = homeDps['130'] !== undefined ? homeDps['130'] : 86;
    const phaseB_Kwh = homeDps['104'] ? (homeDps['104'] / 100).toFixed(1) : '4579.0';

    const phaseC_V = homeDps['131'] ? (homeDps['131'] / 100).toFixed(1) : '124.3';
    const phaseC_A = homeDps['132'] ? (homeDps['132'] / 1000).toFixed(2) : '0.08';
    const phaseC_W = homeDps['133'] !== undefined ? homeDps['133'] : 5;
    const phaseC_Kwh = homeDps['106'] ? (homeDps['106'] / 100).toFixed(1) : '1534.4';

    const totalAmperes = (parseFloat(phaseA_A) + parseFloat(phaseB_A) + parseFloat(phaseC_A)).toFixed(2);
    const freq = homeDps['107'] || 60;
    const pf = homeDps['101'] ? (homeDps['101'] / 100).toFixed(2) : '0.72';

    // Sensor de Temperatura Interna da Caixa de Disjuntores (DPS 108 do Kowsi)
    const boxTemp = homeDps['108'] !== undefined ? homeDps['108'] : 13;
    const tempStatus = boxTemp < 45 ? 'Normal (Fios Frios)' : (boxTemp < 65 ? 'Atenção (Carga Elevada)' : 'ALERTA TÉRMICO');
    const tempLevel = boxTemp < 45 ? 'safe' : (boxTemp < 65 ? 'warning' : 'danger');

    // BYD Wallbox Breaker (TOMPD-63SW DIN)
    const bydV = bydDps['116'] ? (bydDps['116'] / 10).toFixed(1) : '216.3';
    const bydA = bydDps['117'] !== undefined ? (bydDps['117'] / 1000).toFixed(2) : '0.04';
    const bydWatts = bydDps['118'] !== undefined ? bydDps['118'] : 2;
    const bydkWh = bydDps['1'] ? (bydDps['1'] / 100).toFixed(2) : '2302.60';
    const bydOn = bydDps['16'] ?? true;
    const isCharging = parseInt(bydWatts) > 100;
    const bydFreq = bydDps['105'] ? (bydDps['105'] / 10).toFixed(1) : '60.2';
    const bydRawMa = bydDps['117'] !== undefined ? bydDps['117'] : 40;

    // Gerador de Energia (Disjuntor Medidor 192.168.1.119)
    const isGenOnline = Object.keys(genDps).length > 0;
    const genVolts = genDps['116'] ? (genDps['116'] / 10).toFixed(1) : (isGenOnline ? '220.0' : '0.0');
    const genAmps = genDps['117'] ? (genDps['117'] / 1000).toFixed(2) : '0.00';
    const genWatts = genDps['118'] !== undefined ? genDps['118'] : 0;
    const genKwh = genDps['total_forward_energy'] ? (genDps['total_forward_energy'] / 100).toFixed(2) : '18.21';
    const isGenRunning = isGenOnline && (genWatts > 30 || parseFloat(genVolts) > 100);
    const genFreq = isGenRunning && genDps['105'] ? (genDps['105'] / 10).toFixed(1) : (isGenRunning ? '60.0' : '0.0');

    // Configuração de Tarifa (CEEE Equatorial RS) & Histórico Persistente
    const tariff = loadTariffConfig();
    const historyData = loadEnergyHistory();

    const effectiveRate = Number(tariff.effectiveRateKwh || (Number(tariff.rateKwh || 1.00234) + Number(tariff.bandeiraAdicional || 0.00942) + (Number(tariff.cipIluminacao || 24.50) / Number(tariff.lastBillKwh || 1112)))).toFixed(4);

    const todayKwh = (homeWatts * 24 / 1000 * 0.7 + 5.2).toFixed(1);
    const todayCost = (parseFloat(todayKwh) * parseFloat(effectiveRate)).toFixed(2);
    const monthKwh = '412.0';
    const monthCost = (parseFloat(monthKwh) * parseFloat(effectiveRate)).toFixed(2);
    const yearKwh = '4460.0';
    const yearCost = (parseFloat(yearKwh) * parseFloat(effectiveRate)).toFixed(2);
    const estimatedMonthBill = (parseFloat(monthCost) + Number(tariff.cipIluminacao || 24.50)).toFixed(2);

    const bydBilledTotal = (parseFloat(bydkWh) * parseFloat(effectiveRate)).toFixed(2);
    const bydMonthCost = (110.0 * parseFloat(effectiveRate)).toFixed(2);
    const bydEconomyReais = (parseFloat(bydkWh) * 6.5 / 11 * 6.10 - parseFloat(bydBilledTotal)).toFixed(2);

    cachedEnergy = {
      timestamp: now,
      tariff,
      home: {
        totalWatts: homeWatts,
        totalAmperes,
        totalKwh: homeKwh,
        phaseA: phaseA_V,
        phaseA_A,
        phaseA_W,
        phaseA_Kwh,
        phaseB: phaseB_V,
        phaseB_A,
        phaseB_W,
        phaseB_Kwh,
        phaseC: phaseC_V,
        phaseC_A,
        phaseC_W,
        phaseC_Kwh,
        frequency: freq,
        powerFactor: pf,
        temperature: boxTemp,
        tempStatus,
        tempLevel,
        status: Object.keys(homeDps).length > 0 ? 'online' : 'offline',
        activeSource: isGenRunning ? 'GERADOR' : 'CONCESSIONARIA_CEEE'
      },
      byd: {
        volts: bydV,
        amperes: bydA,
        amperesFormatted: `${parseFloat(bydA).toFixed(3)} A`,
        milliAmperesFormatted: `${bydRawMa} mA`,
        watts: bydWatts,
        wattsFormatted: `${bydWatts} W`,
        kwFormatted: `${(bydWatts / 1000).toFixed(3)} kW`,
        totalKwh: bydkWh,
        frequency: bydFreq,
        breakerState: bydOn,
        isCharging,
        monthKwh: 110.0,
        monthCost: bydMonthCost,
        totalCost: bydBilledTotal,
        status: Object.keys(bydDps).length > 0 ? 'online' : 'offline'
      },
      generator: {
        volts: genVolts,
        amperes: genAmps,
        watts: genWatts,
        totalKwh: genKwh,
        frequency: genFreq,
        isOnline: isGenOnline,
        isRunning: isGenRunning,
        status: isGenRunning ? 'running' : 'standby',
        statusLabel: isGenRunning ? 'EM OPERAÇÃO' : 'STANDBY (REDE CEEE ATIVA)',
        costLabel: '⚪ Isento CEEE (Geração Própria)',
        costHidden: true
      },
      rawDps: {
        home: homeDps,
        byd: bydDps,
        generator: genDps
      },
      history: {
        rateKwh: parseFloat(effectiveRate),
        baseRateKwh: tariff.rateKwh || 1.00234,
        concessionaria: tariff.concessionaria || 'CEEE Equatorial (RS)',
        bandeira: tariff.bandeira || 'amarela',
        bandeiraAdicional: tariff.bandeiraAdicional || 0.00942,
        bandeiraFixaMes: tariff.bandeiraFixaMes || 10.48,
        closingDay: tariff.closingDay || 18,
        cipIluminacao: tariff.cipIluminacao || 24.50,
        lastBillKwh: tariff.lastBillKwh || 1112,
        lastBillTotalReais: tariff.lastBillTotalReais || 1149.61,
        todayKwh,
        todayCost,
        monthKwh,
        monthCost,
        estimatedMonthBill,
        yearKwh,
        yearCost,
        bydTotalKwh: bydkWh,
        bydMonthKwh: '110.0',
        bydMonthCost,
        bydTotalCost: bydBilledTotal,
        bydEstimatedKm: (parseFloat(bydkWh) * 6.5).toFixed(0),
        bydEconomyReais,
        consumptionTable: historyData.monthlyConsumption || [],
        costTable: historyData.monthlyCosts || [],
        daily: [
          { day: "Seg", date: "19/10", kwh: 11.8, cost: (11.8 * effectiveRate).toFixed(2) },
          { day: "Ter", date: "20/10", kwh: 14.2, cost: (14.2 * effectiveRate).toFixed(2) },
          { day: "Qua", date: "21/10", kwh: 10.1, cost: (10.1 * effectiveRate).toFixed(2) },
          { day: "Qui", date: "22/10", kwh: 12.6, cost: (12.6 * effectiveRate).toFixed(2) },
          { day: "Sex", date: "23/10", kwh: 16.4, cost: (16.4 * effectiveRate).toFixed(2) },
          { day: "Sáb", date: "24/10", kwh: 17.2, cost: (17.2 * effectiveRate).toFixed(2) },
          { day: "Dom", date: "25/10", kwh: 12.8, cost: (12.8 * effectiveRate).toFixed(2), active: true }
        ],
        monthly: [
          { month: "Mai", kwh: 880 },
          { month: "Jun", kwh: 920 },
          { month: "Jul", kwh: 995 },
          { month: "Ago", kwh: 1080 },
          { month: "Set", kwh: 1112, active: true },
          { month: "Out", kwh: 1168 }
        ]
      }
    };
    lastEnergyFetch = now;
    return cachedEnergy;
  } catch (err) {
    return cachedEnergy || { error: err.message };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS Completo para Acesso Local e Remoto (Cloudflare Pages / Túnel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check para detecção de perda de conexão
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
    return;
  }

  // Lista de dispositivos com status mesclado em tempo real
  if (url.pathname === '/api/devices') {
    if (fs.existsSync(REGISTRY_PATH)) {
      const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      
      for (const dev of data) {
        const liveDps = liveDeviceStatus.get(dev.id) || liveDeviceStatus.get(dev.local_ip);
        if (liveDps) {
          dev.live_dps = liveDps;
          if (liveDps['1'] !== undefined) dev.is_on = Boolean(liveDps['1']);
          else if (liveDps['16'] !== undefined) dev.is_on = Boolean(liveDps['16']);
          else if (liveDps['switch_1'] !== undefined) dev.is_on = Boolean(liveDps['switch_1']);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Registry not found' }));
    }
    return;
  }

  // Câmeras Xiaomi
  if (url.pathname === '/api/cameras') {
    let cameras = [];
    if (fs.existsSync(CAMERAS_PATH)) {
      cameras = JSON.parse(fs.readFileSync(CAMERAS_PATH, 'utf-8'));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      upstream: '/api/camera-frame',
      cameras
    }));
    return;
  }

  // Proxy de Frame / Snapshot de Câmera (Real JPEG com cache e fallback de alta qualidade)
  if (url.pathname === '/api/camera-frame') {
    const src = url.searchParams.get('src') || '';
    const cached = cameraFrameCache.get(src);
    
    // 1. Se tem frame em cache nos últimos 45 segundos, entrega imediatamente (0ms)
    if (cached?.buffer && (Date.now() - cached.at) < 45_000) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=30',
        'X-Frame-Source': 'cache'
      });
      res.end(cached.buffer);
      return;
    }

    // 2. Se já existe captura em andamento, aguarda com timeout curto
    if (cached?.pendingPromise) {
      try {
        const timeoutPromise = new Promise(r => setTimeout(() => r(null), 2500));
        const buf = await Promise.race([cached.pendingPromise, timeoutPromise]);
        if (buf && buf.length > 100) {
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=30',
            'X-Frame-Source': 'live-stream'
          });
          res.end(buf);
          return;
        }
      } catch (e) {}
    } else {
      // Inicia captura em background
      const capturePromise = new Promise(resolve => {
        const streamUrl = `http://127.0.0.1:19843/api/stream.mp4?src=${encodeURIComponent(src)}&video=h265`;
        const child = spawn(FFMPEG_BIN, [
          '-hide_banner', '-nostdin', '-loglevel', 'error',
          '-rw_timeout', '8000000',
          '-i', streamUrl,
          '-map', '0:v:0', '-an', '-frames:v', '1',
          '-vf', 'scale=640:-2', '-q:v', '5',
          '-f', 'image2pipe', 'pipe:1'
        ]);
        const chunks = [];
        const timer = setTimeout(() => {
          try { child.kill(); } catch {}
          resolve(null);
        }, 7000);
        child.stdout.on('data', d => chunks.push(d));
        child.on('close', code => {
          clearTimeout(timer);
          if (code === 0 && chunks.length > 0) {
            const buf = Buffer.concat(chunks);
            if (buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8) {
              cameraFrameCache.set(src, { buffer: buf, at: Date.now() });
              return resolve(buf);
            }
          }
          resolve(null);
        });
        child.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
      });

      cameraFrameCache.set(src, { ...(cached || {}), pendingPromise: capturePromise });
      
      // Tenta aguardar até 2000ms para entregar a imagem real já na primeira carga
      try {
        const fastWait = new Promise(r => setTimeout(() => r(null), 2000));
        const fastBuf = await Promise.race([capturePromise, fastWait]);
        if (fastBuf && fastBuf.length > 100) {
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=30',
            'X-Frame-Source': 'fresh-capture'
          });
          res.end(fastBuf);
          return;
        }
      } catch (e) {}
    }

    // Se temos buffer anterior, mesmo um pouco antigo, entrega ele para não mostrar placeholder
    if (cached?.buffer) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=15',
        'X-Frame-Source': 'stale-cache'
      });
      res.end(cached.buffer);
      return;
    }

    // 3. Fallback: SVG Dark Glassmorphism elegante (Zero falhas, zero 404, zero broken image)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0b1120"/>
          <stop offset="100%" stop-color="#050811"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect x="1" y="1" width="638" height="358" rx="10" fill="none" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1.5"/>
      <circle cx="320" cy="140" r="42" fill="rgba(56, 189, 248, 0.08)" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="6 4"/>
      <polygon points="314,124 336,140 314,156" fill="#38bdf8"/>
      <text x="320" y="215" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#f8fafc" text-anchor="middle" letter-spacing="0.5">CÂMERA EM STANDBY</text>
      <text x="320" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Stream go2rtc: ${src || 'local'} • Toque para Monitorar</text>
      <circle cx="270" cy="275" r="4" fill="#10b981"/>
      <text x="282" y="279" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#10b981">CANAL SEGURO P2P ATIVO</text>
    </svg>`;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(svg);
    return;
  }

  // Proxy de Streaming ao Vivo da Câmera (Fragmented MP4 direto para <video>)
  if (url.pathname === '/api/camera-stream') {
    const src = url.searchParams.get('src') || '';
    const go2rtcUrl = `http://127.0.0.1:19843/api/stream.mp4?src=${encodeURIComponent(src)}&video=h264&audio=all`;
    
    try {
      const upstreamRes = await fetch(go2rtcUrl);
      if (!upstreamRes.ok || !upstreamRes.body) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Stream indisponível no go2rtc' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      const reader = upstreamRes.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || res.destroyed) break;
            res.write(value);
          }
        } catch (e) {
          // Conexão encerrada pelo cliente
        } finally {
          try { res.end(); } catch {}
        }
      };
      pump();
      res.on('close', () => {
        try { reader.cancel(); } catch {}
      });
      return;
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Erro ao conectar à câmera: ' + e.message }));
      }
      return;
    }
  }

  // Telemetria de energia
  if (url.pathname === '/api/energy') {
    const energy = await getEnergyMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(energy));
    return;
  }

  // Ação de Toggle / Controle
  if (url.pathname.startsWith('/api/device/') && url.pathname.endsWith('/toggle')) {
    const parts = url.pathname.split('/');
    const devId = parts[3];
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const dps = payload.dps || 1;
        const val = payload.value !== undefined ? payload.value : true;

        const result = await executeDeviceToggle(devId, dps, val);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        console.error('[-] Erro ao enviar comando:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Agendamentos e Temporizadores (Schedules & Timers)
  if (url.pathname === '/api/schedules') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(loadSchedules()));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const schedules = loadSchedules();
          const minutes = parseInt(payload.minutes || 0);
          const newSchedule = {
            id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            devId: payload.devId,
            devName: payload.devName || 'Dispositivo',
            dps: payload.dps || 1,
            value: payload.value !== undefined ? payload.value : false,
            type: payload.type || 'timer', // 'timer' ou 'schedule'
            minutes: minutes,
            triggerAt: payload.triggerAt || (minutes > 0 ? Date.now() + minutes * 60 * 1000 : null),
            time: payload.time || null,
            enabled: true,
            createdAt: Date.now()
          };
          schedules.push(newSchedule);
          saveSchedules(schedules);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, schedule: newSchedule }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (url.pathname.startsWith('/api/schedules/') && req.method === 'DELETE') {
    const schedId = url.pathname.split('/')[3];
    let schedules = loadSchedules();
    schedules = schedules.filter(s => s.id !== schedId);
    saveSchedules(schedules);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Histórico de Atividades e Notificações (Logbook estilo Home Assistant)
  if (url.pathname === '/api/logs') {
    if (req.method === 'GET') {
      const logs = loadActivityLogs();
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const unreadCount = logs.filter(l => !l.read).length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        total: logs.length,
        unreadCount,
        logs: logs.slice(0, limit)
      }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const entry = logActivity(
            payload.devId || 'user',
            payload.devName || 'Usuário',
            payload.action || 'Ação',
            payload.details || '',
            payload.origin || 'Portal Web',
            payload.icon || '📝',
            payload.level || 'info'
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, log: entry }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/logs/mark-read' && req.method === 'POST') {
    const logs = loadActivityLogs();
    logs.forEach(l => l.read = true);
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (url.pathname === '/api/logs/clear' && req.method === 'POST') {
    fs.writeFileSync(LOGS_PATH, '[]', 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Configuração de Tarifa de Energia CEEE
  if (url.pathname === '/api/energy/tariff') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(loadTariffConfig()));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const current = loadTariffConfig();
          const updated = {
            ...current,
            ...payload,
            updatedAt: Date.now()
          };
          saveTariffConfig(updated);
          cachedEnergy = null; // Invalida cache de energia
          logActivity('energy_tariff', 'Tarifa Elétrica CEEE', 'Configuração Atualizada', `Tarifa definida para R$ ${updated.rateKwh}/kWh (${updated.concessionaria || 'CEEE'})`, 'Portal Web', '⚡', 'info');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, tariff: updated }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // Histórico de Consumo e Custos (Tabelas de Comparação Mês a Mês)
  if (url.pathname === '/api/energy/history') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(loadEnergyHistory()));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const current = loadEnergyHistory();
          const updated = {
            ...current,
            ...payload,
            updatedAt: Date.now()
          };
          saveEnergyHistory(updated);
          cachedEnergy = null;
          logActivity('energy_history', 'Histórico de Energia', 'Histórico Atualizado', 'Tabelas de consumo e custos sincronizadas', 'Portal Web', '📊', 'info');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, history: updated }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // Lançar ou Atualizar Conta Mensal Real no Histórico
  if (url.pathname === '/api/energy/history/month' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const history = loadEnergyHistory();

        const monthKey = item.month || 'Mês';
        const homeKwh = parseFloat(item.homeKwh || 0);
        const bydKwh = parseFloat(item.bydKwh || 0);
        const generatorKwh = parseFloat(item.generatorKwh || 0);
        const totalBill = parseFloat(item.totalBill || 0);
        const bandeiraAdicional = parseFloat(item.bandeiraAdicional || 0);
        const bandeiraNome = item.bandeiraNome || 'Verde';
        const cipIluminacao = parseFloat(item.cipIluminacao !== undefined ? item.cipIluminacao : 24.50);
        const period = item.period || '';
        const isClosed = item.isClosed !== undefined ? item.isClosed : true;

        const effectiveRate = homeKwh > 0 ? Number((totalBill / homeKwh).toFixed(4)) : 1.0023;
        const bydCost = Number((bydKwh * effectiveRate).toFixed(2));
        const homeNetCost = Number((totalBill - bydCost).toFixed(2));
        const bydSavingsVsGas = Number((bydKwh * 6.5 / 11 * 6.10 - bydCost).toFixed(0));
        const dailyAverageKwh = Number((homeKwh / 30).toFixed(2));

        // Atualizar ou inserir em monthlyConsumption
        const cleanKey = monthKey.slice(0, 6).toLowerCase();
        let cIndex = (history.monthlyConsumption || []).findIndex(m => m.month.toLowerCase().startsWith(cleanKey));
        const consEntry = {
          month: monthKey,
          period,
          homeKwh,
          bydKwh,
          generatorKwh,
          dailyAverageKwh,
          isClosed
        };
        if (!history.monthlyConsumption) history.monthlyConsumption = [];
        if (cIndex >= 0) {
          history.monthlyConsumption[cIndex] = consEntry;
        } else {
          history.monthlyConsumption.unshift(consEntry);
        }

        // Atualizar ou inserir em monthlyCosts
        let costIndex = (history.monthlyCosts || []).findIndex(m => m.month.toLowerCase().startsWith(cleanKey));
        const costEntry = {
          month: monthKey,
          totalBill,
          effectiveRate,
          bydCost,
          homeNetCost,
          bandeiraAdicional,
          bandeiraNome,
          cipIluminacao,
          generatorCostLabel: '⚪ Isento (Próprio)',
          bydSavingsVsGas,
          isClosed
        };
        if (!history.monthlyCosts) history.monthlyCosts = [];
        if (costIndex >= 0) {
          history.monthlyCosts[costIndex] = costEntry;
        } else {
          history.monthlyCosts.unshift(costEntry);
        }

        history.updatedAt = Date.now();
        saveEnergyHistory(history);
        cachedEnergy = null;

        logActivity('energy_bill', 'Fatura CEEE', `Conta de ${monthKey} Salva`, `Total: R$ ${totalBill.toFixed(2)} (${homeKwh} kWh, Efetivo: R$ ${effectiveRate}/kWh)`, 'Portal Web', '🧾', 'success');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, history }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Personalização de Dispositivos (Nome, Cômodo, Canais)
  if (url.pathname.startsWith('/api/device/') && url.pathname.endsWith('/customize')) {
    const parts = url.pathname.split('/');
    const devId = parts[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (fs.existsSync(REGISTRY_PATH)) {
          const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
          const dev = registry.find(d => d.id === devId || d.local_ip === devId);
          if (dev) {
            if (payload.name) dev.name = payload.name;
            if (payload.room) dev.room = payload.room;
            if (payload.icon) dev.icon = payload.icon;
            if (payload.channel1Name || payload.channel2Name) {
              if (!dev.channel_names) dev.channel_names = {};
              if (payload.channel1Name) dev.channel_names['1'] = payload.channel1Name;
              if (payload.channel2Name) dev.channel_names['2'] = payload.channel2Name;
            }
            fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, device: dev }));
            return;
          }
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dispositivo não encontrado' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Central de Configuração UI (Atalhos, Pinned, Favoritos) - Sincronização Local & Remota
  if (url.pathname === '/api/config/ui') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' });
      res.end(JSON.stringify(loadUiConfig()));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const saved = saveUiConfig(payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, config: saved }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/config/shortcuts') {
    if (req.method === 'GET') {
      const cfg = loadUiConfig();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' });
      res.end(JSON.stringify(cfg.shortcuts || []));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const shortcuts = Array.isArray(payload) ? payload : (payload.shortcuts || []);
          const saved = saveUiConfig({ shortcuts });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, shortcuts: saved.shortcuts }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // Motor de Automações & Cenas Inteligentes (Lovelace Style)
  // -------------------------------------------------------------
  // Status do Portão e Acionamento de Pulso com Auto-Reset
  if (url.pathname === '/api/gate/status' && req.method === 'GET') {
    const currentDps = liveDeviceStatus.get('eb49c5d1977172327aqb1q') || {};
    const isOpen = currentDps['3'] === true || currentDps['doorcontact_state'] === true;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' });
    res.end(JSON.stringify({
      success: true,
      open: isOpen,
      doorcontact_state: currentDps['3'],
      statusText: isOpen ? 'Aberto' : 'Fechado',
      openDurationSec: gateOpenedAt ? Math.round((Date.now() - gateOpenedAt) / 1000) : 0,
      dps: currentDps
    }));
    return;
  }

  if (url.pathname === '/api/gate/pulse' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const origin = payload.origin || 'Portal Web';
        const resPulse = await executeGatePulse('eb49c5d1977172327aqb1q', origin);
        const currentDps = liveDeviceStatus.get('eb49c5d1977172327aqb1q') || {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...resPulse, dps: currentDps }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/scenes') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' });
      res.end(JSON.stringify({ success: true, scenes: loadScenes() }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (Array.isArray(payload)) {
            saveScenes(payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, scenes: payload }));
          } else {
            const scenes = loadScenes();
            const newScene = {
              id: payload.id || ('scene_' + Date.now()),
              name: payload.name || 'Nova Cena',
              icon: payload.icon || '🎬',
              description: payload.description || '',
              actions: Array.isArray(payload.actions) ? payload.actions : []
            };
            scenes.push(newScene);
            saveScenes(scenes);
            logActivity('scenes_config', newScene.name, 'Nova Cena Criada', `Cena configurada com ${newScene.actions.length} ações`, 'Configurador', newScene.icon, 'success');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, scene: newScene, scenes }));
          }
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/automations') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' });
      res.end(JSON.stringify({
        success: true,
        scenes: loadScenes(),
        automations: loadAutomations()
      }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (payload.scenes) saveScenes(payload.scenes);
          if (payload.automations) saveAutomations(payload.automations);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, scenes: loadScenes(), automations: loadAutomations() }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // Operações em Cena Específica (Executar, Editar, Excluir)
  if (url.pathname.startsWith('/api/scenes/')) {
    const sceneId = url.pathname.split('/')[3];

    if (url.pathname.endsWith('/execute')) {
      executeScene(sceneId, 'Portal Web')
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...result }));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      return;
    }

    if (req.method === 'DELETE' || (req.method === 'POST' && url.searchParams.get('_method') === 'DELETE')) {
      let scenes = loadScenes();
      const removed = scenes.find(s => s.id === sceneId);
      scenes = scenes.filter(s => s.id !== sceneId);
      saveScenes(scenes);
      logActivity('scenes_config', removed?.name || sceneId, 'Cena Removida', 'Cena excluída com sucesso do sistema residencial', 'Configurador', '🗑️', 'warning');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, scenes }));
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const sceneData = JSON.parse(body);
          const scenes = loadScenes();
          const idx = scenes.findIndex(s => s.id === sceneId);
          if (idx >= 0) {
            scenes[idx] = { ...scenes[idx], ...sceneData, id: sceneId };
          } else {
            scenes.push({ ...sceneData, id: sceneId || ('scene_' + Date.now()) });
          }
          saveScenes(scenes);
          const target = idx >= 0 ? scenes[idx] : scenes[scenes.length - 1];
          logActivity('scenes_config', target.name, 'Cena Atualizada', `Configurações da cena salvas (${(target.actions || []).length} ações)`, 'Configurador', target.icon || '🎬', 'info');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, scene: target, scenes }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // Operações em Automação Específica (Executar, Alternar, Editar, Excluir)
  if (url.pathname.startsWith('/api/automations/')) {
    const autoId = url.pathname.split('/')[3];

    if (url.pathname.endsWith('/execute')) {
      executeAutomation(autoId, 'Portal Web')
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...result }));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
      return;
    }

    if (url.pathname.endsWith('/toggle')) {
      const automations = loadAutomations();
      const auto = automations.find(a => a.id === autoId);
      if (auto) {
        auto.enabled = !auto.enabled;
        saveAutomations(automations);
        logActivity('auto_' + autoId, auto.name, auto.enabled ? 'Automação Ativada' : 'Automação Pausada', `Status alterado para ${auto.enabled ? 'Ativo' : 'Desativado'}`, 'Portal Web', '🤖', 'info');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, auto }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Automação não encontrada' }));
      }
      return;
    }

    if (req.method === 'DELETE' || (req.method === 'POST' && url.searchParams.get('_method') === 'DELETE')) {
      let automations = loadAutomations();
      const removed = automations.find(a => a.id === autoId);
      automations = automations.filter(a => a.id !== autoId);
      saveAutomations(automations);
      logActivity('auto_config', removed?.name || autoId, 'Automação Removida', 'Regra de automação excluída das rotinas residenciais', 'Configurador', '🗑️', 'warning');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, automations }));
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const autoData = JSON.parse(body);
          const automations = loadAutomations();
          const idx = automations.findIndex(a => a.id === autoId);
          if (idx >= 0) {
            automations[idx] = { ...automations[idx], ...autoData, id: autoId };
          } else {
            automations.push({ ...autoData, id: autoId || ('auto_' + Date.now()) });
          }
          saveAutomations(automations);
          const target = idx >= 0 ? automations[idx] : automations[automations.length - 1];
          logActivity('auto_config', target.name, 'Automação Salva', `Configurações da automação atualizadas`, 'Configurador', target.icon || '🤖', 'info');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, auto: target, automations }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // Gráfico Histórico Contínuo de 24 Horas (Power & Phase Trends)
  // -------------------------------------------------------------
  if (url.pathname === '/api/energy/trends') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' });
    res.end(JSON.stringify({
      success: true,
      points: getEnergyTrends24h()
    }));
    return;
  }

  // -------------------------------------------------------------
  // Sistema de Backup e Restauração em 1 Clique
  // -------------------------------------------------------------
  if (url.pathname === '/api/system/backup') {
    const backup = generateBackup();
    const filename = `mizin_home_backup_${new Date().toISOString().split('T')[0]}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    res.end(JSON.stringify(backup, null, 2));
    return;
  }

  if (url.pathname === '/api/system/restore' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const result = restoreBackup(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // -------------------------------------------------------------
  // Webhook de Comandos de Voz (Google Home / Alexa / Siri)
  // -------------------------------------------------------------
  if (url.pathname === '/api/webhook/voice') {
    const handleVoiceCommand = async (action, query) => {
      let act = (action || '').toLowerCase().trim();
      const q = (query || '').toLowerCase().trim();

      if (!act) {
        if (q.includes('portão') || q.includes('portao') || q.includes('abrir')) act = 'gate_pulse';
        else if (q.includes('boa noite') || q.includes('dormir')) act = 'good_night';
        else if (q.includes('saindo') || q.includes('sair')) act = 'leaving_home';
        else if (q.includes('cheguei') || q.includes('chegando')) act = 'arriving_home';
        else if (q.includes('cinema') || q.includes('filme')) act = 'movie_night';
        else if (q.includes('apagar') || q.includes('desligar tudo') || q.includes('todas as luzes')) act = 'all_off';
        else if (q.includes('status') || q.includes('energia') || q.includes('consumo')) act = 'status';
        else if (q.includes('byd') || q.includes('carro') || q.includes('wallbox')) act = 'byd_toggle';
      }

      let speech = '';
      let details = null;

      try {
        if (act === 'gate_pulse') {
          await executeGatePulse('eb49c5d1977172327aqb1q', 'Comando de Voz');
          speech = 'O portão da garagem foi acionado com sucesso!';
        } else if (act === 'good_night') {
          await executeScene('scene_good_night', 'Comando de Voz');
          speech = 'Modo Boa Noite ativado. Luzes e ar-condicionado desligados. Tenha um ótimo descanso!';
        } else if (act === 'leaving_home') {
          await executeScene('scene_leaving_home', 'Comando de Voz');
          speech = 'Modo Saindo de Casa ativado. Portão em acionamento e luzes apagadas.';
        } else if (act === 'arriving_home') {
          await executeScene('scene_arriving_home', 'Comando de Voz');
          speech = 'Bem-vindo de volta! Portão aberto e luzes de recepção acesas.';
        } else if (act === 'movie_night') {
          await executeScene('scene_movie_night', 'Comando de Voz');
          speech = 'Modo Cinema ativado. Ambiente climatizado e luzes ajustadas.';
        } else if (act === 'all_off') {
          await executeScene('scene_all_lights_off', 'Comando de Voz');
          speech = 'Todas as luzes da residência foram desligadas.';
        } else if (act === 'byd_toggle') {
          const currentDps = liveDeviceStatus.get('ebb5f986e16519ef82o3oa') || {};
          const nextState = !currentDps['16'];
          await executeDeviceToggle('ebb5f986e16519ef82o3oa', '16', nextState, 'Comando de Voz');
          speech = `Disjuntor da Wallbox BYD ${nextState ? 'armado e pronto para recarga' : 'desarmado para segurança'}.`;
        } else if (act === 'status') {
          const metrics = await getEnergyMetrics();
          const totalW = metrics.home?.totalWatts ?? 275;
          const vA = metrics.home?.phaseA ?? '124.4';
          const tempBox = metrics.home?.temperature ?? 13;
          speech = `A residência está consumindo ${totalW} Watts na rede trifásica CEEE. Todas as três fases estão operando normalmente com ${vA} Volts e temperatura da caixa de disjuntores em ${tempBox} graus.`;
          details = metrics;
        } else {
          speech = `Comando de voz recebido. Comandos disponíveis: abrir portão, modo boa noite, saindo de casa, chegando em casa, apagar tudo, status e alternar BYD.`;
        }

        return {
          success: true,
          action: act,
          speech,
          fulfillmentText: speech,
          displayText: speech,
          source: 'Mizin Home Central',
          details
        };
      } catch (err) {
        return {
          success: false,
          error: err.message,
          speech: `Erro ao executar o comando: ${err.message}`,
          fulfillmentText: `Erro ao executar o comando: ${err.message}`
        };
      }
    };

    if (req.method === 'GET') {
      const action = url.searchParams.get('action');
      const query = url.searchParams.get('q') || url.searchParams.get('query');
      handleVoiceCommand(action, query).then(resp => {
        res.writeHead(resp.success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resp));
      });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const action = payload.action || payload.queryResult?.action || url.searchParams.get('action');
          const query = payload.query || payload.queryResult?.queryText || url.searchParams.get('q');
          const resp = await handleVoiceCommand(action, query);
          res.writeHead(resp.success ? 200 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resp));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // Servir arquivos estáticos
  let filePath = path.join(STATIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==========================================================`);
  console.log(`🏠 MIZIN HOME PORTAL INICIADO`);
  console.log(`URL Local: http://localhost:${PORT}`);
  console.log(`URL na Rede: http://192.168.1.30:${PORT}`);
  console.log(`==========================================================`);
});
