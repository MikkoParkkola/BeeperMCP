import { Pool } from 'pg';
import { config } from '../config.js';
const START_MS = Date.now();
const VERSION =
  process.env.npm_package_version || process.env.BEEPER_MCP_VERSION || 'dev';

let pool: Pool | null = null;
function getPool() {
  if (!pool)
    pool = new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl as any,
      max: config.db.pool.max,
    });
  return pool!;
}

export async function indexStatus(owner = 'local') {
  const p = getPool();
  const client = await (p as any).connect();
  await client.query('SET app.user = $1', [owner]);
  const pendingReembedRes = await client
    .query(
      'SELECT COUNT(*)::int AS c FROM messages WHERE embedding_model_ver IS DISTINCT FROM $1',
      [config.embeddings.modelVer],
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  client.release();
  return {
    bm25_ready: true,
    ann_ready: true,
    embedding_model_ver: config.embeddings.modelVer,
    sentiment_model_ver: config.sentiment.modelVer,
    pending_reembed: pendingReembedRes.rows[0].c,
    last_embed_ts: null,
    last_sentiment_ts: null,
    version: VERSION,
    started_at: new Date(START_MS).toISOString(),
    uptime_ms: Date.now() - START_MS,
  };
}
