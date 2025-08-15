import fs from 'fs';
import path from 'path';
import Pino from 'pino';
import { MatrixClient } from 'matrix-js-sdk';

export async function loadOlm(logger: Pino.Logger): Promise<void> {
  try {
    const olmMod = await import('@matrix-org/olm');
    const Olm = (olmMod as any).default || olmMod;
    await Olm.init();
    (globalThis as any).Olm = Olm;
    logger.info('Olm library initialized');
  } catch (e: any) {
    console.error(
      'Error: @matrix-org/olm not installed or failed to init:',
      e.message,
    );
    process.exit(1);
  }
}

export async function loadRustCryptoAdapter(
  logger: Pino.Logger,
): Promise<((client: MatrixClient) => Promise<void>) | null> {
  try {
    const mod = await import('@matrix-org/matrix-sdk-crypto-nodejs');
    logger.debug('rust-crypto adapter loaded');
    return (mod as any).initRustCrypto;
  } catch (err: any) {
    logger.warn('rust-crypto adapter not available', err);
    return null;
  }
}

export async function loadFileCryptoStore(
  cacheDir: string,
  logger: Pino.Logger,
) {
  try {
    const mod = await import(
      'matrix-js-sdk/dist/cjs/crypto/node/crypto-store.js'
    );
    logger.debug('FileCryptoStore loaded');
    const FileCryptoStoreClass = (mod as any).FileCryptoStore;
    return new FileCryptoStoreClass(path.join(cacheDir, 'crypto-store'));
  } catch (err: any) {
    logger.warn('FileCryptoStore unavailable, using in-memory', err);
    return undefined;
  }
}

export async function restoreRoomKeys(
  client: MatrixClient,
  cacheDir: string,
  logger: Pino.Logger,
  recoveryKey?: string,
) {
  if (
    typeof (client as any).restoreKeyBackupWithCache === 'function' &&
    typeof (client as any).getKeyBackupVersion === 'function'
  ) {
    try {
      const backupInfo = await (client as any).getKeyBackupVersion();
      logger.info(
        {
          backupVersion: backupInfo?.version,
          backupAlgorithm: backupInfo?.algorithm,
          recoveryKeyType: backupInfo?.recovery_key?.type,
        },
        'Received key backup info from server.',
      );
      if (!backupInfo) {
        logger.info('No key backup configured on server.');
      } else if (recoveryKey) {
        const restored = await (client as any).restoreKeyBackupWithCache(
          undefined,
          recoveryKey,
          backupInfo as any,
        );
        logger.info(`Restored ${restored.length} room keys via secure backup`);
      } else {
        logger.warn(
          'Key backup exists on server, but no KEY_BACKUP_RECOVERY_KEY provided.',
        );
      }
    } catch (e: any) {
      logger.error('Failed to restore from secure backup:', e.message);
    }
  }
  try {
    const keyFile = path.join(cacheDir, 'room-keys.json');
    if (fs.existsSync(keyFile)) {
      const exported = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.importRoomKeys(exported as any, {});
        if (exported && typeof (exported as any).length === 'number') {
          logger.info(
            `Attempted import from room-keys.json: Found ${exported.length} sessions in the file.`,
          );
        } else {
          logger.warn(
            'Attempted import from room-keys.json: File existed but content was not as expected.',
          );
        }
      }
    }
  } catch (e: any) {
    logger.warn('Failed to import room keys:', e.message);
  }
}

/*
  Helpful: files you should add to the chat/repo to finish wiring and make a
  release-ready package (many are already referenced by other modules):

  Core required for build & runtime (high priority):
  - mcp-tools.js
      Runtime MCP server builder (required by src/mcp.ts and by the build step).
  - utils.js
      Runtime utilities used across the project (file logging, sqlite helpers, media downloader).
  - scripts/migrate.ts and migrations/*.sql
      DB migrations to create the Postgres `messages` table and indexes.
  - Postgres messages schema
      CREATE TABLE messages (...) and indexes (ts_utc, room_id, sender; GIN on tsv and media_types).

  Other important application pieces:
  - src/ingest/matrix.ts
      Full /sync ingest to persist messages to Postgres.
  - src/decryption-manager.js
      Decryption manager implementation used by event-logger for E2EE flows.
  - src/mcp/tools/sendMessage.ts
      Tool to actually send messages (approval + guardrails + integration).
  - src/mcp/tools/whoSaid.ts
  - src/mcp/tools/activity.ts
  - src/mcp/tools/sentimentTrends.ts
  - src/mcp/tools/sentimentDistribution.ts
      Analytics/tools used by MCP; several stubs exist but full behavior needs these.

  Helpful for CI/tests/packaging:
  - tests/ (vitest or node --test), preferably with pg-mem based integration tests
  - Dockerfile / docker-compose.yml for local/dev deployment
  - mcp-tools.d.ts (type hints) — already useful for TypeScript builds

  Notes:
  - You've already added many server-side TypeScript files; the two missing runtime
    pieces that will block a full release build/run are mcp-tools.js (required by
    the build script and src/mcp.ts) and utils.js (used widely at runtime).
  - Adding the Postgres schema + migrations and scripts/migrate.ts is required to
    run analytics tools against a real DB.
  - If you plan to exercise E2EE decryption and media download, add
    src/decryption-manager.js and ensure src/crypto.ts and src/auth.ts are present
    (you've already added src/crypto.ts and src/auth.ts).

  What I can do next:
  - Once you add mcp-tools.js and utils.js (and optionally the migrations and
    ingest code), I will apply the remaining precise SEARCH/REPLACE patches to:
      * Wire mcp-tools into the build and init paths
      * Finalize resource handlers and tools queries
      * Add small test hooks and CI tweaks we discussed

  Add any of the above files to the chat/repo and I'll apply precise SEARCH/REPLACE
  edits to wire them into the build, tests, and CI.
*/
