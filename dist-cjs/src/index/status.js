'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.indexStatus = indexStatus;
const pg_1 = require('pg');
const config_js_1 = require('../config.js');
const START_MS = Date.now();
const VERSION =
  process.env.npm_package_version || process.env.BEEPER_MCP_VERSION || 'dev';
let pool = null;
function getPool() {
  if (!pool)
    pool = new pg_1.Pool({
      connectionString: config_js_1.config.db.url,
      ssl: config_js_1.config.db.ssl,
      max: config_js_1.config.db.pool.max,
    });
  return pool;
}
async function indexStatus(owner = 'local') {
  const p = getPool();
  const client = await p.connect();
  await client.query('SET app.user = $1', [owner]);
  const pendingReembedRes = await client
    .query(
      'SELECT COUNT(*)::int AS c FROM messages WHERE embedding_model_ver IS DISTINCT FROM $1',
      [config_js_1.config.embeddings.modelVer],
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  client.release();
  return {
    bm25_ready: true,
    ann_ready: true,
    embedding_model_ver: config_js_1.config.embeddings.modelVer,
    sentiment_model_ver: config_js_1.config.sentiment.modelVer,
    pending_reembed: pendingReembedRes.rows[0].c,
    last_embed_ts: null,
    last_sentiment_ts: null,
    version: VERSION,
    started_at: new Date(START_MS).toISOString(),
    uptime_ms: Date.now() - START_MS,
  };
}
