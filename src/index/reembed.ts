import { Pool } from 'pg';
import { config } from '../config.js';
import { hashEmbed, embedLiteral } from './embed.js';

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
  const p = getPool();
  const client = await (p as any).connect();
  try {
    const sel = await client.query(
      `SELECT event_id, coalesce(text,'') AS text
       FROM messages
       WHERE embedding_model_ver IS DISTINCT FROM $1 OR embedding IS NULL
       ORDER BY ts_utc ASC
       LIMIT $2`,
      [config.embeddings.modelVer, limit],
    );
    let updated = 0;
    for (const r of sel.rows as any[]) {
      const vec = hashEmbed(r.text, config.embeddings.dim);
      const lit = embedLiteral(vec);
      await client.query(
        `UPDATE messages SET embedding = $2::vector, embedding_model_ver = $1 WHERE event_id = $3`,
        [config.embeddings.modelVer, lit, r.event_id],
      );
      updated += 1;
    }
    return updated;
  } finally {
    client.release();
  }
}
