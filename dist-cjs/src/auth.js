'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.verifyAccessToken = verifyAccessToken;
async function verifyAccessToken(hs, token, uid, logger) {
  try {
    const res = await fetch(`${hs}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.user_id) throw new Error('No user_id in response');
    if (uid && data.user_id !== uid) {
      throw new Error(`Token user_id ${data.user_id} does not match ${uid}`);
    }
    logger.info(`Access token validated for ${data.user_id}`);
  } catch (err) {
    logger.error(`Failed to validate access token: ${err.message}`);
    process.exit(1);
  }
}
/*
  Recommended additional files to add (if not already present).  These support
  building, running, and testing the MCP server and analytics tooling:

  Core runtime & wiring:
  - src/config.ts
      Server configuration loader (needed by many modules).
  - utils.js
      Runtime utilities referenced widely (file logging, sqlite helpers, media downloader).
  - mcp-tools.js
      MCP helper used by src/mcp.ts (buildMcpServer).
  - mcp-tools.d.ts
      Type declarations for mcp-tools.js (handy for TS builds).

  Database & migrations:
  - scripts/migrate.ts
  - scripts/create_messages_table.sql or migrations/*.sql
      SQL/migration to create the Postgres `messages` table used by analytics & tools.

  MCP resources & analytics:
  - src/mcp/resources.ts
      Resource handlers (history, media, index/status) — ensure the version that
      accepts (logDb, logSecret) is present.
  - src/index/search.ts
  - src/index/reembed.ts
  - src/mcp/tools/whoSaid.ts
  - src/mcp/tools/activity.ts
  - src/mcp/tools/sentimentTrends.ts
  - src/mcp/tools/sentimentDistribution.ts
  - src/mcp/tools/recap.ts
  - src/mcp/tools/responseTime.ts
  - src/mcp/tools/draftReply.ts
  - src/mcp/tools/sendMessage.ts

  Ingest & E2EE:
  - src/ingest/matrix.ts (to persist messages into Postgres)
  - src/crypto.ts (Olm / rust-crypto helpers)
  - src/decryption-manager.js
  - src/event-logger.ts

  Optional but recommended for release:
  - Dockerfile and docker-compose.yml (or k8s manifests) for deployment
  - tests/ (unit and integration tests, fixtures)
  - .github/workflows/ci.yml (ensure npm ci is used and build runs before tests)

  Remaining high-priority files you should add (if not already present):
  - mcp-tools.js            (required by build & runtime to construct MCP server)
  - utils.js                (runtime utilities used widely by server and tools)
  - scripts/migrate.ts      (DB migrations to create messages table)
  - migrations/*.sql        (Postgres schema for messages table and indexes)
  - src/decryption-manager.js (decryption manager used by event-logger)

  Optional but helpful for testing & CI:
  - tests/** (unit and integration tests using pg-mem and supertest)
  - Dockerfile / docker-compose.yml

  Once you add any of the above, tell me which ones you added and I'll
  apply the remaining precise SEARCH/REPLACE patches to finish wiring, tests,
  CI and migrations.
*/
