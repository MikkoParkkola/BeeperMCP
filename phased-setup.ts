#!/usr/bin/env node
/// <reference path="./matrix-js-sdk-shim.d.ts" />
/*
  Helper note: phased-setup.ts references several runtime modules and
  project files. If you haven't added them yet, consider adding:

  - src/config.ts
  - utils.js
  - mcp-tools.js
  - src/decryption-manager.js
  - src/crypto.js
  - src/auth.js
  - src/mcp/resources.ts
  - src/index/search.ts
  - src/index/reembed.ts
  - src/mcp/tools/*.ts (recap, responseTime, sentimentTrends, sentimentDistribution, whoSaid, activity, draftReply, sendMessage)

  These are not strictly required for the setup script itself but are
  referenced elsewhere in the project and useful to include now to
  allow subsequent SEARCH/REPLACE edits to be applied cleanly.
*/
import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk, { MatrixClient } from 'matrix-js-sdk';
import fs from 'fs';
import path from 'path';
import Pino from 'pino';
import { FileSessionStore, ensureDir } from './utils.js';

const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
let TOKEN = process.env.MATRIX_TOKEN;
const PASSWORD = process.env.MATRIX_PASSWORD;
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';
const LOG_DIR = process.env.MESSAGE_LOG_DIR ?? './room-logs';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

async function phaseLogin(
  logger: Pino.Logger,
): Promise<{ client: MatrixClient; token: string }> {
  logger.info('Phase 1: login');
  if (!UID) throw new Error('MATRIX_USERID is required');
  ensureDir(CACHE_DIR);
  const session = new FileSessionStore(path.join(CACHE_DIR, 'session.json'));
  let deviceId = session.getItem('deviceId') as string | null;
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    session.setItem('deviceId', deviceId);
  }
  const client = sdk.createClient({ baseUrl: HS, userId: UID, deviceId });
  if (TOKEN) {
    logger.info('Using MATRIX_TOKEN from environment');
    client.setAccessToken(TOKEN!);
    return { client, token: TOKEN! };
  }
  if (!PASSWORD) throw new Error('MATRIX_PASSWORD must be set for login');
  try {
    const res = await client.login('m.login.password', {
      identifier: { type: 'm.id.user', user: UID },
      password: PASSWORD,
      initial_device_display_name: 'BeeperMCP',
    } as any);
    TOKEN = res.access_token;
    session.setItem('token', TOKEN);
    session.setItem('deviceId', res.device_id);
    logger.info(`Logged in as ${UID}, device ${res.device_id}`);
    client.setAccessToken(TOKEN!);
    return { client, token: TOKEN! };
  } catch (e: any) {
    logger.error(`Login failed: ${e.message}`);
    throw e;
  }
}

async function phaseLoadCache(logger: Pino.Logger) {
  logger.info('Phase 2: load local cache');
  ensureDir(CACHE_DIR);
  ensureDir(LOG_DIR);
  if (process.env.DELETE_PLAINTEXT_LOGS === 'true') {
    const files = fs.readdirSync(LOG_DIR);
    for (const f of files) {
      if (f.endsWith('.log')) fs.rmSync(path.join(LOG_DIR, f), { force: true });
    }
    logger.info('Plain-text logs removed');
  }
}

async function restoreRoomKeys(client: MatrixClient, logger: Pino.Logger) {
  const recoveryKey = process.env.KEY_BACKUP_RECOVERY_KEY;
  if (
    (client as any).restoreKeyBackupWithCache &&
    (client as any).getKeyBackupVersion
  ) {
    try {
      const backupInfo = await (client as any).getKeyBackupVersion();
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
          'Key backup exists, but KEY_BACKUP_RECOVERY_KEY not provided.',
        );
      }
    } catch (e: any) {
      logger.error('Failed to restore from secure backup:', e.message);
    }
  }
  try {
    const keyFile = path.join(CACHE_DIR, 'room-keys.json');
    if (fs.existsSync(keyFile)) {
      const exported = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.importRoomKeys(exported as any, {});
        if (exported && typeof (exported as any).length === 'number') {
          logger.info(
            `Attempted import from room-keys.json: Found ${exported.length} sessions in the file.`,
          );
        }
      }
    }
  } catch (e: any) {
    logger.warn('Failed to import room keys:', e.message);
  }
}

async function phaseGetKeys(client: MatrixClient, logger: Pino.Logger) {
  logger.info('Phase 3: load encryption keys');
  try {
    const olmMod = await import('@matrix-org/olm');
    const Olm = (olmMod as any).default || olmMod;
    await Olm.init();
    (globalThis as any).Olm = Olm;
    logger.info('Olm library initialized');
  } catch (e: any) {
    logger.error(`Olm init failed: ${e.message}`);
    throw e;
  }
  await (client as any).initCrypto();
  await restoreRoomKeys(client, logger);
}

async function phaseDecrypt(client: MatrixClient, logger: Pino.Logger) {
  logger.info('Phase 4: start sync');
  await client.startClient({ initialSyncLimit: 10 });
  await new Promise<void>((resolve) => {
    (client as any).once('sync', (s: any) => s === 'PREPARED' && resolve());
  });
  logger.info('Client synced, ready for decryption');
  // stop the Matrix client so the setup script can exit cleanly
  await client.stopClient();
  logger.info('Client stopped');
}

(async () => {
  const logger = Pino({ level: LOG_LEVEL });
  let res;
  try {
    res = await phaseLogin(logger);
  } catch (e: any) {
    logger.error(`Phase 1 failed: ${e.message}`);
    process.exit(1);
  }
  try {
    await phaseLoadCache(logger);
  } catch (e: any) {
    logger.error(`Phase 2 failed: ${e.message}`);
    process.exit(1);
  }
  try {
    await phaseGetKeys(res.client, logger);
  } catch (e: any) {
    logger.error(`Phase 3 failed: ${e.message}`);
    process.exit(1);
  }
  try {
    await phaseDecrypt(res.client, logger);
  } catch (e: any) {
    logger.error(`Phase 4 failed: ${e.message}`);
    process.exit(1);
  }
})();
