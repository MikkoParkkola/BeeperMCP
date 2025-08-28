import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initNotifyState,
  computeInboxDelta,
  shouldBell,
} from '../dist/src/tui/notify.js';

test('notify: init state', () => {
  const state = initNotifyState();
  assert.ok(state.inboxIdsSeen instanceof Set);
  assert.equal(state.inboxIdsSeen.size, 0);
  assert.equal(typeof state.lastRefresh, 'number');
});

test('notify: computeInboxDelta detects new ids and updates state', () => {
  const state = initNotifyState();
  const inbox1 = [
    { id: 'a', status: 'open' },
    { id: 'b', status: 'open' },
  ];
  const d1 = computeInboxDelta(state, inbox1);
  assert.equal(d1.newCount, 2);
  assert.deepEqual([...d1.newIds].sort(), ['a', 'b']);

  const d2 = computeInboxDelta(d1.updatedState, inbox1);
  assert.equal(d2.newCount, 0);
  assert.equal(d2.newIds.size, 0);

  const inbox2 = [...inbox1, { id: 'c', status: 'open' }];
  const d3 = computeInboxDelta(d2.updatedState, inbox2);
  assert.equal(d3.newCount, 1);
  assert.deepEqual([...d3.newIds], ['c']);
});

test('notify: shouldBell uses settings.enableBell', () => {
  assert.equal(shouldBell({ settings: { enableBell: true } }), true);
  assert.equal(shouldBell({ settings: { enableBell: false } }), false);
  assert.equal(shouldBell({}), false);
});
