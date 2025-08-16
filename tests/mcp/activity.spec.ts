import test from 'node:test';
import assert from 'node:assert/strict';
import { handler, __setTestPool } from '../../src/mcp/tools/activity.js';
import { config } from '../../src/config.js';

test('my_share_pct is returned as percentage', async () => {
  const messages = [
    {
      sender: 'alice',
      words: 10,
      attachments: 0,
      ts: new Date('2024-01-01T00:00:00Z'),
    },
    {
      sender: 'bob',
      words: 5,
      attachments: 0,
      ts: new Date('2024-01-01T01:00:00Z'),
    },
  ];
  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (typeof sql === 'string' && sql.startsWith('SET app.user')) {
          return { rows: [] };
        }
        const myMessages = messages.filter(
          (m) => m.sender === config.matrix.userId,
        );
        const words = messages.reduce((a, b) => a + b.words, 0);
        const attachments = messages.reduce((a, b) => a + b.attachments, 0);
        const avgWords = words / messages.length;
        const variance =
          messages.reduce((a, b) => a + Math.pow(b.words - avgWords, 2), 0) /
          messages.length;
        const stdev = Math.sqrt(variance);
        return {
          rows: [
            {
              bucket_key: '2024-01-01',
              messages: messages.length,
              unique_senders: new Set(messages.map((m) => m.sender)).size,
              words,
              attachments,
              my_share_pct: (myMessages.length / messages.length) * 100,
              avg_len: avgWords,
              stdev_len: stdev,
              start_utc: messages[0].ts.toISOString(),
              end_utc: messages[messages.length - 1].ts.toISOString(),
            },
          ],
        };
      },
      release: () => {},
    }),
    end: async () => {},
  };

  __setTestPool(pool as any);
  const originalUser = config.matrix.userId;
  config.matrix.userId = 'alice';
  const res = await handler({});
  config.matrix.userId = originalUser;
  await pool.end();
  __setTestPool(null as any);

  assert.equal(res.buckets[0].my_share_pct, 50);
});
