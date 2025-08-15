import sdk from 'matrix-js-sdk';
import path from 'path';
import Pino from 'pino';
import { FileSessionStore } from '../utils.js';
import { verifyAccessToken } from './auth.js';
import {
  loadOlm,
  loadRustCryptoAdapter,
  loadFileCryptoStore,
  restoreRoomKeys,
} from './crypto.js';

export interface ClientConfig {
  baseUrl: string;
  userId: string;
  accessToken: string;
  cacheDir: string;
  msc4190: boolean;
  msc3202: boolean;
  sessionSecret?: string;
  keyBackupRecoveryKey?: string;
}

export async function createMatrixClient(
  config: ClientConfig,
  logger: Pino.Logger,
) {
  const {
    baseUrl,
    userId,
    accessToken,
    cacheDir,
    msc4190,
    msc3202,
    sessionSecret,
    keyBackupRecoveryKey,
  } = config;

  await loadOlm(logger);
  const initRust = await loadRustCryptoAdapter(logger);

  const sessionStore = new FileSessionStore(
    path.join(cacheDir, 'session.json'),
    sessionSecret,
  );
  const deviceKey = `deviceId:${userId}`;
  let deviceId = sessionStore.getItem(deviceKey) as string | null;
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    sessionStore.setItem(deviceKey, deviceId);
  }

  const cryptoStore = await loadFileCryptoStore(cacheDir, logger);

  const sdkLogger = {
    debug: logger.debug.bind(logger),
    info: logger.info.bind(logger),
    warn: (msg: any, ...args: any[]) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event'))
          return;
      } catch (err: any) {
        logger.warn('Failed to inspect SDK warning message', err);
      }
      logger.warn(msg as any, ...args);
    },
    log: (msg: any, ...args: any[]) => {
      try {
        if (typeof msg === 'string' && msg.startsWith('Error decrypting event'))
          return;
      } catch (err: any) {
        logger.warn('Failed to inspect SDK log message', err);
      }
      logger.info(msg as any, ...args);
    },
    error: logger.error.bind(logger),
  };

  const client = sdk.createClient({
    logger: sdkLogger,
    baseUrl,
    accessToken,
    userId,
    deviceId,
    sessionStore,
    cryptoStore,
    timelineSupport: true,
    encryption: { msc4190, msc3202 },
  } as any);

  await verifyAccessToken(baseUrl, accessToken, userId, logger);

  await client.initCrypto();
  logger.info('matrix-js-sdk crypto initialized');
  const cryptoApiGlobal = client.getCrypto();
  if (cryptoApiGlobal) {
    if (
      typeof (cryptoApiGlobal as any).setGlobalErrorOnUnknownDevices ===
      'function'
    ) {
      (cryptoApiGlobal as any).setGlobalErrorOnUnknownDevices(false);
    }
    if (
      typeof (cryptoApiGlobal as any).setGlobalBlacklistUnverifiedDevices ===
      'function'
    ) {
      (cryptoApiGlobal as any).setGlobalBlacklistUnverifiedDevices(false);
    }
  }

  if (initRust) {
    await initRust(client);
    logger.debug('rust-crypto adapter initialized');
  }

  await restoreRoomKeys(client, cacheDir, logger, keyBackupRecoveryKey);

  return { client, sessionStore };
}

// Recommended additional files to add to the chat/repo if you want me to continue
// wiring functionality and tests:
// - Postgres: messages schema (CREATE TABLE messages ...)
// - scripts/migrate.ts
// - src/ingest/matrix.ts        // full /sync ingest to populate messages table
// - src/index/reembed.ts        // re-embedding worker (expand if necessary)
// - src/mcp/tools/sentimentTrends.ts
// - src/mcp/tools/sentimentDistribution.ts
// - src/mcp/tools/messageContext.ts
// - src/mcp/tools/mediaProxy.ts
// - src/decryption-manager.js
// - src/event-logger.ts         // already provided but may need tweaks for E2EE
// - mcp-tools.d.ts              // already provided
