/**
 * BYD Dolphin Mini EV — SDK & Telemetria
 * Reconstruído para integração direta com a plataforma Mizin Home.
 * Suporta armazenamento de telemetria em runtime/dolphin_telemetry_latest.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(TARGET_ROOT, 'runtime');
const ENV_FILE = path.join(RUNTIME_DIR, 'credenciais_byd.env');
const TELEMETRY_FILE = path.join(RUNTIME_DIR, 'dolphin_telemetry_latest.json');

export const DOLPHIN_SPECS = {
  model: 'BYD Dolphin Mini EV',
  batteryCapacityKwh: 38.0,
  batteryType: 'Blade Battery (LFP)',
  maxRangeKm: 280,
  nominalTirePressurePsi: 36.0,
};

export function loadBydEnv(filePath = ENV_FILE) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

export function getDefaultDolphinTelemetry() {
  return {
    id: 'dolphin_mini',
    brand: 'BYD',
    model: 'Dolphin Mini EV (Blade)',
    plate: 'BRA-5X88',
    color: 'Verde Sprout',
    powerType: 'BEV 100% Elétrico',
    batteryCapacityKwh: 38.0,
    batterySoc: 78,
    evRangeKm: 218,
    maxRangeKm: 280,
    chargingState: 'disconnected', // 'disconnected' | 'charging' | 'completed'
    plugConnected: false,
    chargingPowerKw: 0,
    chargingTimeMin: 0,
    aux12vBatterySoc: 96,
    odometerKm: 8940,
    doorsLocked: true,
    doors: {
      fl: false,
      fr: false,
      rl: false,
      rr: false,
      trunk: false,
      hood: false,
    },
    windows: {
      fl: 'closed',
      fr: 'closed',
      rl: 'closed',
      rr: 'closed',
    },
    tires: {
      fl: { psi: 36.0, tempC: 24, status: 'ok' },
      fr: { psi: 36.2, tempC: 24, status: 'ok' },
      rl: { psi: 35.8, tempC: 24, status: 'ok' },
      rr: { psi: 35.9, tempC: 24, status: 'ok' },
    },
    climate: {
      active: false,
      targetTempC: 21.5,
      cabinTempC: 23.8,
    },
    location: {
      lat: -29.9189,
      lon: -51.1782,
      address: 'Garagem Residencial (Home)',
      updatedAt: new Date().toISOString(),
    },
    lastSync: new Date().toISOString(),
    connected: true,
    source: 'BYD Cloud / Simulado',
  };
}

export function getLatestDolphinTelemetry() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      const data = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf8'));
      return data;
    }
  } catch {}
  return getDefaultDolphinTelemetry();
}

export function saveDolphinTelemetry(data) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

