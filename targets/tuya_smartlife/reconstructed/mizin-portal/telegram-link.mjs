// Vínculo de conta do Telegram ao portal (REV: build 0066).
//
// Um administrador ou membro autenticado gera um código de uso único no portal; a pessoa dona do
// Telegram manda esse código para o bot (`/start CODE`). Só depois disso o chatId dela entra na lista
// de quem recebe notificação de placa — nada aqui decide ou confirma pedido de portão, só liga uma
// conta Telegram a uma pessoa já autenticada no sistema.
import {randomBytes} from 'node:crypto';

const DEFAULT_TTL_MS = 10 * 60_000; // 10 min para digitar o código no Telegram antes de expirar
// Sem caracteres ambíguos ao digitar num teclado de celular: 0/O, 1/I/L ficam de fora de propósito.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

export function createTelegramLinkCodes({ttlMs = DEFAULT_TTL_MS, now = Date.now} = {}) {
  const codes = new Map(); // code -> {by, createdAt, expiresAt}
  function prune() {
    for (const [code, entry] of codes) if (now() > entry.expiresAt) codes.delete(code);
  }
  return {
    // Chamado pela rota autenticada do portal quando a pessoa pede para vincular o Telegram.
    generate({by}) {
      prune();
      if (!by) throw new Error('Geração de código requer usuário autenticado.');
      const code = generateCode();
      const createdAt = now();
      codes.set(code, {by, createdAt, expiresAt: createdAt + ttlMs});
      return {code, expiresAt: createdAt + ttlMs};
    },
    // Chamado pelo webhook do Telegram ao receber "/start CODE". Uso único: consumido mesmo se o
    // vínculo final falhar por outro motivo, para um código roubado/visto não poder ser reutilizado.
    consume(code) {
      prune();
      const normalized = String(code || '').trim().toUpperCase();
      const entry = codes.get(normalized);
      if (!entry) throw new Error('Código inválido ou expirado.');
      codes.delete(normalized);
      return entry;
    },
  };
}
