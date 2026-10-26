import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreStreams, validateStreams } from './restore-bridge-streams.mjs';

const entries = ['view1', 'view2'].map(alias => ({ alias, source: 'xiaomi://1:cn@192.168.0.2?did=123&model=example.camera.test' }));
test('bridge restart restores missing aliases while preserving existing sources', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(options.method === 'PUT' ? '' : JSON.stringify({ view1: { producers: [] } }), { status: 200 });
  };
  assert.deepEqual(await restoreStreams(entries, fetcher), { restored: 1, preserved: 1 });
  assert.equal(calls.length, 2); assert.equal(calls[1].url.searchParams.get('name'), 'view2'); assert.equal(calls[1].url.searchParams.get('src'), entries[1].source);
});
test('invalid or duplicated sources are rejected before any bridge access', async () => {
  let calls = 0; const fetcher = async () => { calls++; };
  await assert.rejects(restoreStreams([{ alias: 'bad', source: 'https://example.invalid/' }], fetcher));
  assert.throws(() => validateStreams([entries[0], entries[0]])); assert.equal(calls, 0);
});
