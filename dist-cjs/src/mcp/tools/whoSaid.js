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
  // test helper to inject a fake pool
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
exports.id = 'who_said';
exports.inputSchema = tools_js_1.toolsSchemas.who_said;
async function handler(input, owner = 'local') {
  const p = getPool();
  const client = await p.connect();
  await client.query('SET app.user = $1', [owner]);
  const where = [];
  const args = [];
  (0, filters_js_1.applyCommonFilters)(where, args, 1, input);
  const cond = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sql = `
    SELECT event_id, room_id, sender, ts_utc, text
    FROM messages
    ${cond}
    ORDER BY ts_utc ASC
    LIMIT 1000
  `;
  const rows = (await client.query(sql, args)).rows;
  // Guard regex usage
  let useRegex = Boolean(input.isRegex);
  let regex = null;
  const text = String(input.pattern ?? '');
  if (useRegex) {
    if (text.length > 200) useRegex = false;
    try {
      regex = new RegExp(text, 'i');
    } catch {
      useRegex = false;
    }
  }
  const results = rows.filter((r) => {
    const t = r.text ?? '';
    return useRegex ? regex.test(t) : t === text;
  });
  client.release();
  const hits = results.slice(0, 200).map((r) => ({
    ...r,
    uri: `im://matrix/room/${r.room_id}/message/${r.event_id}/context`,
  }));
  return { hits };
}
