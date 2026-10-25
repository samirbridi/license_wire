import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { createCentral } from '../server.mjs';

const roots = [];
async function fixture() {
  const runtime = mkdtempSync(join(tmpdir(), 'mizin-cameras-test-')); roots.push(runtime);
  const cameras = [{ id: 'test_camera', sourceAlias: 'test_source', name: '<Test camera>', family: 'Mi 2K', model: 'isa.camera.hlc7', sd: false, privateField: 'PRIVATE_SENTINEL' }];
  const app = createCentral({ runtime, cameras, port: 0, bootstrap: 'test-bootstrap-secret-with-sufficient-length', ffmpeg: 'not-used-in-boundary-tests' });
  const port = await app.start(), origin = `http://127.0.0.1:${port}`;
  return { app, origin, runtime, cameras };
}
async function login(fixture) {
  const response = await fetch(fixture.origin + '/api/session', { method: 'POST', headers: { Origin: fixture.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: fixture.app.bootstrap }) });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('camera data and media require a session; no private inventory in page', async () => {
  const f = await fixture();
  try {
    for (const route of ['/api/cameras', '/api/video/test_camera', '/api/snapshot/test_camera']) assert.equal((await fetch(f.origin + route)).status, 401);
    const page = await (await fetch(f.origin)).text(); assert.ok(!page.includes('PRIVATE_SENTINEL')); assert.ok(!page.includes('<Test camera>'));
  } finally { await f.app.close(); }
});
test('bootstrap is single-use and sessions are persisted only as hashes', async () => {
  const f = await fixture();
  try {
    const cookie = await login(f);
    assert.equal((await fetch(f.origin + '/api/cameras', { headers: { Cookie: cookie } })).status, 200);
    const repeated = await fetch(f.origin + '/api/session', { method: 'POST', headers: { Origin: f.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: f.app.bootstrap }) });
    assert.equal(repeated.status, 401);
    const saved = readFileSync(join(f.runtime, 'sessions.json'), 'utf8'); assert.ok(!saved.includes(cookie.split('=')[1]));
  } finally { await f.app.close(); }
});
test('external origin and proxy requests are denied before exposing data', async () => {
  const f = await fixture();
  try {
    const denied = await fetch(f.origin + '/api/session', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: f.app.bootstrap }) });
    assert.equal(denied.status, 403);
    assert.equal((await fetch(f.origin + '/', { headers: { 'X-Forwarded-For': '203.0.113.1' } })).status, 403);
  } finally { await f.app.close(); }
});
test('camera API returns allowlisted display fields and blocks arbitrary media paths', async () => {
  const f = await fixture();
  try {
    const cookie = await login(f), headers = { Cookie: cookie };
    const cameras = await (await fetch(f.origin + '/api/cameras', { headers })).json();
    assert.deepEqual(cameras, [{ id: 'test_camera', name: '<Test camera>', family: 'Mi 2K', sd: false }]);
    assert.equal((await fetch(f.origin + '/api/video/unknown', { headers })).status, 404);
    assert.equal((await fetch(f.origin + '/server.mjs', { headers })).status, 404);
  } finally { await f.app.close(); }
});
test('logout requires CSRF and invalidates the current session', async () => {
  const f = await fixture();
  try {
    const cookie = await login(f), headers = { Cookie: cookie, Origin: f.origin };
    assert.equal((await fetch(f.origin + '/api/logout', { method: 'POST', headers })).status, 403);
    const session = await (await fetch(f.origin + '/api/session', { headers })).json();
    assert.equal((await fetch(f.origin + '/api/logout', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': session.csrf } })).status, 200);
    assert.equal((await fetch(f.origin + '/api/cameras', { headers })).status, 401);
  } finally { await f.app.close(); }
});
test('new local access links require a current session and CSRF', async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.origin + '/api/local-link', { method: 'POST', headers: { Origin: f.origin } })).status, 401);
    const cookie = await login(f), headers = { Cookie: cookie, Origin: f.origin };
    assert.equal((await fetch(f.origin + '/api/local-link', { method: 'POST', headers })).status, 403);
    const session = await (await fetch(f.origin + '/api/session', { headers })).json();
    const access = await (await fetch(f.origin + '/api/local-link', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': session.csrf } })).json();
    const code = new URLSearchParams(new URL(access.url).hash.slice(1)).get('pair');
    assert.equal((await fetch(f.origin + '/api/session', { method: 'POST', headers: { Origin: f.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).status, 200);
  } finally { await f.app.close(); }
});
test('an authorized browser session survives a central restart', async () => {
  const f = await fixture();
  const cookie = await login(f);
  await f.app.close();
  const restarted = createCentral({ runtime: f.runtime, cameras: f.cameras, port: 0 });
  try {
    const port = await restarted.start();
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/cameras`, { headers: { Cookie: cookie } })).status, 200);
  } finally { await restarted.close(); }
});
test.after(() => {
  const safeRoot = resolve(tmpdir()) + sep;
  for (const path of roots) {
    const absolute = resolve(path);
    if (!absolute.startsWith(safeRoot) || !absolute.split(sep).at(-1).startsWith('mizin-cameras-test-')) throw new Error('Unsafe test cleanup path');
    rmSync(absolute, { recursive: true, force: true });
  }
});
