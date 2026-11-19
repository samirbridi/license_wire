// Senha para baixar o plugin pelo site (Cloudflare Pages Functions), no mesmo modelo do PDF-to-PPT.
// A senha fica somente no segredo DOWNLOAD_PASSWORD do projeto crispixlr (nunca neste arquivo).
// Sem o segredo configurado, o download pelo site fica bloqueado.
// O plugin instalado NAO passa por aqui: ele le latest.json e baixa direto do R2.
// O ZIP (110 MB) nao cabe no Pages (limite de 25 MiB por arquivo): depois da senha,
// /downloads/<pacote> encaminha para o mesmo arquivo publico do R2 que o atualizador usa.
const COOKIE = 'crispix_dl';
const SESSION_SECONDS = 12 * 60 * 60;
const API = '/api/download-access';
const R2_PUBLIC = 'https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev';
const PACKAGE = /^CRISPIX-\d+\.\d+\.\d+-build\d{4}-motor-local\.zip$/;
const enc = new TextEncoder();
const PRIVATE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...PRIVATE, ...headers } });
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Caminho decodificado e normalizado; null quando a codificacao e invalida. */
function normalPath(pathname) {
  let p = pathname;
  try {
    for (let i = 0; i < 4; i++) {
      const d = decodeURIComponent(p);
      if (d === p) break;
      p = d;
    }
  } catch {
    return null;
  }
  return p.replace(/\\/g, '/');
}

/** Pasta de downloads e qualquer pacote servido pelo site, mesmo com o caminho codificado ou em maiusculas. */
function isProtected(path) {
  if (path === null) return true;
  const lower = path.toLowerCase();
  return lower.split('/').includes('downloads') || /\.(exe|zip|msi)(\/|$)/.test(lower);
}

/** Nome do pacote quando o caminho e exatamente /downloads/<pacote valido>. */
function packageName(path) {
  const match = /^\/downloads\/([^/]+)$/.exec(path || '');
  return match && PACKAGE.test(match[1]) ? match[1] : '';
}

async function hmacKey(password, usage) {
  return crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function sign(password, expires) {
  const key = await hmacKey(password, 'sign');
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`dl:${expires}`)));
}

/** Comparacao em tempo constante (sobre os resumos, para nao vazar o tamanho da senha). */
async function samePassword(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

function readCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

async function isAuthorized(request, password) {
  if (!password) return false;
  const [expires, sig] = readCookie(request).split('.');
  if (!/^\d{10}$/.test(expires || '') || !/^[0-9a-f]{64}$/.test(sig || '')) return false;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const key = await hmacKey(password, 'verify');
  const bytes = new Uint8Array(sig.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', key, bytes, enc.encode(`dl:${expires}`));
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function handleApi(request, password, url) {
  if (request.method === 'GET') return json({ authorized: await isAuthorized(request, password) });

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'origem não autorizada' }, 403);

  if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', 0) });
  if (request.method !== 'POST') return json({ ok: false, error: 'método não permitido' }, 405, { Allow: 'GET, POST, DELETE' });
  if (!password) return json({ ok: false, error: 'downloads indisponíveis' }, 503);
  if (Number(request.headers.get('Content-Length') || 0) > 2048) return json({ ok: false, error: 'requisição inválida' }, 413);

  let typed = '';
  try {
    const body = await request.json();
    typed = typeof body.password === 'string' ? body.password.trim() : '';
  } catch {
    return json({ ok: false, error: 'requisição inválida' }, 400);
  }
  if (!typed || !(await samePassword(typed, password))) {
    await new Promise((r) => setTimeout(r, 700)); // atrasa tentativas repetidas
    return json({ ok: false, error: 'senha incorreta' }, 401);
  }
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = `${expires}.${await sign(password, expires)}`;
  return json({ ok: true, expires }, 200, { 'Set-Cookie': cookieHeader(value, SESSION_SECONDS) });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const password = env.DOWNLOAD_PASSWORD || '';

  if (url.pathname === API) return handleApi(request, password, url);
  const path = normalPath(url.pathname);
  if (!isProtected(path)) return next();

  const name = packageName(path);
  if (await isAuthorized(request, password)) {
    if (!name) return json({ ok: false, error: 'pacote não encontrado' }, 404);
    return new Response(null, { status: 302, headers: { Location: `${R2_PUBLIC}/${name}`, ...PRIVATE } });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'senha necessária' }, 401);
  const location = `${url.origin}/${name ? `?next=${encodeURIComponent(`/downloads/${name}`)}` : ''}#atualizar`;
  return new Response(null, { status: 302, headers: { Location: location, ...PRIVATE } });
}
