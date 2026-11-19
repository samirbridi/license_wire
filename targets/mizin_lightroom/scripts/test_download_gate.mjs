// Contract tests for the site's download password (reconstructed/branding/functions/_middleware.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { onRequest } = await import(pathToFileURL(join(here, '..', 'reconstructed', 'branding', 'functions', '_middleware.js')).href);
const SITE = 'https://crispixlr.pages.dev';
const ZIP = 'CRISPIX-0.32.3-build0050-motor-local.zip';
const R2 = 'https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev';

async function call(path, { method = 'GET', cookie, body, origin, password = 'segredo-teste' } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (origin) headers.set('Origin', origin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const request = new Request(SITE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let reachedAsset = false;
  const response = await onRequest({ request, env: password === null ? {} : { DOWNLOAD_PASSWORD: password },
    next: async () => { reachedAsset = true; return new Response('asset'); } });
  return { response, reachedAsset };
}

async function login(password = 'segredo-teste') {
  const { response } = await call('/api/download-access', { method: 'POST', body: { password }, origin: SITE });
  return response;
}

test('pages and the plugin manifests stay public', async () => {
  for (const path of ['/', '/index.html', '/latest.json', '/accel-cuda.json', '/showcase.js']) {
    const { reachedAsset } = await call(path);
    assert.equal(reachedAsset, true, path);
  }
});

test('download without the password goes back to the form, keeping the package', async () => {
  const { response, reachedAsset } = await call(`/downloads/${ZIP}`);
  assert.equal(reachedAsset, false);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), `${SITE}/?next=${encodeURIComponent(`/downloads/${ZIP}`)}#atualizar`);
});

test('encoded, uppercase or stray zip paths are protected too', async () => {
  for (const path of ['/DOWNLOADS/' + ZIP, '/%64ownloads/' + ZIP, '/%2564ownloads/x', '/qualquer.ZIP', '/%E0%A4%A']) {
    const { reachedAsset, response } = await call(path);
    assert.equal(reachedAsset, false, path);
    assert.equal(response.status, 302, path);
  }
});

test('wrong password is refused and sets no cookie', async () => {
  const response = await login('errada');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('without the Cloudflare secret, downloads stay blocked', async () => {
  const { response } = await call('/api/download-access', { method: 'POST', body: { password: 'qualquer' }, origin: SITE, password: null });
  assert.equal(response.status, 503);
  const { response: download } = await call(`/downloads/${ZIP}`, { password: null, cookie: 'crispix_dl=9999999999.' + 'a'.repeat(64) });
  assert.equal(download.status, 302);
  assert.ok(download.headers.get('Location').startsWith(SITE));
});

test('right password unlocks the download of the published package', async () => {
  const response = await login();
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('Set-Cookie');
  assert.match(setCookie, /^crispix_dl=\d{10}\.[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200$/);
  const cookie = setCookie.split(';')[0];
  const status = await (await call('/api/download-access', { cookie })).response.json();
  assert.deepEqual(status, { authorized: true });
  const { response: download } = await call(`/downloads/${ZIP}`, { cookie });
  assert.equal(download.status, 302);
  assert.equal(download.headers.get('Location'), `${R2}/${ZIP}`);
  // Only well-formed package names are forwarded.
  const { response: other } = await call('/downloads/outro.zip', { cookie });
  assert.equal(other.status, 404);
});

test('a cookie signed with another password or expired is rejected', async () => {
  const cookie = (await login()).headers.get('Set-Cookie').split(';')[0];
  const { response } = await call(`/downloads/${ZIP}`, { cookie, password: 'outra-senha' });
  assert.ok(response.headers.get('Location').startsWith(SITE));
  const expired = 'crispix_dl=1000000000.' + cookie.split('.')[1];
  const { response: old } = await call(`/downloads/${ZIP}`, { cookie: expired });
  assert.ok(old.headers.get('Location').startsWith(SITE));
});

test('cross-site login attempts are refused', async () => {
  const { response } = await call('/api/download-access', { method: 'POST', body: { password: 'segredo-teste' }, origin: 'https://evil.example' });
  assert.equal(response.status, 403);
});
