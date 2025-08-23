import test from 'node:test';
import assert from 'node:assert';
import { Pool } from 'pg';

// Monkey-patch Pool.connect to avoid real DB
const calls = [];
Pool.prototype.connect = async function () {
  return {
    query: async (sql, args) => {
      calls.push({ sql: String(sql), args: args || [] });
      if (String(sql).includes('SELECT event_id')) {
        return {
          rows: [
            { event_id: 'e1', ts_utc: '2025-01-01T00:00:00.000Z', score: 0.9 },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };
};

const mod = await import('../dist/src/index/search.js');

test('searchHybrid builds query and returns hits', async () => {
  const hits = await mod.searchHybrid(
    'hello',
    { from: new Date('2025-01-01') },
    10,
    'tester',
  );
  assert.ok(Array.isArray(hits));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].event_id, 'e1');
  // first call should be SET app.user, second is SELECT
  assert.ok(calls[0].sql.includes('SET app.user'));
  assert.ok(calls[1].sql.includes('SELECT event_id'));
});

test('searchHybrid applies advanced filters (participants, types)', async () => {
  calls.length = 0;
  const hits = await mod.searchHybrid(
    'hello',
    { participants: ['@u:hs'], types: ['text', 'image'] },
    5,
    'tester',
  );
  assert.ok(Array.isArray(hits));
  assert.equal(hits.length, 1);
  assert.ok(calls[1].sql.includes('SELECT event_id'));
});
