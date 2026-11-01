import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createPushSubscriptionStore, createTelegramChatStore} from '../plate-notify-store.mjs';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'mizin-notify-store-test-'));
  try { await fn(root); }
  finally {
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.split(sep).at(-1).startsWith('mizin-notify-store-test-')) throw new Error('Unsafe test cleanup');
    await rm(absolute, {recursive: true, force: true});
  }
}

test('push store starts empty and persists an added subscription across a fresh instance (new file handle)', () => fixture(async root => {
  const file = join(root, 'push-subscriptions.json');
  const store = createPushSubscriptionStore({file});
  assert.deepEqual(await store.list(), []);
  await store.add({endpoint: 'https://push.example/abc', keys: {p256dh: 'x', auth: 'y'}});
  const reopened = createPushSubscriptionStore({file});
  const rows = await reopened.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endpoint, 'https://push.example/abc');
  assert.ok(rows[0].addedAt);
}));

test('re-adding the same endpoint replaces it instead of duplicating (device re-subscribed with new keys)', () => fixture(async root => {
  const store = createPushSubscriptionStore({file: join(root, 'p.json')});
  await store.add({endpoint: 'https://push.example/abc', keys: {p256dh: 'old', auth: 'y'}});
  await store.add({endpoint: 'https://push.example/abc', keys: {p256dh: 'new', auth: 'y'}});
  const rows = await store.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].keys.p256dh, 'new');
}));

test('a subscription without an endpoint is rejected before touching disk', () => fixture(async root => {
  const file = join(root, 'p.json');
  const store = createPushSubscriptionStore({file});
  await assert.rejects(() => store.add({keys: {p256dh: 'x', auth: 'y'}}), /inválida/);
  await assert.rejects(() => store.add(null), /inválida/);
  assert.deepEqual(await store.list(), []);
}));

test('remove() drops only the matching endpoint and reports whether anything was removed', () => fixture(async root => {
  const store = createPushSubscriptionStore({file: join(root, 'p.json')});
  await store.add({endpoint: 'a'});
  await store.add({endpoint: 'b'});
  assert.equal(await store.remove('a'), true);
  assert.deepEqual((await store.list()).map(r => r.endpoint), ['b']);
  assert.equal(await store.remove('already-gone'), false);
}));

test('telegram store lists plain chatIds, deduplicates and rejects non-integer ids', () => fixture(async root => {
  const store = createTelegramChatStore({file: join(root, 'chats.json')});
  await store.add(111, 'Proprietário');
  await store.add(222);
  await store.add(111, 'Proprietário (segundo /start)'); // same chat starting the bot again
  assert.deepEqual(await store.list(), [111, 222]);
  await assert.rejects(() => store.add('not-a-number'), /inválido/);
  await assert.rejects(() => store.add(1.5), /inválido/);
}));

test('telegram remove() drops a chat and the file never stores a bot token or secret', () => fixture(async root => {
  const file = join(root, 'chats.json');
  const store = createTelegramChatStore({file});
  await store.add(111);
  assert.equal(await store.remove(111), true);
  assert.deepEqual(await store.list(), []);
  const raw = await readFile(file, 'utf8');
  assert.doesNotMatch(raw.toLowerCase(), /token|secret|bot\d+:/);
}));

test('a corrupted or missing store file is treated as empty, never thrown', () => fixture(async root => {
  const missing = createPushSubscriptionStore({file: join(root, 'does-not-exist.json')});
  assert.deepEqual(await missing.list(), []);
}));
