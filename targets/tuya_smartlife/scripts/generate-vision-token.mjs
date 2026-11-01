// Gera (uma única vez) o segredo compartilhado entre plate-watcher.mjs e a rota de ingestão
// POST /api/vision/plate-event do portal. Não é uma sessão de usuário nem uma conta: é um segredo
// fixo de máquina-para-máquina, do mesmo jeito que o gateway Cloudflare->portal já usa um token fixo
// (ver portal-gate.mjs). Nunca sobrescreve um token já existente.
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'vision-ingest-token.json');

if (existsSync(target)) {
  console.log(JSON.stringify({status: 'exists', file: target}));
} else {
  mkdirSync(dirname(target), {recursive: true});
  const token = randomBytes(32).toString('hex');
  const body = {
    token,
    createdAt: new Date().toISOString(),
    purpose: 'POST /api/vision/plate-event (plate-watcher.mjs -> portal), machine-to-machine only, never a user session',
  };
  writeFileSync(target, JSON.stringify(body, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({status: 'generated', file: target}));
}
