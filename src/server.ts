/**
 * beeper-mcp-server.ts v2.2.0
 *
 * • Local cache for syncToken
 * • E2EE decryption via Olm (required) with optional rust-crypto
 * • Saves chat logs and media per-room
 * • MCP tools: list_rooms, create_room, list_messages, send_message
 * • Graceful shutdown
 */

/// <reference path="../matrix-js-sdk-shim.d.ts" />

import sdk from 'matrix-js-sdk';
import Pino from 'pino';
import fs from 'fs';
import path from 'path';
import {
  ensureDir,
  FileSessionStore,
  openLogDb,
  createLogWriter,
  createMediaWriter,
  createMediaDownloader,
  createFlushHelper,
  cleanupLogsAndMedia,
} from '../utils.js';
import { setupEventLogging } from './event-logger.js';
import { startSync } from './sync.js';
import { initMcpServer } from './mcp.js';
import { verifyAccessToken } from './auth.js';
import {
  loadOlm,
  loadRustCryptoAdapter,
  loadFileCryptoStore,
  restoreRoomKeys,
} from './crypto.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const logger = Pino({ level: config.logLevel });
let TOKEN: string | undefined = config.token;
if (!TOKEN) {
  try {
    const sessionPath = path.join(config.cacheDir, 'session.json');
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as Record<
        string,
        string
      >;
      TOKEN = data.token;
    }
  } catch (err: any) {
    logger.warn('Failed to read session token from cache', err);
  }
}
if (!config.userId || !TOKEN) {
  console.error('Error: MATRIX_USERID and MATRIX_TOKEN must be set');
  process.exit(1);
}

// --- Session Store for sync tokens ---
export async function startServer() {
  ensureDir(config.cacheDir);
  ensureDir(config.logDir);
  const logDb = openLogDb(config.logDbPath);
  await cleanupLogsAndMedia(config.logDir, logDb, config.logRetentionDays);
  const flusher = createFlushHelper();
  const { queue: queueLog, flush: flushLogs } = createLogWriter(
    logDb,
    config.logSecret,
  );
  flusher.register(flushLogs);
  const { queue: queueMedia, flush: flushMedia } = createMediaWriter(logDb);
  flusher.register(flushMedia);
  const mediaDownloader = createMediaDownloader(
    logDb,
    queueMedia,
    queueLog,
    config.mediaSecret,
  );
  // wrap for matrix-js-sdk: suppress expected decryption errors
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
      // map sdk.log to info
      logger.info(msg as any, ...args);
    },
    error: logger.error.bind(logger),
  };
  // test mode: limit to one room and number of events
  const TEST_ROOM_ID = config.testRoomId;
  const TEST_LIMIT = config.testLimit;

  await loadOlm(logger);
  const initRust = await loadRustCryptoAdapter(logger);

  // session storage & device
  const sessionStore = new FileSessionStore(
    path.join(config.cacheDir, 'session.json'),
    config.sessionSecret,
  );
  const syncKey = `syncToken:${config.userId}`;
  const deviceKey = `deviceId:${config.userId}`;
  let deviceId = sessionStore.getItem(deviceKey) as string | null;
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    sessionStore.setItem(deviceKey, deviceId);
  }

  const cryptoStore = await loadFileCryptoStore(config.cacheDir, logger);

  // Matrix client setup
  const client = sdk.createClient({
    logger: sdkLogger,
    baseUrl: config.homeserver,
    accessToken: TOKEN,
    userId: config.userId,
    deviceId,
    sessionStore,
    cryptoStore,
    timelineSupport: true,
    encryption: { msc4190: config.msc4190, msc3202: config.msc3202 },
  } as any);

  await verifyAccessToken(config.homeserver, TOKEN!, config.userId, logger);

  // init crypto
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

  await restoreRoomKeys(
    client,
    config.cacheDir,
    logger,
    config.keyBackupRecoveryKey,
  );

  const shutdown = async () => {
    logger.info('Shutting down');
    try {
      await flusher.flush();
      await client.stopClient();
      await mediaDownloader.flush();
    } catch (err: any) {
      logger.warn('Error during shutdown', err);
    }
    process.exit(0);
  };

  setupEventLogging(client, logger, {
    logDir: config.logDir,
    logMaxBytes: config.logMaxBytes,
    logSecret: config.logSecret,
    mediaSecret: config.mediaSecret,
    mediaDownloader,
    queueLog,
    testRoomId: TEST_ROOM_ID,
    testLimit: TEST_LIMIT,
    uid: config.userId!,
    shutdown,
    pendingDecryptMaxSessions: config.pendingDecryptMaxSessions,
    pendingDecryptMaxPerSession: config.pendingDecryptMaxPerSession,
    requestedKeysMax: config.requestedKeysMax,
    keyRequestIntervalMs: config.keyRequestIntervalMs,
    keyRequestMaxIntervalMs: config.keyRequestMaxIntervalMs,
  });

  await startSync(client, sessionStore, syncKey, logger, {
    concurrency: config.backfillConcurrency,
    testRoomId: TEST_ROOM_ID,
    cacheDir: config.cacheDir,
  });

  await initMcpServer(
    client,
    logDb,
    config.enableSendMessage,
    config.logSecret,
  );

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
