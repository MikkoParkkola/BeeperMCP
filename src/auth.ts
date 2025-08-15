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

  - src/decryption-manager.js
      Implementation of DecryptionManager used by event-logger for E2EE flows.

  - scripts/create_messages_table.sql
      SQL to create the Postgres `messages` table used by analytics & tools.

  - scripts/migrate.ts
      Migration runner to apply DB schema/setup.

  - src/mcp/resources.ts
      Resource handlers (history, media, index/status) — ensure the version that
      accepts (logDb, logSecret) is present.

  - mcp-tools.js
      MCP tooling wiring used by build/test; ensure canonical copy exists.

  - src/index/search.ts
      (analytics search; present in repo but verify it's the intended version)

  - Any missing src/mcp/tools/*.ts you plan to use in tests (e.g. mediaProxy,
    messageContext) — many analytics tools are present, confirm they are the
    final versions.

  Notes:
  - If you add the SQL migration and decryption-manager, I can apply the final
    SEARCH/REPLACE patches and wire the test helpers (pg-mem injection) and CI.
  - You've already provided many files; the two most commonly-missing pieces for
    full integration tests are the Postgres schema (CREATE TABLE messages ...) and
    the decryption manager stub used by event-logger. Adding those next will let
    me complete the remaining patches and tests.
*/
