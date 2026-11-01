import test from 'node:test';
import assert from 'node:assert/strict';
import {entitiesFor, buildDiscovery, statePayload} from '../mqtt-discovery.mjs';

const gate = {id: 'eb49c5d1977172327aqb1q', name: 'Portão - Interruptor', category: 'ckmkzq', product_name: 'EKAZA Interruptor Pulso para Garagem'};
const lamp = {id: 'eb2d554c1cc3878f810lhh', name: 'Lampada 1', category: 'dj', product_name: 'Lampada Inteligente 9W+RGB WB T261'};
const homeWattmeter = {id: 'ebce2ea581c2690311qvem', name: 'Wattímetro | Home', category: 'zndb', product_name: 'KWS-306WF'};
const otherZndb = {id: 'some_other_device', name: 'Outro zndb', category: 'zndb'};
const wallbox = {id: 'eb_wallbox', name: 'Wallbox BYD', category: 'dlq', product_name: 'Breaker'};
const doorbell = {id: 'eb7f7b175bf04774f0qnwh', name: 'Campanhia', category: 'mal', product_name: 'Multifunction alarm'};
const sosAlarm = {id: 'eb_other_mal', name: 'SOS Tereza', category: 'mal', product_name: 'Multifunction alarm'};
const lock = {id: 'eb_fechadura', name: 'Fechadura', category: 'jtmspro', product_name: 'EKAZA Fechadura WiFi T429'};
const unknownCategory = {id: 'eb_unknown', name: 'Zigbee Hub', category: 'wg2', product_name: 'Hub Zigbee 3.0'};

test('the gate becomes a cover entity (open/close/stop), not a plain switch', () => {
  const [ent] = entitiesFor(gate);
  assert.equal(ent.component, 'cover');
  assert.equal(ent.config.device_class, 'gate');
  assert.deepEqual(ent.config.device.identifiers, ['mizin_eb49c5d1977172327aqb1q']);
  assert.equal(ent.dpsKey, '3');
});

test('a plain Wi-Fi switch/lamp becomes an MQTT switch entity with command and state topics', () => {
  const [ent] = entitiesFor(lamp);
  assert.equal(ent.component, 'switch');
  assert.match(ent.config.command_topic, /\/set$/);
  assert.match(ent.config.state_topic, /\/state$/);
  assert.equal(ent.config.payload_on, 'ON');
});

test('only the confirmed home wattmeter device id gets a power sensor; an unconfirmed zndb device gets none', () => {
  const [ent] = entitiesFor(homeWattmeter);
  assert.equal(ent.component, 'sensor');
  assert.equal(ent.dpsKey, '135');
  assert.equal(ent.config.unit_of_measurement, 'W');
  assert.equal(ent.config.device_class, 'power');
  assert.deepEqual(entitiesFor(otherZndb), []);
});

test('a dlq device (wallbox/generator) gets a power sensor off DPS 118, never the broken cloud-API name', () => {
  const [ent] = entitiesFor(wallbox);
  assert.equal(ent.dpsKey, '118');
  assert.doesNotMatch(JSON.stringify(ent), /total_forward_energy/);
});

test('only the real doorbell device id becomes a doorbell event; another "mal" device (the SOS alarm) gets nothing', () => {
  const [ent] = entitiesFor(doorbell);
  assert.equal(ent.component, 'event');
  assert.equal(ent.config.device_class, 'doorbell');
  assert.deepEqual(ent.config.event_types, ['ring']);
  assert.deepEqual(entitiesFor(sosAlarm), []);
});

test('the lock publishes nothing: no confirmed local DPS index exists for it yet', () => {
  assert.deepEqual(entitiesFor(lock), []);
});

test('an unmapped category publishes nothing rather than guessing', () => {
  assert.deepEqual(entitiesFor(unknownCategory), []);
});

test('buildDiscovery groups entities by deviceId and flattens correctly across a mixed registry', () => {
  const {entities, byDevice} = buildDiscovery([gate, lamp, homeWattmeter, lock]);
  assert.equal(entities.length, 3); // lock contributes 0
  assert.equal(byDevice.get(gate.id).length, 1);
  assert.equal(byDevice.get(lamp.id).length, 1);
  assert.equal(byDevice.has(lock.id), false);
});

test('statePayload: gate reflects DPS 3 as open/closed, and an unknown/missing DPS publishes nothing', () => {
  const [ent] = entitiesFor(gate);
  assert.equal(statePayload(ent, {'3': true}), 'open');
  assert.equal(statePayload(ent, {'3': false}), 'closed');
  assert.equal(statePayload(ent, {}), null);
  assert.equal(statePayload(ent, undefined), null);
});

test('statePayload: a boolean switch DPS becomes ON/OFF', () => {
  const [ent] = entitiesFor(lamp);
  assert.equal(statePayload(ent, {'1': true}), 'ON');
  assert.equal(statePayload(ent, {'1': false}), 'OFF');
});

test('statePayload: a numeric sensor divides by its confirmed scale (power DPS is unscaled, direct watts)', () => {
  const [ent] = entitiesFor(homeWattmeter);
  assert.equal(statePayload(ent, {'135': 275}), '275');
  assert.equal(statePayload(ent, {'135': 'garbage'}), null);
});

test('statePayload never throws on a doorbell event entity: it has no DPS and must be published directly by the runner', () => {
  const [ent] = entitiesFor(doorbell);
  assert.equal(statePayload(ent, {}), null);
});

test('every published entity carries an availability block pointing at the bridge status topic', () => {
  for (const dev of [gate, lamp, homeWattmeter, wallbox, doorbell]) {
    for (const ent of entitiesFor(dev)) {
      assert.deepEqual(ent.config.availability, [{topic: 'homeassistant/mizin_home/bridge/status', payload_available: 'online', payload_not_available: 'offline'}]);
    }
  }
});
