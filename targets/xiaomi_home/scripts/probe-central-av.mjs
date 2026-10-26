// Validate the authenticated app output without putting its cookie in process arguments.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { parseCentralAV } from './media-diagnostics.mjs';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = join(target, 'runtime/central'), origin = 'http://127.0.0.1:19845';
const access = JSON.parse(readFileSync(join(runtime, 'local-access.json'), 'utf8'));
const code = new URLSearchParams(new URL(access.url).hash.slice(1)).get('pair');
const login = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
if (!login.ok) throw new Error('A fresh local pairing link is required for this QA client');
const cookie = login.headers.get('set-cookie').split(';')[0];
const headers = { Cookie: cookie, Origin: origin };
const session = await (await fetch(origin + '/api/session', { headers })).json();
const ffmpeg = JSON.parse(readFileSync(join(runtime, 'tool-paths.json'), 'utf8')).ffmpeg;
const results = [];
try {
  for (const id of ['mi2k_estudio', 'aw300_garagem']) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 60_000);
    let child, input, diagnostics = '';
    try {
      const response = await fetch(origin + '/api/video/' + id + '?quality=original', { headers, signal: abort.signal });
      if (!response.ok) throw new Error('App video returned HTTP ' + response.status);
      child = spawn(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'info', '-nostats', '-i', 'pipe:0', '-t', '3', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', 'NUL'], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      child.stderr.on('data', data => { diagnostics += data.toString(); if (diagnostics.length > 100_000) diagnostics = diagnostics.slice(-100_000); });
      child.stdin.on('error', () => {});
      input = Readable.fromWeb(response.body); input.on('error', () => {}); input.pipe(child.stdin);
      const exit = await new Promise((accept, reject) => { child.once('close', accept); child.once('error', reject); abort.signal.addEventListener('abort', () => { child.kill(); reject(new Error('Decode timeout')); }, { once: true }); });
      const result = { family: id.startsWith('mi2k') ? 'Mi 2K' : 'AW300', ...parseCentralAV(diagnostics, exit) };
      results.push(result); console.log(JSON.stringify(result));
    } finally { clearTimeout(timeout); abort.abort(); input?.destroy(); child?.kill(); }
  }
} finally {
  // Leave a fresh, one-use access link for the owner, then revoke the QA session.
  await fetch(origin + '/api/local-link', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': session.csrf } });
  await fetch(origin + '/api/logout', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': session.csrf } });
}
const version = await (await fetch(origin + '/api/version')).json();
const observedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const receiptPath = join(target, 'evidence/builds', observedDate.replaceAll('-', '') + '-central-av-qa.json');
if (existsSync(receiptPath)) copyFileSync(receiptPath, receiptPath.replace('.json', '-previous-' + Date.now() + '.json'));
writeFileSync(receiptPath, JSON.stringify({ observedDate, version: version.display, sourceCommit: version.sourceCommit, results, method: 'Authenticated HTTP to stdin; H264 and AAC decoded to null; no audio played or recorded' }, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;
