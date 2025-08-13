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

import dotenv from 'dotenv';
dotenv.config({ path: '.beeper-mcp-server.env' });
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
  envFlag,
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

// --- Constants ---
const CACHE_DIR = process.env.MATRIX_CACHE_DIR ?? './mx-cache';
const LOG_DIR = process.env.MESSAGE_LOG_DIR ?? './room-logs';
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES ?? '5000000');
const LOG_SECRET = process.env.LOG_SECRET;
const MEDIA_SECRET = process.env.MEDIA_SECRET;
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const logger = Pino({ level: LOG_LEVEL });
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? '30');
const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
let TOKEN: string | undefined = process.env.MATRIX_TOKEN;
const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
  console.error('Error: MCP_API_KEY must be set');
  process.exit(1);
}
if (!TOKEN) {
  try {
    const sessionPath = path.join(CACHE_DIR, 'session.json');
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
const CONC = Number(process.env.BACKFILL_CONCURRENCY ?? '5');
// enable MSC4190 key-forwarding by default; set MSC4190=false to disable
const MSC4190 = process.env.MSC4190 !== 'false';
// enable MSC3202 device masquerading by default; set MSC3202=false to disable
const MSC3202 = process.env.MSC3202 !== 'false';
const ENABLE_SEND = envFlag('ENABLE_SEND_MESSAGE');
if (!UID || !TOKEN) {
  console.error('Error: MATRIX_USERID and MATRIX_TOKEN must be set');
  process.exit(1);
}

// --- Session Store for sync tokens ---
export async function startServer() {
  ensureDir(CACHE_DIR);
  ensureDir(LOG_DIR);
  const LOG_DB_PATH =
    process.env.LOG_DB_PATH ?? path.join(LOG_DIR, 'messages.db');
  const logDb = openLogDb(LOG_DB_PATH);
  await cleanupLogsAndMedia(LOG_DIR, logDb, LOG_RETENTION_DAYS);
  const flusher = createFlushHelper();
  const { queue: queueLog, flush: flushLogs } = createLogWriter(
    logDb,
    LOG_SECRET,
  );
  flusher.register(flushLogs);
  const { queue: queueMedia, flush: flushMedia } = createMediaWriter(logDb);
  flusher.register(flushMedia);
  const mediaDownloader = createMediaDownloader(
    logDb,
    queueMedia,
    queueLog,
    MEDIA_SECRET,
  );
  // main Pino logger
  const logger = Pino({ level: LOG_LEVEL });
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
  const TEST_ROOM_ID = process.env.TEST_ROOM_ID;
  const TEST_LIMIT = process.env.TEST_LIMIT
    ? parseInt(process.env.TEST_LIMIT, 10)
    : 0;

  await loadOlm(logger);
  const initRust = await loadRustCryptoAdapter(logger);

  // session storage & device
  const sessionStore = new FileSessionStore(
    path.join(CACHE_DIR, 'session.json'),
    process.env.SESSION_SECRET,
  );
  const syncKey = `syncToken:${UID}`;
  const deviceKey = `deviceId:${UID}`;
  let deviceId = sessionStore.getItem(deviceKey) as string | null;
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
    sessionStore.setItem(deviceKey, deviceId);
  }

  const cryptoStore = await loadFileCryptoStore(CACHE_DIR, logger);

  // Matrix client setup
  const client = sdk.createClient({
    logger: sdkLogger,
    baseUrl: HS,
    accessToken: TOKEN,
    userId: UID,
    deviceId,
    sessionStore,
    cryptoStore,
    timelineSupport: true,
    encryption: { msc4190: MSC4190, msc3202: MSC3202 },
  } as any);

  await verifyAccessToken(HS, TOKEN!, UID, logger);

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

  await restoreRoomKeys(client, CACHE_DIR, logger);

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
    logDir: LOG_DIR,
    logMaxBytes: LOG_MAX_BYTES,
    logSecret: LOG_SECRET,
    mediaSecret: MEDIA_SECRET,
    mediaDownloader,
    queueLog,
    testRoomId: TEST_ROOM_ID,
    testLimit: TEST_LIMIT,
    uid: UID!,
    shutdown,
  });

  await startSync(client, sessionStore, syncKey, logger, {
    concurrency: CONC,
    testRoomId: TEST_ROOM_ID,
    cacheDir: CACHE_DIR,
  });

  await initMcpServer(client, logDb, ENABLE_SEND, LOG_SECRET);

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
