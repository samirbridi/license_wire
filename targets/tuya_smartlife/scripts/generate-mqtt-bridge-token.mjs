// Gera (uma única vez) o segredo compartilhado entre mqtt-bridge-runner.mjs e as rotas
// GET /api/mqtt-bridge/devices e POST /api/mqtt-bridge/command do portal. Segredo próprio, nunca o
// mesmo de scripts/generate-vision-token.mjs: processos de confiança diferentes não compartilham
// credencial. Nunca sobrescreve um token já existente.
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'mqtt-bridge-token.json');

if (existsSync(target)) {
  console.log(JSON.stringify({status: 'exists', file: target}));
} else {
  mkdirSync(dirname(target), {recursive: true});
  const token = randomBytes(32).toString('hex');
  const body = {
    token,
    createdAt: new Date().toISOString(),
    purpose: 'GET /api/mqtt-bridge/devices, POST /api/mqtt-bridge/command (mqtt-bridge-runner.mjs -> portal), machine-to-machine only, never a user session',
  };
  writeFileSync(target, JSON.stringify(body, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({status: 'generated', file: target}));
}
