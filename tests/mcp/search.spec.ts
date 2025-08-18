import test from 'node:test';
import assert from 'node:assert/strict';

import { handler } from '../../src/mcp/tools/search.js';
import { __setTestPool } from '../../src/index/search.js';

test('search returns room_id, sender, text and uri', async () => {
  const row = {
    event_id: 'evt1',
    room_id: 'room1',
    sender: 'alice',
    text: 'Hello world',
    ts_utc: '2024-01-01T00:00:00Z',
    score: 0.5,
  };
  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (typeof sql === 'string' && sql.startsWith('SET app.user')) {
          return { rows: [] };
        }
        return { rows: [row] };
      },
      release: () => {},
    }),
    end: async () => {},
  };

  __setTestPool(pool as any);
  const res = await handler({ query: 'hello' });
  __setTestPool(null as any);
  await pool.end();

  assert.equal(res.hits.length, 1);
  const hit = res.hits[0] as any;
  assert.equal(hit.room_id, row.room_id);
  assert.equal(hit.sender, row.sender);
  assert.equal(hit.text, row.text);
  assert.equal(
    hit.uri,
    `im://matrix/room/${row.room_id}/message/${row.event_id}/context`,
  );
});
