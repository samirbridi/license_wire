import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { validDay } from './public/recordings-core.js';

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
  ['/player.js', ['player.js', 'text/javascript; charset=utf-8']],
  ['/icons.js', ['icons.js', 'text/javascript; charset=utf-8']],
  ['/recordings.js', ['recordings.js', 'text/javascript; charset=utf-8']],
  ['/recordings-core.js', ['recordings-core.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);
for (const file of ['dom.js', 'region.js', 'region-BjECuWZR.js', 'resample-CXlaZ5ZQ.js', 'normalize-CYnN3Npw.js', 'spring-B_P92nf6.js', 'LICENSE.txt']) {
  const path = 'vendor/morphicons/' + file;
  STATIC.set('/' + path, [path, file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8']);
}

function atomicJson(path, data) {
  const temp = path + '.' + randomBytes(4).toString('hex') + '.tmp';
  writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temp, path);
}

export function createCentral(options = {}) {
  const runtime = options.runtime ?? join(TARGET, 'runtime/central');
  const upstream = options.upstream ?? 'http://127.0.0.1:19843';
  const ffmpeg = options.ffmpeg ?? process.env.MIZIN_CAMERAS_FFMPEG ?? 'ffmpeg';
  const mediaConfig = join(runtime, 'media-config.json');
  const encoder = options.encoder ?? (existsSync(mediaConfig) ? JSON.parse(readFileSync(mediaConfig, 'utf8')).encoder : 'libx264');
  if (!['libx264', 'h264_nvenc'].includes(encoder)) throw new Error('Unsupported encoder');
  const gatewayConfig = join(runtime, 'https-gateway.json');
  const remote = options.remote ?? (existsSync(gatewayConfig) ? JSON.parse(readFileSync(gatewayConfig, 'utf8')) : null);
  if (remote) {
    const address = new URL(remote.origin);
    if (address.protocol !== 'https:' || address.origin !== remote.origin || address.username || address.password || address.pathname !== '/' || address.search || address.hash) throw new Error('A single explicit HTTPS origin is required');
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(remote.gatewayToken ?? '')) throw new Error('A private gateway token is required');
    if (remote.port !== undefined && (!Number.isInteger(remote.port) || remote.port < 0 || remote.port > 65535)) throw new Error('Invalid gateway port');
  }
  const cameras = options.cameras ?? JSON.parse(readFileSync(join(runtime, 'cameras.json'), 'utf8'));
  if (!Array.isArray(cameras) || cameras.some(c => !/^[a-z0-9_]{1,64}$/.test(c.id) || !/^[a-z0-9_]{1,64}$/.test(c.sourceAlias))) throw new Error('Invalid camera inventory');
  for (const camera of cameras) {
    const views = camera.views ?? [{ id: 'main', label: 'Principal', sourceAlias: camera.sourceAlias, originalAlias: camera.originalAlias }];
    if (!views.length || views.length > 4 || views.some(v => !/^[a-z0-9_]{1,64}$/.test(v.id) || !/^[a-z0-9_]{1,64}$/.test(v.sourceAlias) || (v.originalAlias && !/^[a-z0-9_]{1,64}$/.test(v.originalAlias)))) throw new Error('Invalid camera views');
  }
  const viewsFor = camera => camera.views ?? [{ id: 'main', label: 'Principal', sourceAlias: camera.sourceAlias, originalAlias: camera.originalAlias }];
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(upstream)) throw new Error('Bridge must remain on loopback');
  const byId = new Map(cameras.map(c => [c.id, c]));
  mkdirSync(runtime, { recursive: true });
  const sessionsPath = join(runtime, 'sessions.json');
  const sessions = existsSync(sessionsPath) ? JSON.parse(readFileSync(sessionsPath, 'utf8')) : {};
  const bootstrap = options.bootstrap ?? random();
  const bootstrapExpiry = Date.now() + 60 * 60_000;
  const invitations = new Map([[sha(bootstrap), { expires: bootstrapExpiry, audience: 'local' }]]);
  const requestContexts = new WeakMap();
  const snapshots = new Map();
  const processes = new Set();
  const activeVideos = new Map();
  const cameraStarts = new Map();
  async function acquireCameraStart(id) {
    const previous = cameraStarts.get(id) ?? Promise.resolve();
    let advance; const next = new Promise(accept => { advance = accept; });
    const tail = previous.catch(() => {}).then(() => next); cameraStarts.set(id, tail);
    await previous.catch(() => {});
    let released = false;
    return () => { if (released) return; released = true; advance(); if (cameraStarts.get(id) === tail) cameraStarts.delete(id); };
  }
  function stopSessionVideos(sessionKey) {
    for (const [key, entry] of activeVideos) if (entry.sessionKey === sessionKey) { entry.child.kill(); activeVideos.delete(key); }
  }
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
    const audience = requestContexts.get(req) ? 'remote' : 'local';
    return entry && entry.expires > Date.now() && (entry.audience ?? 'local') === audience ? { key, ...entry } : null;
  }
  function validOrigin(req) {
    if (requestContexts.get(req)) return req.headers.origin === remote.origin;
    try { return new URL(req.headers.origin).host === req.headers.host && new URL(req.headers.origin).protocol === 'http:'; }
    catch { return false; }
  }
  async function bodyJson(req) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Body too large'); }
    return JSON.parse(body);
  }
  function spawnMedia(args) {
    const child = (options.spawnProcess ?? spawn)(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    processes.add(child);
    child.once('close', () => processes.delete(child));
    // Drain diagnostics; source URLs and authentication are never sent to the UI.
    child.stderr.resume();
    return child;
  }
  function source(camera) { return `${upstream}/api/stream.mp4?src=${encodeURIComponent(camera.sourceAlias)}&video=h265&audio=all`; }
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
    const pending = scheduleSnapshot(async () => {
      const releaseStart = await acquireCameraStart(camera.physicalId ?? camera.id);
      if (closing) { releaseStart(); throw new Error('Central stopped'); }
      return new Promise((accept, reject) => {
      let child;
      try { child = spawnMedia(['-hide_banner', '-nostdin', '-loglevel', 'error', '-rw_timeout', '25000000', '-analyzeduration', '1000000', '-probesize', '262144', '-i', source(camera), '-map', '0:v:0', '-an', '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '5', '-f', 'image2pipe', 'pipe:1']); }
      catch (error) { releaseStart(); reject(error); return; }
      const chunks = []; let size = 0, finished = false;
      const timer = setTimeout(() => { child.kill(); done(new Error('Snapshot timeout')); }, 40_000);
      function done(error) {
        if (finished) return; finished = true; clearTimeout(timer); releaseStart();
        if (error) { snapshots.delete(camera.id); reject(error); return; }
        const data = Buffer.concat(chunks);
        if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) { snapshots.delete(camera.id); reject(new Error('No image')); return; }
        const result = { data, at: Date.now() }; snapshots.set(camera.id, result); accept(result);
      }
      child.stdout.on('data', chunk => { size += chunk.length; if (size > 2_000_000) { child.kill(); done(new Error('Image too large')); } else chunks.push(chunk); });
      child.once('error', done);
      child.once('close', code => done(code === 0 ? null : new Error('Camera unavailable')));
    });
    });
    snapshots.set(camera.id, { pending });
    return pending;
  }

  async function route(req, res, isRemote = false) {
    requestContexts.set(req, isRemote);
    const allowedHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    if (isRemote) {
      if (!remote || req.headers.host !== new URL(remote.origin).host || req.headers['x-forwarded-proto'] !== 'https' || !constantEquals(req.headers['x-mizin-gateway'], remote.gatewayToken)) return json(res, 403, { error: 'Gateway não autorizado.' });
    } else if (!allowedHosts.includes(req.headers.host) || req.headers['x-forwarded-for'] || req.headers['forwarded'] || req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto']) return json(res, 403, { error: 'Acesso externo ainda não configurado.' });
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
      const client = isRemote && isIP(req.headers['x-mizin-client-ip'] ?? '') ? sha(req.headers['x-mizin-client-ip']) : req.socket.remoteAddress;
      const bucketKey = (isRemote ? 'remote:' : 'local:') + client;
      const bucket = attempts.get(bucketKey) ?? { count: 0, start: Date.now() };
      if (Date.now() - bucket.start > 15 * 60_000) { bucket.count = 0; bucket.start = Date.now(); }
      if (bucket.count >= 8) return json(res, 429, { error: 'Aguarde antes de tentar novamente.' });
      const data = await bodyJson(req);
      const invitationKey = sha(String(data.code ?? ''));
      const invitation = invitations.get(invitationKey);
      if (!invitation || Date.now() > invitation.expires || invitation.audience !== (isRemote ? 'remote' : 'local')) {
        bucket.count++; attempts.set(bucketKey, bucket); return json(res, 401, { error: 'Código inválido ou expirado.' });
      }
      invitations.delete(invitationKey);
      const token = random(); sessions[sha(token)] = { csrf: random(), expires: Date.now() + 30 * 86400_000, audience: isRemote ? 'remote' : 'local' };
      saveSessions();
      res.setHeader('Set-Cookie', `mizin_camera=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${isRemote ? '; Secure' : ''}`);
      return json(res, 200, { ok: true });
    }
    const session = sessionFor(req);
    if (!session) return json(res, 401, { error: 'Conecte este dispositivo à central.' });
    if (req.method === 'GET' && url.pathname === '/api/session') return json(res, 200, { csrf: session.csrf });
    if (req.method === 'POST' && ['/api/local-link', '/api/remote-link'].includes(url.pathname)) {
      if (isRemote || !validOrigin(req) || !constantEquals(req.headers['x-csrf-token'], session.csrf)) return json(res, 403, { error: 'Requisição não autorizada.' });
      const remoteLink = url.pathname === '/api/remote-link';
      if (remoteLink && !remote) return json(res, 409, { error: 'O endereço HTTPS ainda não foi configurado.' });
      for (const [key, value] of invitations) if (value.expires < Date.now()) invitations.delete(key);
      if (invitations.size >= 5) return json(res, 429, { error: 'Já existem links de acesso pendentes.' });
      const code = random(), expires = Date.now() + 10 * 60_000;
      invitations.set(sha(code), { expires, audience: remoteLink ? 'remote' : 'local' });
      const access = { url: `${remoteLink ? remote.origin : `http://127.0.0.1:${actualPort}`}/#pair=${code}`, expires };
      atomicJson(join(runtime, remoteLink ? 'remote-access.json' : 'local-access.json'), access);
      return json(res, 200, access);
    }
    if (req.method === 'POST' && url.pathname === '/api/revoke-remote-sessions') {
      if (isRemote || !validOrigin(req) || !constantEquals(req.headers['x-csrf-token'], session.csrf)) return json(res, 403, { error: 'Requisição não autorizada.' });
      let revoked = 0;
      for (const [key, entry] of Object.entries(sessions)) if (entry.audience === 'remote') { stopSessionVideos(key); delete sessions[key]; revoked++; }
      for (const [key, invitation] of invitations) if (invitation.audience === 'remote') invitations.delete(key);
      saveSessions(); return json(res, 200, { revoked });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      if (!validOrigin(req) || !constantEquals(req.headers['x-csrf-token'], session.csrf)) return json(res, 403, { error: 'Requisição não autorizada.' });
      stopSessionVideos(session.key);
      delete sessions[session.key]; saveSessions();
      res.setHeader('Set-Cookie', `mizin_camera=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isRemote ? '; Secure' : ''}`);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/cameras') return json(res, 200, cameras.map(camera => ({ id: camera.id, name: camera.name, family: camera.family, sd: camera.sd, views: viewsFor(camera).map(({ id, label }) => ({ id, label })) })));
    if (req.method === 'GET' && url.pathname === '/api/status') {
      let bridge = false;
      try { const response = await fetch(upstream + '/api/streams', { signal: AbortSignal.timeout(3000) }); bridge = response.ok; await response.body?.cancel(); } catch {}
      return json(res, 200, { bridge, cameras: cameras.length, uptime: Math.floor((Date.now() - started) / 1000), remoteEnabled: !!remote, remoteConfigured: !!remote, pairingAvailable: !!remote && !isRemote, localPairingAvailable: !isRemote, videoLimits: { clients: 2, viewsPerClient: 2 } });
    }
    const recordingMatch = /^\/api\/recordings\/([a-z0-9_]{1,64})$/.exec(url.pathname);
    if (req.method === 'GET' && recordingMatch) {
      if (!byId.has(recordingMatch[1])) return json(res, 404, { error: 'Câmera não encontrada.' });
      const date = url.searchParams.get('date') ?? '';
      if (!validDay(date)) return json(res, 400, { error: 'Escolha uma data válida.' });
      return json(res, 200, { source: 'sd', status: 'not_integrated', date, displayTimeZone: 'America/Sao_Paulo', sourceTimeZone: null, periods: null, availableDays: null, capabilities: { playback: false, export: false } });
    }
    const match = /^\/api\/(snapshot|video)\/([a-z0-9_]{1,64})$/.exec(url.pathname);
    if (req.method !== 'GET' || !match || !byId.has(match[2])) return json(res, 404, { error: 'Recurso não encontrado.' });
    const camera = byId.get(match[2]);
    const views = viewsFor(camera), selectedView = url.searchParams.get('view') ?? views[0].id;
    const view = views.find(v => v.id === selectedView);
    if (!view) return json(res, 400, { error: 'Visão da câmera não encontrada.' });
    if (match[1] === 'snapshot') {
      try {
        const snapshot = await getSnapshot({ ...camera, physicalId: camera.id, id: camera.id + ':' + view.id, sourceAlias: view.originalAlias ?? camera.originalAlias ?? view.sourceAlias });
        if (res.destroyed) return;
        headers(res, 'image/jpeg'); res.setHeader('X-Captured-At', String(snapshot.at)); res.end(snapshot.data);
      } catch { if (!res.destroyed) json(res, 503, { error: 'Prévia indisponível. Tente abrir o vídeo.' }); }
      return;
    }
    const quality = ['economy', 'balanced', 'detail', 'original'].includes(url.searchParams.get('quality')) ? url.searchParams.get('quality') : 'balanced';
    const streamKey = `${session.key}:${camera.id}:${view.id}`;
    const releaseStart = await acquireCameraStart(camera.id);
    if (closing || res.destroyed) { releaseStart(); return; }
    if (sessionFor(req)?.key !== session.key) { releaseStart(); return json(res, 401, { error: 'Conecte este dispositivo à central.' }); }
    const clients = new Set([...activeVideos.values()].map(entry => entry.sessionKey));
    if (clients.size >= 2 && !clients.has(session.key)) { releaseStart(); return json(res, 429, { error: 'A central já está transmitindo para dois dispositivos.' }); }
    for (const [key, entry] of activeVideos) if (entry.sessionKey === session.key && entry.cameraId !== camera.id) { entry.child.kill(); activeVideos.delete(key); }
    const currentViews = [...activeVideos.values()].filter(entry => entry.sessionKey === session.key);
    if (currentViews.length >= 2 && !activeVideos.has(streamKey)) { releaseStart(); return json(res, 429, { error: 'Este dispositivo já está exibindo duas visões.' }); }
    activeVideos.get(streamKey)?.child.kill();
    const width = quality === 'original' ? 3840 : quality === 'economy' ? 640 : quality === 'detail' ? 1920 : 1280;
    const bitrate = width === 640 ? '700k' : width === 1280 ? '1800k' : width === 1920 ? '3000k' : '6000k';
    const sourceAlias = view.originalAlias ?? camera.originalAlias ?? view.sourceAlias;
    const encoding = encoder === 'h264_nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'ull'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency'];
    let child;
    try { child = spawnMedia(['-hide_banner', '-nostdin', '-loglevel', 'error', '-rw_timeout', '25000000', '-analyzeduration', '1000000', '-probesize', '262144', '-i', source({ sourceAlias }), '-map', '0:v:0', '-map', '0:a:0?', '-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-vf', `scale=w='min(${width},iw)':h=-2`, '-r', '15', ...encoding, '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bitrate, '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1']); }
    catch (error) { releaseStart(); throw error; }
    activeVideos.set(streamKey, { child, sessionKey: session.key, cameraId: camera.id, viewId: view.id });
    let sent = false;
    const timer = setTimeout(() => { releaseStart(); child.kill(); if (!res.headersSent) json(res, 504, { error: 'A câmera não respondeu a tempo.' }); else res.destroy(); }, 45_000);
    child.stdout.once('data', chunk => { releaseStart(); if (res.destroyed) return; sent = true; clearTimeout(timer); headers(res, 'video/mp4'); res.setHeader('Accept-Ranges', 'none'); res.write(chunk); child.stdout.pipe(res); });
    child.once('error', () => { releaseStart(); clearTimeout(timer); if (!res.headersSent && !res.destroyed) json(res, 503, { error: 'Não foi possível iniciar o vídeo.' }); });
    child.once('close', () => { releaseStart(); clearTimeout(timer); if (activeVideos.get(streamKey)?.child === child) activeVideos.delete(streamKey); if (!res.destroyed) { if (!sent && !res.headersSent) json(res, 503, { error: 'Não foi possível conectar à câmera.' }); else res.end(); } });
    res.once('close', () => { releaseStart(); clearTimeout(timer); child.kill(); if (activeVideos.get(streamKey)?.child === child) activeVideos.delete(streamKey); });
  }

  const server = http.createServer((req, res) => { route(req, res).catch(() => { if (!res.headersSent && !res.destroyed) json(res, 400, { error: 'Não foi possível atender a solicitação.' }); else res.destroy(); }); });
  const gatewayServer = remote ? http.createServer((req, res) => { route(req, res, true).catch(() => { if (!res.headersSent && !res.destroyed) json(res, 400, { error: 'Não foi possível atender a solicitação.' }); else res.destroy(); }); }) : null;
  server.headersTimeout = 15_000; server.requestTimeout = 60_000;
  server.maxHeadersCount = 50;
  if (gatewayServer) { gatewayServer.headersTimeout = 15_000; gatewayServer.requestTimeout = 60_000; gatewayServer.maxHeadersCount = 50; }
  return {
    server, gatewayServer, bootstrap,
    async start() {
      await new Promise((accept, reject) => { server.once('error', reject); server.listen(actualPort, '127.0.0.1', accept); });
      actualPort = server.address().port;
      if (gatewayServer) {
        try { await new Promise((accept, reject) => { gatewayServer.once('error', reject); gatewayServer.listen(remote.port ?? 19846, '127.0.0.1', accept); }); }
        catch (error) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); throw error; }
      }
      atomicJson(join(runtime, 'local-access.json'), { url: `http://127.0.0.1:${actualPort}/#pair=${bootstrap}`, expires: bootstrapExpiry });
      return actualPort;
    },
    async close() {
      closing = true;
      for (const child of processes) child.kill();
      for (const item of snapshotQueue.splice(0)) item.reject(new Error('Central stopped'));
      server.closeAllConnections();
      gatewayServer?.closeAllConnections();
      if (gatewayServer) await new Promise(accept => gatewayServer.close(accept));
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
