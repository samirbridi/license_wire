// Regras de retenção e paginação do Logbook (REV: build 0064).
//
// O arquivo em disco guarda até MAX_ACTIVITY_LOGS eventos, sempre os mais recentes (o mais antigo
// cai primeiro quando passa do teto). GET /api/logs sem ?limit= explícito devolve só
// DEFAULT_LOGS_FETCH_LIMIT por padrão, porque o painel reconsulta e redesenha a lista inteira a
// cada 4s (fetchLogs() em app.js) — devolver os 5000 por padrão recriaria milhares de elementos no
// DOM repetidamente, pra sempre. Um ?limit= explícito (export, busca futura, etc.) ainda pode pedir
// mais, até o teto de retenção.

// ~35 eventos/dia observados em uso real => cobre uns 4-5 meses de histórico (~2MB de arquivo).
export const MAX_ACTIVITY_LOGS = 5000;
// 3x o antigo default fixo de 100; cobre cerca de 1 semana de uso sem pesar o polling do painel.
export const DEFAULT_LOGS_FETCH_LIMIT = 300;

// Insere o evento mais novo na frente e descarta o(s) mais antigo(s) além do teto. Devolve o mesmo
// array (mutado), espelhando o uso em server.mjs (unshift direto no array carregado do disco).
export function appendActivityLog(logs, entry, max = MAX_ACTIVITY_LOGS) {
  logs.unshift(entry);
  if (logs.length > max) logs.length = max;
  return logs;
}

// Resolve o parâmetro ?limit= da query string: ausente, vazio ou inválido (não numérico, zero,
// negativo) cai no default — nunca devolve uma lista vazia em silêncio por causa de um valor
// malformado. Valores válidos são sempre contidos ao teto de retenção (pedir mais do que existe
// não é erro, só não tem efeito além do que foi guardado).
export function resolveLogsLimit(rawValue, {
  defaultLimit = DEFAULT_LOGS_FETCH_LIMIT,
  maxLimit = MAX_ACTIVITY_LOGS,
} = {}) {
  const parsed = parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, maxLimit);
}
