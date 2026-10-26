import test from 'node:test';
import assert from 'node:assert/strict';
import { validDay, moveDay, dayInMonth, seekRecorded, clipPlan } from '../public/recordings-core.js';
test('calendar preserves valid days across leap years and month changes', () => {
  assert.equal(validDay('2024-02-29'), true); assert.equal(validDay('2026-02-29'), false);
  assert.equal(dayInMonth('2026-02', 31), '2026-02-28'); assert.equal(dayInMonth('2024-02', 31), '2024-02-29');
  assert.equal(moveDay('2026-12-31', 1), '2027-01-01'); assert.equal(moveDay('2026-03-01', -1), '2026-02-28');
});
test('timeline seeks to the next recorded period through gaps and preserves unknown state', () => {
  const periods = [{ id: 'a', start: 1000, end: 2000 }, { id: 'b', start: 4000, end: 5000 }];
  assert.equal(seekRecorded(periods, 1500), 1500); assert.equal(seekRecorded(periods, 2500), 4000);
  assert.equal(seekRecorded(periods, 6000), 4999); assert.equal(seekRecorded(null, 1500), null); assert.equal(seekRecorded([], 1500), null);
});
test('clip planning cuts file boundaries, avoids overlaps and reports missing footage', () => {
  const plan = clipPlan([{ id: 'a', start: 0, end: 20 }, { id: 'b', start: 10, end: 30 }, { id: 'c', start: 40, end: 60 }], 5, 50);
  assert.deepEqual(plan.parts, [{ id: 'a', start: 5, end: 20 }, { id: 'b', start: 20, end: 30 }, { id: 'c', start: 40, end: 50 }]);
  assert.equal(plan.covered, 35); assert.equal(plan.missing, 10);
  assert.deepEqual(clipPlan(null, 0, 10), { available: false, reason: 'source_unknown', parts: null });
  assert.throws(() => clipPlan([], 20, 10));
});
