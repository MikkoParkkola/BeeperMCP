import test from 'node:test';
import assert from 'node:assert';
import { Pool } from 'pg';

// Fake client for pg
Pool.prototype.connect = async function () {
  return {
    query: async (sql) => {
      if (String(sql).includes('SELECT COUNT')) {
        return { rows: [{ c: 42 }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
};

const mod = await import('../dist/src/index/status.js');

test('indexStatus reports model versions and pending reembed', async () => {
  const res = await mod.indexStatus('tester');
  assert.equal(typeof res.embedding_model_ver, 'string');
  assert.equal(typeof res.sentiment_model_ver, 'string');
  assert.equal(res.pending_reembed, 42);
  assert.equal(res.bm25_ready, true);
  assert.equal(res.ann_ready, true);
});
