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

  - src/config.ts
      Central configuration loader used by server and analytics code.
  - utils.js
      Runtime utilities used across the project (file logging, sqlite helpers, media downloader).
  - mcp-tools.js and mcp-tools.d.ts
      Helper used by src/mcp.ts to build the MCP server and TypeScript types.
  - src/mcp/resources.ts
      Resource handlers for history, message context and media (accepting logDb/logSecret).
  - scripts/migrate.ts and migrations/*.sql
      DB migrations to create the Postgres `messages` table and indexes.
  - src/ingest/matrix.ts
      Full /sync ingest to persist messages to Postgres.
  - src/decryption-manager.js
      Decryption manager implementation used by event-logger for E2EE flows.
  - src/event-logger.ts
      Wiring to log events, queue media downloads and write to SQLite.
  - src/mcp/tools/*.ts (whoSaid, activity, sentimentTrends, sentimentDistribution, recap, responseTime, draftReply, sendMessage)
      Analytics and tools used by the MCP server.
  - tests/
      Unit and integration tests (vitest or node --test). Consider adding pg-mem based tests.
  - Dockerfile / docker-compose.yml
      For packaging and deployment.

  Add any of the above files to the chat/repo and I'll apply precise SEARCH/REPLACE
  edits to wire them into the build, tests, and CI.
*/
