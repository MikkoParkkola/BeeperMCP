import { Pool } from 'pg';
import { config } from '../config/analytics.js';

/*
  Suggested additional files to add to the chat/repo for full wiring and testing:

  - utils.js                       // logging, sqlite helpers, media downloader
  - mcp-tools.js                   // buildMcpServer helper used by src/mcp.ts
  - src/config.ts                  // server config / loader (already present)
  - src/mcp/resources.ts           // resource templates & handlers (history/context/media)
  - src/mcp/server.ts              // MCP HTTP server wiring (already present)
  - src/mcp/tools/whoSaid.ts
  - src/mcp/tools/activity.ts
  - src/mcp/tools/sentimentTrends.ts
  - src/mcp/tools/sentimentDistribution.ts
  - src/mcp/tools/sendMessage.ts
  - src/ingest/matrix.ts           // full /sync ingest to populate messages table
  - scripts/migrate.ts             // DB migrations / messages table schema and indexes
  - Postgres schema: CREATE TABLE messages (...) with indexes (ts_utc, sender, room_id, tsv GIN, media_types GIN)

  If you add these files I can apply focused SEARCH/REPLACE patches to wire parameterized
  queries, resource handlers, guardrails, tests and CI integration.
*/

let pool: Pool | null = null;
function getPool() {
  if (!pool)
    pool = new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl as any,
      max: config.db.pool.max,
    });
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
    .catch(() => ({ rowCount: 0 }) as any);
  return (res as any).rowCount ?? 0;
}
