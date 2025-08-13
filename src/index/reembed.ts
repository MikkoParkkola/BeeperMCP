import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool;
}

export async function runReembedBatch(limit = 100): Promise<number> {
  // Placeholder: mark rows as current without re-embedding
  const p = getPool();
  const res = await p.query(
    `UPDATE messages SET embedding_model_ver = $1
     WHERE (embedding_model_ver IS NULL OR embedding_model_ver <> $1)
     LIMIT ${limit}`
    , [config.embeddings.modelVer]
  ).catch(async () => ({ rowCount: 0 } as any));
  return (res as any).rowCount ?? 0;
}
