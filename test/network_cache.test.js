import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNetworkForRoom } from '../dist/src/tui/network.js';

// Fake DB with mutable response
function makeDb(linesRef) {
  return {
    prepare() {
      return {
        all(roomId) {
          void roomId;
          return linesRef.current.map((line) => ({ line }));
        },
      };
    },
  };
}

test('network: caching returns first inferred tag within TTL', () => {
  const linesRef = { current: ['[2025-01-01] <user@whatsapp.net> hi'] };
  const db = makeDb(linesRef);
  const tag1 = inferNetworkForRoom(db, '!room:hs');
  assert.equal(tag1, 'whatsapp');
  // Change underlying data, but cached value should remain within TTL window
  linesRef.current = ['[2025-01-01] <user@signal.org> hi'];
  const tag2 = inferNetworkForRoom(db, '!room:hs');
  assert.equal(tag2, 'whatsapp');
});
