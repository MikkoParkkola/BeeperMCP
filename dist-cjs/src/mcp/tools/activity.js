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
exports.id = 'stats_activity';
exports.inputSchema = tools_js_1.toolsSchemas.stats_activity;
async function handler(input, owner = 'local') {
  const p = getPool();
  const client = await p.connect();
  await client.query('SET app.user = $1', [owner]);
  const where = [];
  const args = [];
  let i = 1;
  if (input.from) {
    where.push(`ts_utc >= $${i++}`);
    args.push(new Date(input.from).toISOString());
  }
  if (input.to) {
    where.push(`ts_utc <= $${i++}`);
    args.push(new Date(input.to).toISOString());
  }
  if (input.target?.room) {
    where.push(`room_id = $${i++}`);
    args.push(input.target.room);
  }
  if (input.target?.participant) {
    where.push(`sender = $${i++}`);
    args.push(input.target.participant);
  }
  i = (0, filters_js_1.applyCommonFilters)(where, args, i, {
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
           COUNT(*) AS messages,
           COUNT(DISTINCT sender) AS unique_senders,
           COALESCE(SUM(words),0) AS words,
           COALESCE(SUM(attachments),0) AS attachments,
           AVG(CASE WHEN sender = $${i++} THEN 1 ELSE 0 END)::float * 100 AS my_share_pct,
           AVG(NULLIF(words,0)) AS avg_len,
           STDDEV_POP(NULLIF(words,0)) AS stdev_len,
           MIN(ts_utc) AS start_utc,
           MAX(ts_utc) AS end_utc
    FROM messages
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY bucket_key
    ORDER BY MIN(ts_utc)
  `;
  const res = await client.query(sql, [
    ...args,
    config_js_1.config.matrix.userId,
  ]);
  client.release();
  return {
    filters: { ...input },
    bucket_def: {
      kind: bucket,
      tz: 'local',
      disambiguation: 'prefer_earlier_offset',
      k_min: 5,
    },
    buckets: res.rows,
  };
}
