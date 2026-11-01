// Autenticação de máquina-para-máquina para POST /api/vision/plate-event (REV: build 0066).
//
// plate-watcher.mjs roda como script no PC da GPU, sem navegador e sem cookie de sessão — não pode
// (e não deve) passar pelo portalGate normal, que exige login humano. Em vez disso carrega este único
// segredo fixo gerado por scripts/generate-vision-token.mjs, do mesmo jeito que o gateway Cloudflare->
// portal já usa um token fixo (ver portal-gate.mjs). Comparação em tempo constante: um atacante medindo
// a latência da resposta não pode inferir o token caractere a caractere.
import {timingSafeEqual} from 'node:crypto';

export function verifyIngestToken(headerValue, expectedToken) {
  if (typeof headerValue !== 'string' || typeof expectedToken !== 'string' || !expectedToken) return false;
  if (Buffer.byteLength(headerValue) !== Buffer.byteLength(expectedToken)) return false;
  return timingSafeEqual(Buffer.from(headerValue), Buffer.from(expectedToken));
}
