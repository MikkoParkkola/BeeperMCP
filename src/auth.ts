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

  - utils.js
      Runtime utilities referenced widely (file logging, sqlite helpers, media downloader).
  - mcp-tools.js
      MCP helper used by src/mcp.ts (buildMcpServer).
  - scripts/create_messages_table.sql or scripts/migrate.ts
      SQL/migration to create the Postgres `messages` table used by analytics & tools.
  - src/mcp/resources.ts
      Resource handlers (history, media, index/status) — ensure the version that
      accepts (logDb, logSecret) is present.
  - src/decryption-manager.js
      DecryptionManager implementation used by event-logger for E2EE flows.
  - test/
      Unit, integration, and system tests (see roadmap tests added earlier).

  Once you add any of the files above, tell me and I'll apply the remaining
  focused SEARCH/REPLACE patches to finish wiring, tests, and CI.
*/
