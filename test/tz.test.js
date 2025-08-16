import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLocalTzKeys, TimezoneTimeline } from '../utils.js';

const AMSTERDAM = 'Europe/Amsterdam';

// DST spring forward: 2024-03-31 02:00 -> 03:00
// 00:30 UTC -> 01:30 local (CET)
// 01:30 UTC -> 03:30 local (CEST)
test('DST gap handled', () => {
  const ts1 = Date.UTC(2024, 2, 31, 0, 30); // before gap
  const ts2 = Date.UTC(2024, 2, 31, 1, 30); // after gap
  const k1 = computeLocalTzKeys(ts1, AMSTERDAM);
  const k2 = computeLocalTzKeys(ts2, AMSTERDAM);
  assert.equal(k1.hour_local, '01');
  assert.equal(k2.hour_local, '03');
  assert.equal(k1.day_local, k2.day_local);
});

// DST fall back: 2024-10-27 03:00 -> 02:00
// 00:30 UTC -> 02:30 CEST
// 01:30 UTC -> 02:30 CET
test('DST fold handled deterministically', () => {
  const ts1 = Date.UTC(2024, 9, 27, 0, 30);
  const ts2 = Date.UTC(2024, 9, 27, 1, 30);
  const k1 = computeLocalTzKeys(ts1, AMSTERDAM);
  const k2 = computeLocalTzKeys(ts2, AMSTERDAM);
  assert.equal(k1.hour_local, '02');
  assert.equal(k2.hour_local, '02');
  assert.equal(k1.day_local, k2.day_local);
});

test('Timezone timeline selects correct zone', () => {
  const tl = new TimezoneTimeline();
  tl.set('America/New_York', '2024-01-01T00:00:00Z');
  const before = Date.UTC(2023, 11, 31, 23, 0);
  const after = Date.UTC(2024, 0, 1, 1, 0);
  assert.equal(tl.get(before), AMSTERDAM);
  assert.equal(tl.get(after), 'America/New_York');
  const keysBefore = tl.localKeys(before);
  const keysAfter = tl.localKeys(after);
  assert.equal(keysBefore.day_local, '2023-12-31');
  // 01:00 UTC on Jan 1 2024 is 20:00 local (previous day) in New York
  assert.equal(keysAfter.day_local, '2023-12-31');
  assert.equal(keysAfter.hour_local, '20');
});
