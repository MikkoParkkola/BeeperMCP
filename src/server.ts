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

import pino from 'pino';
import fs from 'fs';
import path from 'path';
import {
  ensureDir,
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
import { createMatrixClient } from './client.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const logger = pino({ level: config.logLevel }) as any;
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
  // test mode: limit to one room and number of events
  const TEST_ROOM_ID = config.testRoomId;
  const TEST_LIMIT = config.testLimit;

  const { client, sessionStore } = await createMatrixClient(
    {
      baseUrl: config.homeserver,
      userId: config.userId,
      accessToken: TOKEN!,
      cacheDir: config.cacheDir,
      msc4190: config.msc4190,
      msc3202: config.msc3202,
      sessionSecret: config.sessionSecret,
      keyBackupRecoveryKey: config.keyBackupRecoveryKey,
    },
    logger,
  );

  const syncKey = `syncToken:${config.userId}`;
  let mcpServerInstance: any;
  let httpServer: any;

  const shutdown = async () => {
    logger.info('Shutting down');
    try {
      await flusher.flush();
      await client.stopClient();
      await mediaDownloader.flush();
      await mcpServerInstance?.close();
      await new Promise((resolve) => httpServer?.close(resolve));
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
  });

  await startSync(client, sessionStore, syncKey, logger, {
    concurrency: config.backfillConcurrency,
    testRoomId: TEST_ROOM_ID,
    cacheDir: config.cacheDir,
  });

  ({ mcpServer: mcpServerInstance, httpServer } = await initMcpServer(
    client,
    logDb,
    config.enableSendMessage,
    config.mcpApiKey,
    config.logSecret,
    config.mcpPort,
  ));

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
