import Pino from 'pino';

export async function verifyAccessToken(
  hs: string,
  token: string,
  uid: string | undefined,
  logger: Pino.Logger,
): Promise<void> {
  try {
    const res = await fetch(`${hs}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { user_id?: string };
    if (!data.user_id) throw new Error('No user_id in response');
    if (uid && data.user_id !== uid) {
      throw new Error(`Token user_id ${data.user_id} does not match ${uid}`);
    }
    logger.info(`Access token validated for ${data.user_id}`);
  } catch (err: any) {
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

  Once you add any of the files above, tell me which ones you added and I'll
  apply the remaining precise SEARCH/REPLACE patches to finish wiring, tests,
  CI and migrations.
*/
