import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function buildMcpServer(
  client: any,
  logDb: any,
  enableSend: boolean,
  apiKey: string,
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
