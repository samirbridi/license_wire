// Armazenamento dos destinatários de notificação de abertura por placa (REV: build 0066).
//
// Dois registros simples, cada um num arquivo JSON próprio: assinaturas Web Push (um navegador que
// pediu para receber notificações) e chats do Telegram (um usuário que iniciou conversa com o bot).
// Guarda só o necessário para entregar a notificação; nunca guarda decisão nem histórico — isso é
// responsabilidade de plate-gate.mjs (fila) e do Logbook (activity-log.mjs), não deste módulo.
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

async function readJsonArray(file) {
  try { const parsed = JSON.parse(await readFile(file, 'utf8')); return Array.isArray(parsed) ? parsed : []; }
  catch (e) { if (e.code !== 'ENOENT' && e.name !== 'SyntaxError') throw e; return []; }
}
async function writeJsonArray(file, rows) {
  await mkdir(dirname(file), {recursive: true, mode: 0o700});
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(rows, null, 2), {mode: 0o600});
  await rename(tmp, file);
}

// Uma assinatura Web Push é o objeto que o navegador devolve (endpoint + chaves p256dh/auth); endpoint
// identifica o par navegador+dispositivo e é a chave natural (um mesmo aparelho reassina no mesmo endpoint).
export function createPushSubscriptionStore({file}) {
  return {
    async list() { return readJsonArray(file); },
    async add(subscription) {
      if (!subscription?.endpoint || typeof subscription.endpoint !== 'string') throw new Error('Assinatura push inválida.');
      const rows = await readJsonArray(file);
      const next = rows.filter(r => r.endpoint !== subscription.endpoint);
      next.push({...subscription, addedAt: new Date().toISOString()});
      await writeJsonArray(file, next);
      return next.length;
    },
    async remove(endpoint) {
      const rows = await readJsonArray(file);
      const next = rows.filter(r => r.endpoint !== endpoint);
      await writeJsonArray(file, next);
      return rows.length !== next.length;
    },
  };
}

// Um chat do Telegram é só o chatId numérico que o bot recebeu num /start; sem token nem segredo algum
// guardado aqui (o token do bot fica em variável de ambiente, nunca neste arquivo).
export function createTelegramChatStore({file}) {
  return {
    async list() { return (await readJsonArray(file)).map(r => r.chatId); },
    async add(chatId, label = null) {
      if (!Number.isInteger(chatId)) throw new Error('chatId do Telegram inválido.');
      const rows = await readJsonArray(file);
      if (rows.some(r => r.chatId === chatId)) return rows.length;
      rows.push({chatId, label, addedAt: new Date().toISOString()});
      await writeJsonArray(file, rows);
      return rows.length;
    },
    async remove(chatId) {
      const rows = await readJsonArray(file);
      const next = rows.filter(r => r.chatId !== chatId);
      await writeJsonArray(file, next);
      return rows.length !== next.length;
    },
  };
}
