import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { parseCentralAV } from './media-diagnostics.mjs';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const state = JSON.parse(readFileSync(join(target, 'release-state.json'), 'utf8'));
const { createCentral } = await import(pathToFileURL(join(target, state.artifact, 'server.mjs')));
const cameras = JSON.parse(readFileSync(join(target, 'runtime/central/cameras.json'), 'utf8'));
const camera = cameras.find(camera => camera.views?.length === 2);
const ffmpeg = JSON.parse(readFileSync(join(target, 'runtime/central/tool-paths.json'), 'utf8')).ffmpeg;
const diagnosticFolder = join(target, 'evidence/private/dual-diagnostics'); mkdirSync(diagnosticFolder, { recursive: true });
function spawnObserved(command, args, options) {
  const child = spawn(command, args, options); let diagnostics = '';
  child.stderr.on('data', data => { diagnostics += data; if (diagnostics.length > 100000) diagnostics = diagnostics.slice(-100000); });
  child.once('close', code => writeFileSync(join(diagnosticFolder, `encoder-${child.pid}-${code}.log`), diagnostics));
  return child;
}
const app = createCentral({ runtime: join(target, 'runtime/qa-dual'), cameras: [camera], port: 0, encoder: 'h264_nvenc', ffmpeg, spawnProcess: spawnObserved });
const origin = `http://127.0.0.1:${await app.start()}`;
const login = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: app.bootstrap }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
try {
  const results = await Promise.all(camera.views.map(async view => {
    const abort = new AbortController(), deadline = setTimeout(() => abort.abort(), 60000);
    let child, input, diagnostics = '', progress = '', firstBytesAt;
    try {
      const response = await fetch(`${origin}/api/video/${camera.id}?view=${view.id}&quality=original`, { headers: { Cookie: cookie }, signal: abort.signal });
      if (!response.ok) throw new Error('Video returned HTTP ' + response.status);
      firstBytesAt = Date.now();
      child = spawn(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'info', '-nostats', '-progress', 'pipe:1', '-i', 'pipe:0', '-t', '8', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', 'NUL'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdout.on('data', data => { progress += data; }); child.stderr.on('data', data => { diagnostics += data; }); child.stdin.on('error', () => {});
      input = Readable.fromWeb(response.body); input.on('error', () => {}); input.pipe(child.stdin);
      const exit = await new Promise((accept, reject) => { child.once('close', accept); child.once('error', reject); abort.signal.addEventListener('abort', () => { child.kill(); reject(new Error('Timed out')); }, { once: true }); });
      const frames = [...progress.matchAll(/^frame=(\d+)/gm)].map(match => Number(match[1]));
      const result = { view: view.id, ...parseCentralAV(diagnostics, exit), decodedFrames: Math.max(0, ...frames), firstBytesAt, endedAt: Date.now() };
      result.pass = result.pass && result.decodedFrames >= 100;
      return result;
    } catch (error) { return { view: view.id, pass: false, error: error.message, firstBytesAt: firstBytesAt ?? null, endedAt: Date.now() }; }
    finally { clearTimeout(deadline); abort.abort(); input?.destroy(); child?.kill(); }
  }));
  const overlapMilliseconds = results.every(result => result.firstBytesAt) ? Math.max(0, Math.min(...results.map(result => result.endedAt)) - Math.max(...results.map(result => result.firstBytesAt))) : 0;
  const pass = results.every(result => result.pass) && overlapMilliseconds > 1000;
  const observedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const receipt = { observedDate, version: state.version, sourceCommit: state.sourceCommit, startupMode: 'concurrent_client_requests', twoViewsSameSession: true, sameDevice: true, method: 'Concurrent authenticated H264/AAC decode to null, no video/audio recording or playback', overlapMilliseconds, pass, results };
  const receiptPath = join(target, 'evidence/builds', observedDate.replaceAll('-', '') + '-dual-live-qa.json');
  if (existsSync(receiptPath)) copyFileSync(receiptPath, receiptPath.replace('.json', '-previous-' + Date.now() + '.json'));
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt)); if (!pass) process.exitCode = 1;
} finally { await app.close(); }
