import test from 'node:test';
import assert from 'node:assert';
import * as metrics from '../dist/src/obs/metrics.js';
import { log as obsLog } from '../dist/src/obs/log.js';

test('metrics incr/get/snapshot work', () => {
  // increment counters
  metrics.incr('a');
  metrics.incr('a', 2);
  metrics.incr('b', 5);
  assert.equal(metrics.get('a'), 3);
  assert.equal(metrics.get('b'), 5);
  const snap = metrics.snapshot();
  assert.ok(typeof snap === 'object');
  assert.equal(snap.a, 3);
  assert.equal(snap.b, 5);
});

test('obs.log emits JSON record with fields', () => {
  const orig = console.log;
  let captured = '';
  console.log = (s) => (captured = s);
  try {
    obsLog('test', { x: 1 }, 'corr');
  } finally {
    console.log = orig;
  }
  const parsed = JSON.parse(captured);
  assert.equal(parsed.kind, 'test');
  assert.deepEqual(parsed.payload, { x: 1 });
  assert.equal(parsed.correlationId, 'corr');
  assert.ok(typeof parsed.ts === 'string');
});
