import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import {
  handler as whoSaid,
  __setTestPool as setWhoPool,
} from '../dist/src/mcp/tools/whoSaid.js';
import {
  handler as sentimentTrends,
  __setTestPool as setTrendsPool,
} from '../dist/src/mcp/tools/sentimentTrends.js';
import {
  handler as sentimentDistribution,
  __setTestPool as setDistPool,
} from '../dist/src/mcp/tools/sentimentDistribution.js';
import {
  handler as activity,
  __setTestPool as setActivityPool,
} from '../dist/src/mcp/tools/activity.js';
import { config } from '../dist/src/config.js';

function setupDb() {
  const db = newDb();
  const settings = {};
  db.public.registerFunction({
    name: 'current_setting',
    args: ['text', 'bool'],
    returns: 'text',
    impure: true,
    implementation: (name) => settings[name] ?? null,
  });
  db.public.registerFunction({
    name: 'nullif',
    args: ['float', 'float'],
    returns: 'float',
    implementation: (a, b) => (a === b ? null : a),
  });
  db.public.registerFunction({
    name: 'width_bucket',
    args: ['float', 'float', 'float', 'text'],
    returns: 'int',
    implementation: (v, low, high, binsText) => {
      const bins = Number(binsText);
      const w = (high - low) / bins;
      if (v < low) return 0;
      if (v >= high) return bins + 1;
      return Math.floor((v - low) / w) + 1;
    },
  });
  const pg = db.adapters.createPg();
  const rawPool = new pg.Pool();
  const init = async () => {
    const client = await rawPool.connect();
    await client.query(`
      CREATE TABLE messages_data (
        event_id text PRIMARY KEY,
        room_id text,
        sender text,
        text text,
        ts_utc timestamptz,
        lang text,
        media_types text[],
        sentiment_score real,
        subjectivity real,
        words real,
        attachments int,
        tz_day text,
        tz_week int,
        tz_month int,
        tz_year int,
        owner_id text
      );
    `);
    await client.query(`
      CREATE VIEW messages AS
      SELECT * FROM messages_data
      WHERE owner_id = current_setting('app.user', true);
    `);
    await client.query(
      `INSERT INTO messages_data
       (event_id, room_id, sender, text, ts_utc, lang, media_types, sentiment_score, subjectivity, words, attachments, tz_day, tz_week, tz_month, tz_year, owner_id)
       VALUES
       ('e1','r1','alice','hello','2024-01-01T00:00:00Z','en',ARRAY[]::text[],0.5,0.6,5,0,'2024-01-01',1,1,2024,'local'),
       ('e2','r1','bob','hola','2024-01-02T00:00:00Z','es',ARRAY['image'], -0.4,0.4,3,1,'2024-01-02',1,1,2024,'local'),
       ('e3','r2','alice','bye','2024-01-03T00:00:00Z','en',ARRAY[]::text[],0.1,0.5,1,0,'2024-01-03',1,1,2024,'local'),
       ('e4','r1','alice','ciao','2024-01-01T00:00:00Z','it',ARRAY[]::text[],0.2,0.7,2,0,'2024-01-01',1,1,2024,'other')
      `,
    );
    client.release();
  };
  const pool = {
    connect: async () => {
      const client = await rawPool.connect();
      return {
        query: async (sql, params) => {
          if (typeof sql === 'string' && sql.startsWith('SET app.user')) {
            settings['app.user'] = params[0];
            return { rows: [] };
          }
          if (typeof sql === 'string' && sql.includes('STDDEV_POP')) {
            sql = sql
              .replace(/STDDEV_POP\(NULLIF\(words,0\)\)/gi, '0')
              .replace(/STDDEV_POP\(sentiment_score\)/gi, '0');
          }
          if (typeof sql === 'string' && sql.includes('PERCENTILE_CONT')) {
            sql = sql
              .replace(
                /PERCENTILE_CONT\(0\.5\) WITHIN GROUP \(ORDER BY sentiment_score\)/gi,
                'AVG(sentiment_score)',
              )
              .replace(
                /PERCENTILE_CONT\(0\.1\) WITHIN GROUP \(ORDER BY sentiment_score\)/gi,
                'MIN(sentiment_score)',
              )
              .replace(
                /PERCENTILE_CONT\(0\.9\) WITHIN GROUP \(ORDER BY sentiment_score\)/gi,
                'MAX(sentiment_score)',
              );
          }
          return client.query(sql, params);
        },
        release: () => client.release(),
      };
    },
    end: async () => rawPool.end(),
  };
  return { pool, init };
}

test('analytics tools filters, buckets, and RLS', async (t) => {
  const { pool, init } = setupDb();
  await init();
  setWhoPool(pool);
  setTrendsPool(pool);
  setDistPool(pool);
  setActivityPool(pool);
  const origUser = config.matrix.userId;
  config.matrix.userId = 'alice';

  await t.test('who_said filters participants/lang/types', async () => {
    const res = await whoSaid({
      pattern: 'hola',
      participants: ['bob'],
      lang: 'es',
      types: ['image'],
    });
    assert.equal(res.hits.length, 1);
    assert.equal(res.hits[0].sender, 'bob');
    assert.equal(res.hits[0].uri, 'im://matrix/room/r1/message/e2/context');
    const none = await whoSaid({ pattern: 'ciao' });
    assert.equal(none.hits.length, 0);
    const other = await whoSaid({ pattern: 'ciao' }, 'other');
    assert.equal(other.hits.length, 1);
    assert.equal(other.hits[0].uri, 'im://matrix/room/r1/message/e4/context');
  });

  await t.test('sentiment_distribution bins and filters', async () => {
    const res = await sentimentDistribution({
      bins: 4,
      participants: ['bob'],
      lang: 'es',
      types: ['image'],
    });
    assert.deepEqual(res.counts, [0, 1, 0, 0, 0]);
    assert.equal(res.summary.count, 1);
    assert.ok(Math.abs(res.summary.mean + 0.4) < 1e-6);
    const rls = await sentimentDistribution({ bins: 4 }, 'other');
    assert.deepEqual(rls.counts, [0, 0, 1, 0, 0]);
    assert.equal(rls.summary.count, 1);
  });

  await t.test('sentiment_trends bucket stats and RLS', async () => {
    const res = await sentimentTrends({
      bucket: 'day',
      participants: ['bob'],
      lang: 'es',
      types: ['image'],
    });
    assert.equal(res.buckets.length, 1);
    assert.equal(res.buckets[0].subjectivity_mean, 0.4);
    const rls = await sentimentTrends({ bucket: 'day' }, 'other');
    assert.equal(rls.buckets.length, 1);
    assert.equal(rls.buckets[0].mean, 0.2);
  });

  await t.test('stats_activity filters and RLS', async () => {
    const res = await activity({
      bucket: 'year',
      target: { participant: 'bob' },
      lang: 'es',
      types: ['image'],
    });
    assert.equal(res.buckets[0].messages, 1);
    assert.equal(res.buckets[0].my_share_pct, 0);
    const allLocal = await activity({ bucket: 'year' });
    assert.equal(allLocal.buckets[0].messages, 3);
    const allOther = await activity({ bucket: 'year' }, 'other');
    assert.equal(allOther.buckets[0].messages, 1);
  });

  config.matrix.userId = origUser;
  await pool.end();
  setWhoPool(null);
  setTrendsPool(null);
  setDistPool(null);
  setActivityPool(null);
});
