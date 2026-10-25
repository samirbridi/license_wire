import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = process.env.MIZIN_CAMERAS_TARGET ? resolve(process.env.MIZIN_CAMERAS_TARGET) : resolve(HERE, '../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const constantEquals = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);

function atomicJson(path, data) {
  const temp = path + '.' + randomBytes(4).toString('hex') + '.tmp';
  writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temp, path);
}

export function createCentral(options = {}) {
  const runtime = options.runtime ?? join(TARGET, 'runtime/central');
  const upstream = options.upstream ?? 'http://127.0.0.1:19843';
  const ffmpeg = options.ffmpeg ?? process.env.MIZIN_CAMERAS_FFMPEG ?? 'ffmpeg';
  const cameras = options.cameras ?? JSON.parse(readFileSync(join(runtime, 'cameras.json'), 'utf8'));
  if (!Array.isArray(cameras) || cameras.some(c => !/^[a-z0-9_]{1,64}$/.test(c.id) || !/^[a-z0-9_]{1,64}$/.test(c.sourceAlias))) throw new Error('Invalid camera inventory');
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(upstream)) throw new Error('Bridge must remain on loopback');
  const byId = new Map(cameras.map(c => [c.id, c]));
  mkdirSync(runtime, { recursive: true });
  const sessionsPath = join(runtime, 'sessions.json');
  const sessions = existsSync(sessionsPath) ? JSON.parse(readFileSync(sessionsPath, 'utf8')) : {};
  const bootstrap = options.bootstrap ?? random();
  const bootstrapExpiry = Date.now() + 60 * 60_000;
  const invitations = new Map([[sha(bootstrap), { expires: bootstrapExpiry }]]);
  const snapshots = new Map();
  const processes = new Set();
  const activeVideos = new Map();
  const attempts = new Map();
  let snapshotJobs = 0;
  const snapshotQueue = [];
  const started = Date.now();
  let actualPort = options.port ?? 19845;
  let closing = false;

  function saveSessions() {
    for (const [key, session] of Object.entries(sessions)) if (session.expires < Date.now()) delete sessions[key];
    atomicJson(sessionsPath, sessions);
  }
  saveSessions();

  function headers(res, type = 'application/json; charset=utf-8') {
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  }
  function json(res, code, value) { headers(res); res.writeHead(code); res.end(JSON.stringify(value)); }
  function sessionFor(req) {
    const value = /(?:^|;\s*)mizin_camera=([A-Za-z0-9_-]{40,80})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    if (!value) return null;
    const key = sha(value), entry = sessions[key];
    return entry && entry.expires > Date.now() ? { key, ...entry } : null;
  }
  function validOrigin(req) {
    try { return new URL(req.headers.origin).host === req.headers.host && new URL(req.headers.origin).protocol === 'http:'; }
    catch { return false; }
  }
  async function bodyJson(req) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Body too large'); }
    return JSON.parse(body);
  }
  function spawnMedia(args) {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    processes.add(child);
    child.once('close', () => processes.delete(child));
    // Drain diagnostics; source URLs and authentication are never sent to the UI.
    child.stderr.resume();
    return child;
  }
  function source(camera) { return `${upstream}/api/stream.mp4?src=${encodeURIComponent(camera.sourceAlias)}`; }
  function scheduleSnapshot(task) {
    return new Promise((accept, reject) => {
      snapshotQueue.push({ task, accept, reject });
      pumpSnapshots();
    });
  }
  function pumpSnapshots() {
    while (!closing && snapshotJobs < 2 && snapshotQueue.length) {
      const item = snapshotQueue.shift(); snapshotJobs++;
      Promise.resolve().then(item.task).then(item.accept, item.reject).finally(() => { snapshotJobs--; pumpSnapshots(); });
    }
  }
  async function getSnapshot(camera) {
    const cached = snapshots.get(camera.id);
    if (cached?.data && Date.now() - cached.at < 60_000) return cached;
    if (cached?.pending) return cached.pending;
    const pending = scheduleSnapshot(() => new Promise((accept, reject) => {
      const child = spawnMedia(['-hide_banner', '-nostdin', '-loglevel', 'error', '-rw_timeout', '25000000', '-i', source(camera), '-map', '0:v:0', '-an', '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '5', '-f', 'image2pipe', 'pipe:1']);
      const chunks = []; let size = 0, finished = false;
      const timer = setTimeout(() => { child.kill(); done(new Error('Snapshot timeout')); }, 40_000);
      function done(error) {
        if (finished) return; finished = true; clearTimeout(timer);
        if (error) { snapshots.delete(camera.id); reject(error); return; }
        const data = Buffer.concat(chunks);
        if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) { snapshots.delete(camera.id); reject(new Error('No image')); return; }
        const result = { data, at: Date.now() }; snapshots.set(camera.id, result); accept(result);
      }
      child.stdout.on('data', chunk => { size += chunk.length; if (size > 2_000_000) { child.kill(); done(new Error('Image too large')); } else chunks.push(chunk); });
      child.once('error', done);
      child.once('close', code => done(code === 0 ? null : new Error('Camera unavailable')));
    }));
    snapshots.set(camera.id, { pending });
    return pending;
  }

  async function route(req, res) {
    const allowedHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    // Remote routes are deliberately disabled until a private HTTPS gateway is configured.
    if (!allowedHosts.includes(req.headers.host) || req.headers['x-forwarded-for'] || req.headers['forwarded']) return json(res, 403, { error: 'Acesso externo ainda não configurado.' });
    const url = new URL(req.url, `http://127.0.0.1:${actualPort}`);
    if (req.method === 'GET' && STATIC.has(url.pathname)) {
      const [file, type] = STATIC.get(url.pathname); headers(res, type); res.end(readFileSync(join(HERE, 'public', file))); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/version') {
      const path = join(HERE, 'public/version.json');
      return json(res, 200, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { display: 'Prévia em desenvolvimento' });
    }
    if (req.method === 'POST' && url.pathname === '/api/session') {
      if (!validOrigin(req)) return json(res, 403, { error: 'Origem não autorizada.' });
      const bucket = attempts.get(req.socket.remoteAddress) ?? { count: 0, start: Date.now() };
      if (Date.now() - bucket.start > 15 * 60_000) { bucket.count = 0; bucket.start = Date.now(); }
      if (bucket.count >= 8) return json(res, 429, { error: 'Aguarde antes de tentar novamente.' });
      const data = await bodyJson(req);
      const invitationKey = sha(String(data.code ?? ''));
      const invitation = invitations.get(invitationKey);
      if (!invitation || Date.now() > invitation.expires) {
        bucket.count++; attempts.set(req.socket.remoteAddress, bucket); return json(res, 401, { error: 'Código inválido ou expirado.' });
      }
      invitations.delete(invitationKey);
      const token = random(); sessions[sha(token)] = { csrf: random(), expires: Date.now() + 30 * 86400_000 };
      saveSessions();
      res.setHeader('Set-Cookie', `mizin_camera=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}`);
      return json(res, 200, { ok: true });
    }
    const session = sessionFor(req);
    if (!session) return json(res, 401, { error: 'Conecte este dispositivo à central.' });
    if (req.method === 'GET' && url.pathname === '/api/session') return json(res, 200, { csrf: session.csrf });
    if (req.method === 'POST' && url.pathname === '/api/local-link') {
      if (!validOrigin(req) || !constantEquals(req.headers['x-csrf-token'], session.csrf)) return json(res, 403, { error: 'Requisição não autorizada.' });
      for (const [key, value] of invitations) if (value.expires < Date.now()) invitations.delete(key);
      if (invitations.size >= 5) return json(res, 429, { error: 'Já existem links de acesso pendentes.' });
      const code = random(), expires = Date.now() + 10 * 60_000;
      invitations.set(sha(code), { expires });
      const access = { url: `http://127.0.0.1:${actualPort}/#pair=${code}`, expires };
      atomicJson(join(runtime, 'local-access.json'), access);
      return json(res, 200, access);
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      if (!validOrigin(req) || !constantEquals(req.headers['x-csrf-token'], session.csrf)) return json(res, 403, { error: 'Requisição não autorizada.' });
      activeVideos.get(session.key)?.kill(); activeVideos.delete(session.key);
      delete sessions[session.key]; saveSessions();
      res.setHeader('Set-Cookie', 'mizin_camera=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/cameras') return json(res, 200, cameras.map(({ id, name, family, sd }) => ({ id, name, family, sd })));
    if (req.method === 'GET' && url.pathname === '/api/status') {
      let bridge = false;
      try { const response = await fetch(upstream + '/api/streams', { signal: AbortSignal.timeout(3000) }); bridge = response.ok; await response.body?.cancel(); } catch {}
      return json(res, 200, { bridge, cameras: cameras.length, uptime: Math.floor((Date.now() - started) / 1000), remoteEnabled: false });
    }
    const match = /^\/api\/(snapshot|video)\/([a-z0-9_]{1,64})$/.exec(url.pathname);
    if (req.method !== 'GET' || !match || !byId.has(match[2])) return json(res, 404, { error: 'Recurso não encontrado.' });
    const camera = byId.get(match[2]);
    if (match[1] === 'snapshot') {
      try {
        const snapshot = await getSnapshot(camera);
        if (res.destroyed) return;
        headers(res, 'image/jpeg'); res.setHeader('X-Captured-At', String(snapshot.at)); res.end(snapshot.data);
      } catch { if (!res.destroyed) json(res, 503, { error: 'Prévia indisponível. Tente abrir o vídeo.' }); }
      return;
    }
    activeVideos.get(session.key)?.kill();
    if (activeVideos.size >= 2 && !activeVideos.has(session.key)) return json(res, 429, { error: 'A central já está transmitindo para dois dispositivos.' });
    const quality = ['economy', 'balanced', 'detail'].includes(url.searchParams.get('quality')) ? url.searchParams.get('quality') : 'balanced';
    const width = camera.sd || quality === 'economy' ? 640 : quality === 'detail' ? 1920 : 1280;
    const bitrate = width === 640 ? '700k' : width === 1280 ? '1800k' : '3000k';
    const child = spawnMedia(['-hide_banner', '-nostdin', '-loglevel', 'error', '-rw_timeout', '25000000', '-i', source(camera), '-map', '0:v:0', '-an', '-vf', `scale=w='min(${width},iw)':h=-2`, '-r', '15', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bitrate, '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1']);
    activeVideos.set(session.key, child);
    let sent = false;
    const timer = setTimeout(() => { child.kill(); if (!res.headersSent) json(res, 504, { error: 'A câmera não respondeu a tempo.' }); else res.destroy(); }, 45_000);
    child.stdout.once('data', chunk => { if (res.destroyed) return; sent = true; clearTimeout(timer); headers(res, 'video/mp4'); res.setHeader('Accept-Ranges', 'none'); res.write(chunk); child.stdout.pipe(res); });
    child.once('error', () => { clearTimeout(timer); if (!res.headersSent && !res.destroyed) json(res, 503, { error: 'Não foi possível iniciar o vídeo.' }); });
    child.once('close', () => { clearTimeout(timer); if (activeVideos.get(session.key) === child) activeVideos.delete(session.key); if (!res.destroyed) { if (!sent && !res.headersSent) json(res, 503, { error: 'Não foi possível conectar à câmera.' }); else res.end(); } });
    res.once('close', () => { clearTimeout(timer); child.kill(); if (activeVideos.get(session.key) === child) activeVideos.delete(session.key); });
  }

  const server = http.createServer((req, res) => { route(req, res).catch(() => { if (!res.headersSent && !res.destroyed) json(res, 400, { error: 'Não foi possível atender a solicitação.' }); else res.destroy(); }); });
  server.headersTimeout = 15_000; server.requestTimeout = 60_000;
  server.maxHeadersCount = 50;
  return {
    server, bootstrap,
    async start() {
      await new Promise((accept, reject) => { server.once('error', reject); server.listen(actualPort, '127.0.0.1', accept); });
      actualPort = server.address().port;
      atomicJson(join(runtime, 'local-access.json'), { url: `http://127.0.0.1:${actualPort}/#pair=${bootstrap}`, expires: bootstrapExpiry });
      return actualPort;
    },
    async close() {
      closing = true;
      for (const child of processes) child.kill();
      for (const item of snapshotQueue.splice(0)) item.reject(new Error('Central stopped'));
      server.closeAllConnections();
      await new Promise(accept => server.close(accept));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createCentral();
  const port = await app.start();
  console.log(`Mizin Câmeras: http://127.0.0.1:${port}/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
