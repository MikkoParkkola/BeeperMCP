// import { Pool } from "pg";
import { config } from '../config/analytics.js';
// import { NormalizedEventT } from "./schemas.js";

// let pool: Pool | null = null;
// function getPool() {
//   if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
//   return pool;
// }

export async function startMatrixIngestLoop(): Promise<void> {
  // Minimal skeleton; implement full sync later
  // Intentionally idle until configured
  if (!config.matrix.accessToken) return;
  // TODO: Implement /_matrix/client/v3/sync loop, normalize events, compute stats/tsv/tz keys, embeddings, sentiment and persist
  return;
}
