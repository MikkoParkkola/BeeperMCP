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
  const res = await p
    .query(
      `
      WITH to_update AS (
        SELECT event_id
        FROM messages
        WHERE embedding_model_ver IS NULL OR embedding_model_ver <> $1
        LIMIT $2
      )
      UPDATE messages AS m
      SET embedding_model_ver = $1
      FROM to_update tu
      WHERE m.event_id = tu.event_id
      `,
      [config.embeddings.modelVer, limit],
    )
    .catch(() => ({ rowCount: 0 } as any));
  return (res as any).rowCount ?? 0;
}
