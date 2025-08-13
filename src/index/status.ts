import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool;
}

export async function indexStatus() {
  const p = getPool();
  const pendingReembedRes = await p
    .query("SELECT COUNT(*)::int AS c FROM messages WHERE embedding_model_ver IS DISTINCT FROM $1", [
      config.embeddings.modelVer
    ])
    .catch(() => ({ rows: [{ c: 0 }] }));
  return {
    bm25_ready: true,
    ann_ready: true,
    embedding_model_ver: config.embeddings.modelVer,
    sentiment_model_ver: config.sentiment.modelVer,
    pending_reembed: pendingReembedRes.rows[0].c,
    last_embed_ts: null,
    last_sentiment_ts: null
  };
}
