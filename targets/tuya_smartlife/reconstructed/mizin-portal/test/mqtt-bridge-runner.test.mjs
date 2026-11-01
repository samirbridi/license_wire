import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {run} from '../mqtt-bridge-runner.mjs';

// Fake MQTT client: same shape as the mqtt.js client this module expects (on/publish/subscribe/end),
// just enough for the bridge to exercise its full flow without a real broker.
function fakeClient() {
  const emitter = new EventEmitter();
  const published = []; // {topic, payload, opts}
  const subscribed = [];
  emitter.publish = (topic, payload, opts) => published.push({topic, payload, opts});
  emitter.subscribe = (topic) => subscribed.push(topic);
  emitter.end = () => {};
  emitter.published = published;
  emitter.subscribed = subscribed;
  return emitter;
}
function latest(published, topic) {
  const matches = published.filter(p => p.topic === topic);
  return matches.at(-1)?.payload;
}

const gate = {id: 'eb49c5d1977172327aqb1q', name: 'Portão - Interruptor', category: 'ckmkzq', live_dps: {'3': false}};
const lamp = {id: 'eb2d554c1cc3878f810lhh', name: 'Lampada 1', category: 'dj', live_dps: {'1': false}};

test('on connect, the bridge publishes discovery, marks itself online, and publishes initial state', async () => {
  const client = fakeClient();
  const bridge = await run({mqttClient: client, devicesFetcher: async () => [gate, lamp], commandSender: async () => ({}), pollMs: 999999, doorbellPollMs: 999999});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(latest(client.published, 'homeassistant/mizin_home/bridge/status'), 'online');
  assert.ok(client.published.some(p => p.topic === 'homeassistant/cover/mizin_eb49c5d1977172327aqb1q_cover/config'));
  assert.ok(client.published.some(p => p.topic === 'homeassistant/switch/mizin_eb2d554c1cc3878f810lhh_switch/config'));
  assert.equal(latest(client.published, 'homeassistant/cover/mizin_eb49c5d1977172327aqb1q_cover/state'), 'closed');
  assert.equal(latest(client.published, 'homeassistant/switch/mizin_eb2d554c1cc3878f810lhh_switch/state'), 'OFF');
  bridge.stop();
});

test('discovery is republished only when the device set actually changes, not on every poll', async () => {
  const client = fakeClient();
  let devices = [lamp];
  const bridge = await run({mqttClient: client, devicesFetcher: async () => devices, commandSender: async () => ({}), pollMs: 999999, doorbellPollMs: 999999});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  const configCountAfterFirst = client.published.filter(p => p.topic.endsWith('/config')).length;
  await bridge._poll(); // same device set
  assert.equal(client.published.filter(p => p.topic.endsWith('/config')).length, configCountAfterFirst);
  devices = [lamp, gate]; // a device appears
  await bridge._poll();
  assert.ok(client.published.filter(p => p.topic.endsWith('/config')).length > configCountAfterFirst);
  bridge.stop();
});

test('a command published to a switch command_topic calls commandSender with the right devId/dps/value', async () => {
  const client = fakeClient();
  const calls = [];
  const bridge = await run({mqttClient: client, devicesFetcher: async () => [lamp], commandSender: async (devId, dps, value) => { calls.push({devId, dps, value}); return {}; }, pollMs: 999999, doorbellPollMs: 999999});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  client.emit('message', 'homeassistant/switch/mizin_eb2d554c1cc3878f810lhh_switch/set', Buffer.from('ON'));
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(calls, [{devId: 'eb2d554c1cc3878f810lhh', dps: '1', value: true}]);
  bridge.stop();
});

test('OPEN and CLOSE on the gate cover both send the same single pulse (value: true), matching the physical dry-contact relay', async () => {
  const client = fakeClient();
  const calls = [];
  const bridge = await run({mqttClient: client, devicesFetcher: async () => [gate], commandSender: async (devId, dps, value) => { calls.push(value); }, pollMs: 999999, doorbellPollMs: 999999});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  const topic = 'homeassistant/cover/mizin_eb49c5d1977172327aqb1q_cover/set';
  client.emit('message', topic, Buffer.from('OPEN'));
  client.emit('message', topic, Buffer.from('CLOSE'));
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(calls, [true, true]);
  bridge.stop();
});

test('STOP on the gate cover is a no-op: no confirmed DPS exists for an isolated stop command', async () => {
  const client = fakeClient();
  const calls = [];
  const bridge = await run({mqttClient: client, devicesFetcher: async () => [gate], commandSender: async (...args) => { calls.push(args); }, pollMs: 999999, doorbellPollMs: 999999});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  client.emit('message', 'homeassistant/cover/mizin_eb49c5d1977172327aqb1q_cover/set', Buffer.from('STOP'));
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(calls, []);
  bridge.stop();
});

test('a devicesFetcher failure is logged, never thrown, and does not stop the next poll from working', async () => {
  const client = fakeClient();
  const logs = [];
  let fail = true;
  const bridge = await run({mqttClient: client, devicesFetcher: async () => { if (fail) throw new Error('portal unreachable'); return [lamp]; }, commandSender: async () => ({}), pollMs: 999999, doorbellPollMs: 999999, onLog: (m) => logs.push(m)});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  assert.ok(logs.some(l => l.includes('portal unreachable')));
  fail = false;
  await assert.doesNotReject(() => bridge._poll());
  assert.ok(client.published.some(p => p.topic === 'homeassistant/switch/mizin_eb2d554c1cc3878f810lhh_switch/config'));
  bridge.stop();
});

test('stop() publishes offline on the availability topic', async () => {
  const client = fakeClient();
  const bridge = await run({mqttClient: client, devicesFetcher: async () => [], commandSender: async () => ({}), pollMs: 999999, doorbellPollMs: 999999});
  client.emit('connect');
  await new Promise(r => setTimeout(r, 50));
  bridge.stop();
  assert.equal(latest(client.published, 'homeassistant/mizin_home/bridge/status'), 'offline');
});

test('the doorbell event is published only on a NEW log entry, never on the first read (which could be stale)', async () => {
  const client = fakeClient();
  let logs = [{id: 'log_old', devId: 'eb7f7b175bf04774f0qnwh'}];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/api/logs')) return {ok: true, json: async () => ({logs})};
    return originalFetch(url);
  };
  try {
    const bridge = await run({mqttClient: client, devicesFetcher: async () => [], commandSender: async () => ({}), pollMs: 999999, doorbellPollMs: 999999});
    client.emit('connect');
    await bridge._pollDoorbell(); // first read: establishes baseline, must NOT publish
    assert.equal(client.published.filter(p => p.topic.includes('_ring/state')).length, 0);
    logs = [{id: 'log_new', devId: 'eb7f7b175bf04774f0qnwh'}, ...logs]; // a real new ring arrives
    await bridge._pollDoorbell();
    assert.equal(client.published.filter(p => p.topic.includes('_ring/state')).length, 1);
    assert.deepEqual(JSON.parse(latest(client.published, 'homeassistant/event/mizin_eb7f7b175bf04774f0qnwh_ring/state')), {event_type: 'ring'});
    bridge.stop();
  } finally {
    global.fetch = originalFetch;
  }
});
