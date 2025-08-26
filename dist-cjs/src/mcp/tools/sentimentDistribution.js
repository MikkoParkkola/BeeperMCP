'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.__setTestPool = __setTestPool;
exports.handler = handler;
const pg_1 = require('pg');
const config_js_1 = require('../../config.js');
const tools_js_1 = require('../schemas/tools.js');
const filters_js_1 = require('./filters.js');
let pool = null;
function __setTestPool(p) {
  pool = p;
}
function getPool() {
  if (!pool)
    pool = new pg_1.Pool({
      connectionString: config_js_1.config.db.url,
      ssl: config_js_1.config.db.ssl,
      max: config_js_1.config.db.pool.max,
    });
  return pool;
}
exports.id = 'sentiment_distribution';
exports.inputSchema = tools_js_1.toolsSchemas.sentiment_distribution;
async function handler(input, owner = 'local') {
  const p = getPool();
  const client = await p.connect();
  await client.query('SET app.user = $1', [owner]);
  const bins = Math.min(Math.max(input.bins ?? 20, 5), 200);
  const where = ['sentiment_score IS NOT NULL'];
  const args = [bins];
  let i = 2;
  if (input.target?.room) {
    where.push(`room_id = $${i++}`);
    args.push(input.target.room);
  }
  if (input.target?.participant) {
    where.push(`sender = $${i++}`);
    args.push(input.target.participant);
  }
  i = (0, filters_js_1.applyCommonFilters)(where, args, i, {
    from: input.from,
    to: input.to,
    lang: input.lang,
    types: input.types,
  });
  const sql = `
    WITH data AS (
      SELECT sentiment_score FROM messages WHERE ${where.join(' AND ')}
    )
    SELECT width_bucket(sentiment_score, -1, 1, $1) AS bucket,
           COUNT(*)::int AS count,
           AVG(sentiment_score) AS mean
    FROM data
    GROUP BY bucket
    ORDER BY bucket
  `;
  const res = await client.query(sql, args);
  const counts = Array(bins).fill(0);
  let total = 0;
  let sum = 0;
  for (const r of res.rows) {
    const idx = Math.max(1, Math.min(bins, r.bucket)) - 1; // 1-based buckets
    counts[idx] = r.count;
    total += r.count;
    sum += (r.mean ?? 0) * r.count;
  }
  const step = 2 / bins;
  const edges = Array.from({ length: bins + 1 }, (_, j) => -1 + j * step);
  const mean = total ? sum / total : 0;
  client.release();
  return { edges, counts, summary: { count: total, mean } };
}
