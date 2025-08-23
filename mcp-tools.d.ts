/*
  SUGGESTED ADDITIONAL FILES TO ADD TO THE CHAT/REPO

  The MCP server and tools in this repo commonly rely on the following files.
  If you want me to continue wiring behaviors, tests, and DI-friendly hooks,
  please add any of the missing files below and I'll apply targeted patches.

  - src/config.ts               // server config / loader
  - utils.js / utils.d.ts       // file logging, sqlite helpers, media downloader
  - mcp-tools.js                // buildMcpServer helper used by src/mcp.ts
  - src/mcp/resources.ts        // resource templates & handlers (history/context/media)
  - src/index/search.ts         // search implementation (BM25/hybrid)
  - src/index/reembed.ts        // re-embedding worker
  - src/mcp/tools/whoSaid.ts
  - src/mcp/tools/activity.ts
  - src/mcp/tools/sentimentTrends.ts
  - src/mcp/tools/sentimentDistribution.ts
  - src/mcp/tools/recap.ts
  - src/mcp/tools/responseTime.ts
  - src/mcp/tools/draftReply.ts
  - src/mcp/tools/sendMessage.ts
  - src/ingest/matrix.ts        // matrix /sync ingest to persist messages to Postgres
  - scripts/migrate.ts          // DB migrations / schema (Postgres messages table)
  - Postgres schema: CREATE TABLE messages (...) with indexes (ts_utc, sender, room_id, tsv, media_types GIN)

  Tests / CI:
  - add unit tests (vitest or node --test) and integration tests using pg-mem or testcontainers
  - CI should run npm ci, npm run build, then tests/coverage

  Once you add the files you want edited, tell me and I'll apply precise SEARCH/REPLACE
  patches to implement DI hooks, parameterized queries, guardrails, and test helpers.
*/
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function buildMcpServer(
  client: any,
  logDb: any,
  enableSend: boolean,
  apiKey?: string, // undefined disables API key enforcement (e.g., STDIO mode)
  logSecret?: string,
  queryFn?: (
    db: any,
    roomId: string,
    limit?: number,
    since?: string,
    until?: string,
    secret?: string,
  ) => string[],
): McpServer;

// Suggested additional files to add to the chat/repo for completing wiring,
// testing and production readiness:
// - Postgres: messages schema (CREATE TABLE messages ...)
// - scripts/migrate.ts
// - src/ingest/matrix.ts            // full /sync ingest to populate messages table
// - src/index/reembed.ts            // re-embedding / ANN worker (already present but may need expansion)
// - src/mcp/tools/sentimentTrends.ts
// - src/mcp/tools/sentimentDistribution.ts
// - src/mcp/tools/messageContext.ts  // context around an event (resource/tool)
// - src/mcp/tools/mediaProxy.ts      // media streaming / metadata helpers
// - src/decryption-manager.js       // E2EE decryption manager if using Olm/rust-crypto
// - src/crypto.ts (or crypto.js)    // Olm / rust-crypto initialization (already present)
// - src/auth.ts                      // extended auth helpers (already present but may need augmenting)
