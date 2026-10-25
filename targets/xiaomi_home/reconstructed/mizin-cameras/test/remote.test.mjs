import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createCentral } from '../server.mjs';
import http from 'node:http';

// Native HTTP deliberately sets Host, as an actual reverse proxy would.
// Node fetch may replace that forbidden browser header with the URL host.
function proxyFetch(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((accept, reject) => {
    const request = http.request(url, { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => accept({ status: response.statusCode, headers: new Headers(response.headers), json: async () => JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    request.on('error', reject); request.end(body);
  });
}

async function setup() {
  const runtime = mkdtempSync(join(tmpdir(), 'mizin-remote-test-'));
  const remote = { origin: 'https://cameras.example.test', gatewayToken: 'a'.repeat(43), port: 0 };
  const app = createCentral({ runtime, cameras: [], port: 0, remote });
  const local = `http://127.0.0.1:${await app.start()}`;
  const gateway = `http://127.0.0.1:${app.gatewayServer.address().port}`;
  const proxyHeaders = { Host: 'cameras.example.test', 'X-Mizin-Gateway': remote.gatewayToken, 'X-Forwarded-Proto': 'https', 'X-Mizin-Client-IP': '203.0.113.10' };
  const login = await fetch(local + '/api/session', { method: 'POST', headers: { Origin: local, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: app.bootstrap }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const session = await (await fetch(local + '/api/session', { headers: { Cookie: cookie } })).json();
  const localHeaders = { Cookie: cookie, Origin: local, 'X-CSRF-Token': session.csrf };
  const cleanup = async () => {
    await app.close();
    const absolute = resolve(runtime);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.split(sep).at(-1).startsWith('mizin-remote-test-')) throw new Error('Unsafe cleanup');
    rmSync(absolute, { recursive: true, force: true });
  };
  return { app, remote, local, gateway, proxyHeaders, localHeaders, cleanup };
}
test('gateway rejects wrong host, missing shared secret and non-HTTPS forwarding', async () => {
  const f = await setup();
  try {
    assert.equal((await proxyFetch(f.gateway)).status, 403);
    for (const replacement of [{ Host: 'evil.test' }, { 'X-Mizin-Gateway': 'invalid' }, { 'X-Forwarded-Proto': 'http' }]) assert.equal((await proxyFetch(f.gateway, { headers: { ...f.proxyHeaders, ...replacement } })).status, 403);
    assert.equal((await proxyFetch(f.gateway, { headers: f.proxyHeaders })).status, 200);
    assert.equal((await fetch(f.local, { headers: f.proxyHeaders })).status, 403);
  } finally { await f.cleanup(); }
});
test('remote pairing is one-use, HTTPS Secure and isolated from local sessions', async () => {
  const f = await setup();
  try {
    assert.equal((await fetch(f.local + '/api/remote-link', { method: 'POST' })).status, 401);
    const access = await (await fetch(f.local + '/api/remote-link', { method: 'POST', headers: f.localHeaders })).json();
    const code = new URLSearchParams(new URL(access.url).hash.slice(1)).get('pair');
    const headers = { ...f.proxyHeaders, Origin: f.remote.origin, 'Content-Type': 'application/json' };
    const wrongOrigin = await proxyFetch(f.gateway + '/api/session', { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' }, body: JSON.stringify({ code }) });
    assert.equal(wrongOrigin.status, 403);
    const request = () => proxyFetch(f.gateway + '/api/session', { method: 'POST', headers, body: JSON.stringify({ code }) });
    const login = await request(); assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /; Secure/);
    assert.equal((await request()).status, 401);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await proxyFetch(f.gateway + '/api/cameras', { headers: { ...f.proxyHeaders, Cookie: cookie } })).status, 200);
    assert.equal((await fetch(f.local + '/api/cameras', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await proxyFetch(f.gateway + '/api/cameras', { headers: { ...f.proxyHeaders, Cookie: f.localHeaders.Cookie } })).status, 401);
    const revoked = await fetch(f.local + '/api/revoke-remote-sessions', { method: 'POST', headers: f.localHeaders });
    assert.equal((await revoked.json()).revoked, 1);
    assert.equal((await proxyFetch(f.gateway + '/api/cameras', { headers: { ...f.proxyHeaders, Cookie: cookie } })).status, 401);
  } finally { await f.cleanup(); }
});
test('local bootstrap cannot authorize an external browser', async () => {
  const f = await setup();
  try {
    const link = await (await fetch(f.local + '/api/local-link', { method: 'POST', headers: f.localHeaders })).json();
    const code = new URLSearchParams(new URL(link.url).hash.slice(1)).get('pair');
    assert.equal((await proxyFetch(f.gateway + '/api/session', { method: 'POST', headers: { ...f.proxyHeaders, Origin: f.remote.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).status, 401);
  } finally { await f.cleanup(); }
});

