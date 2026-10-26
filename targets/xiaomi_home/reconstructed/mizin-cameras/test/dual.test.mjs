import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createCentral } from '../server.mjs';

async function fixture({ autoData = true } = {}) {
  const runtime = mkdtempSync(join(tmpdir(), 'mizin-dual-test-')), children = [];
  function spawnProcess() {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.killed = false;
    child.kill = () => { if (child.killed) return false; child.killed = true; child.stdout.end(); child.stderr.end(); child.emit('close', 0); return true; };
    children.push(child); if (autoData) queueMicrotask(() => child.stdout.write('synthetic-unit-test-stream')); return child;
  }
  const cameras = [{ id: 'dual', name: 'Dual test fixture', family: 'Fixture', sourceAlias: 'view1', views: ['view1', 'view2', 'view3'].map(id => ({ id, label: id, sourceAlias: id })) }, { id: 'single', name: 'Single fixture', family: 'Fixture', sourceAlias: 'single' }];
  const app = createCentral({ runtime, cameras, port: 0, spawnProcess }), origin = `http://127.0.0.1:${await app.start()}`;
  async function login(code) { const response = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); return response.headers.get('set-cookie').split(';')[0]; }
  const cookie = await login(app.bootstrap);
  async function anotherCookie() { const session = await (await fetch(origin + '/api/session', { headers: { Cookie: cookie } })).json(); const access = await (await fetch(origin + '/api/local-link', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': session.csrf } })).json(); return login(new URLSearchParams(new URL(access.url).hash.slice(1)).get('pair')); }
  return { app, origin, cookie, anotherCookie, children, async close() { await app.close(); const absolute = resolve(runtime); if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.split(sep).at(-1).startsWith('mizin-dual-test-')) throw new Error('Unsafe cleanup'); rmSync(absolute, { recursive: true, force: true }); } };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('Fixture did not advance'); await new Promise(accept => setTimeout(accept, 5)); }
}

test('concurrent views wait for camera startup, then remain active together', async () => {
  const f = await fixture({ autoData: false });
  try {
    const requests = ['view1', 'view2'].map(view => fetch(f.origin + '/api/video/dual?view=' + view, { headers: { Cookie: f.cookie } }));
    await waitFor(() => f.children.length === 1);
    await new Promise(accept => setTimeout(accept, 30));
    assert.equal(f.children.length, 1);
    f.children[0].stdout.write('synthetic-unit-test-stream');
    await waitFor(() => f.children.length === 2);
    assert.equal(f.children[0].killed, false);
    f.children[1].stdout.write('synthetic-unit-test-stream');
    assert.deepEqual((await Promise.all(requests)).map(response => response.status), [200, 200]);
    assert.equal(f.children.every(child => !child.killed), true);
  } finally { await f.close(); }
});

test('simultaneous starts cannot exceed the two-client limit', async () => {
  const f = await fixture();
  try {
    const cookies = [f.cookie, await f.anotherCookie(), await f.anotherCookie()];
    const responses = await Promise.all(cookies.map(cookie => fetch(f.origin + '/api/video/dual?view=view1', { headers: { Cookie: cookie } })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 200, 429]);
    assert.equal(f.children.filter(child => !child.killed).length, 2);
  } finally { await f.close(); }
});

test('logout also cancels an authenticated view waiting for startup', async () => {
  const f = await fixture({ autoData: false });
  try {
    const first = fetch(f.origin + '/api/video/dual?view=view1', { headers: { Cookie: f.cookie } });
    await waitFor(() => f.children.length === 1);
    const queued = fetch(f.origin + '/api/video/dual?view=view2', { headers: { Cookie: f.cookie } });
    await new Promise(accept => setTimeout(accept, 30));
    const session = await (await fetch(f.origin + '/api/session', { headers: { Cookie: f.cookie } })).json();
    await fetch(f.origin + '/api/logout', { method: 'POST', headers: { Cookie: f.cookie, Origin: f.origin, 'X-CSRF-Token': session.csrf } });
    await first;
    assert.equal((await queued).status, 401);
    assert.equal(f.children.length, 1); assert.equal(f.children[0].killed, true);
  } finally { await f.close(); }
});
test('two views coexist in one session; a third view is refused', async () => {
  const f = await fixture();
  try {
    const first = await fetch(f.origin + '/api/video/dual?view=view1', { headers: { Cookie: f.cookie } });
    const second = await fetch(f.origin + '/api/video/dual?view=view2', { headers: { Cookie: f.cookie } });
    assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(f.children[0].killed, false); assert.equal(f.children[1].killed, false);
    assert.equal((await fetch(f.origin + '/api/video/dual?view=view3', { headers: { Cookie: f.cookie } })).status, 429);
    const single = await fetch(f.origin + '/api/video/single', { headers: { Cookie: f.cookie } });
    assert.equal(single.status, 200); assert.equal(f.children[0].killed, true); assert.equal(f.children[1].killed, true);
  } finally { await f.close(); }
});
test('two clients may each open two views; a third client is refused and logout closes both', async () => {
  const f = await fixture();
  try {
    const secondCookie = await f.anotherCookie(), thirdCookie = await f.anotherCookie();
    for (const cookie of [f.cookie, secondCookie]) for (const view of ['view1', 'view2']) assert.equal((await fetch(f.origin + '/api/video/dual?view=' + view, { headers: { Cookie: cookie } })).status, 200);
    assert.equal(f.children.filter(child => !child.killed).length, 4);
    assert.equal((await fetch(f.origin + '/api/video/dual?view=view1', { headers: { Cookie: thirdCookie } })).status, 429);
    const session = await (await fetch(f.origin + '/api/session', { headers: { Cookie: f.cookie } })).json();
    assert.equal((await fetch(f.origin + '/api/logout', { method: 'POST', headers: { Cookie: f.cookie, Origin: f.origin, 'X-CSRF-Token': session.csrf } })).status, 200);
    assert.equal(f.children.slice(0, 2).every(child => child.killed), true); assert.equal(f.children.slice(2).every(child => !child.killed), true);
  } finally { await f.close(); }
});
