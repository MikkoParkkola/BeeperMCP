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
exports.id = 'sentiment_trends';
exports.inputSchema = tools_js_1.toolsSchemas.sentiment_trends;
async function handler(input, owner = 'local') {
  const p = getPool();
  const client = await p.connect();
  await client.query('SET app.user = $1', [owner]);
  const where = ['sentiment_score IS NOT NULL'];
  const args = [];
  let i = 1;
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
  const bucket = input.bucket ?? 'day';
  const bucketKey =
    bucket === 'day'
      ? 'tz_day::text'
      : bucket === 'week'
        ? "tz_year||'-W'||lpad(tz_week::text,2,'0')"
        : bucket === 'month'
          ? 'tz_month::text'
          : 'tz_year::text';
  const sql = `
    SELECT ${bucketKey} AS bucket_key,
           COUNT(*) AS count,
           AVG(sentiment_score) AS mean,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sentiment_score) AS median,
           STDDEV_POP(sentiment_score) AS stdev,
           PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY sentiment_score) AS p10,
           PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY sentiment_score) AS p90,
           AVG((sentiment_score > 0.2)::int)::float AS pos_rate,
           AVG((sentiment_score < -0.2)::int)::float AS neg_rate,
           AVG(subjectivity) AS subjectivity_mean
    FROM messages
    WHERE ${where.join(' AND ')}
    GROUP BY bucket_key
    ORDER BY MIN(ts_utc)
  `;
  const res = await client.query(sql, args);
  const alpha =
    typeof input.alpha === 'number' && input.alpha >= 0 && input.alpha <= 1
      ? input.alpha
      : 0.3;
  const sensitivity =
    typeof input.sensitivity === 'number' && input.sensitivity >= 0
      ? input.sensitivity
      : 0.5;
  const buckets = res.rows;
  if (buckets.length > 0) {
    let ema = buckets[0].mean;
    let gPos = 0;
    let gNeg = 0;
    buckets[0].ema = ema;
    buckets[0].change_point = false;
    for (let idx = 1; idx < buckets.length; idx++) {
      const row = buckets[idx];
      ema = alpha * row.mean + (1 - alpha) * ema;
      const residual = row.mean - ema;
      gPos = Math.max(0, gPos + residual);
      gNeg = Math.min(0, gNeg + residual);
      let change = false;
      if (gPos > sensitivity || gNeg < -sensitivity) {
        change = true;
        gPos = 0;
        gNeg = 0;
      }
      row.ema = ema;
      row.change_point = change;
    }
  }
  client.release();
  return {
    filters: { ...input },
    bucket_def: {
      kind: bucket,
      tz: 'local',
      disambiguation: 'prefer_earlier_offset',
      k_min: 5,
    },
    buckets,
  };
}
