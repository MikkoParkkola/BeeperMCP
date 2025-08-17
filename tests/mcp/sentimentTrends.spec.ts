import test from 'node:test';
import assert from 'node:assert/strict';
import { handler, __setTestPool } from '../../src/mcp/tools/sentimentTrends.js';

test('computes EMA and change-point flag', async () => {
  const rows = [
    {
      bucket_key: 'b1',
      count: 1,
      mean: 0.1,
      median: 0.1,
      stdev: 0,
      p10: 0.1,
      p90: 0.1,
      pos_rate: 0,
      neg_rate: 0,
      subjectivity_mean: 0.5,
    },
    {
      bucket_key: 'b2',
      count: 1,
      mean: 0.12,
      median: 0.12,
      stdev: 0,
      p10: 0.12,
      p90: 0.12,
      pos_rate: 0,
      neg_rate: 0,
      subjectivity_mean: 0.5,
    },
    {
      bucket_key: 'b3',
      count: 1,
      mean: 0.15,
      median: 0.15,
      stdev: 0,
      p10: 0.15,
      p90: 0.15,
      pos_rate: 0,
      neg_rate: 0,
      subjectivity_mean: 0.5,
    },
    {
      bucket_key: 'b4',
      count: 1,
      mean: 0.6,
      median: 0.6,
      stdev: 0,
      p10: 0.6,
      p90: 0.6,
      pos_rate: 1,
      neg_rate: 0,
      subjectivity_mean: 0.5,
    },
  ];
  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (typeof sql === 'string' && sql.startsWith('SET app.user')) {
          return { rows: [] };
        }
        return { rows };
      },
      release: () => {},
    }),
    end: async () => {},
  };
  __setTestPool(pool as any);
  const res = await handler({
    target: { all: true },
    alpha: 0.5,
    sensitivity: 0.2,
  });
  __setTestPool(null as any);

  const expected = [0.1, 0.11, 0.13, 0.365];
  res.buckets.forEach((b: any, i: number) => {
    assert.ok(Math.abs(b.ema - expected[i]) < 1e-6);
  });
  assert.equal(res.buckets[3].change_point, true);
  assert.ok(res.buckets.slice(0, 3).every((b: any) => !b.change_point));
});
