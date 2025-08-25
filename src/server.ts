import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
// Prefer config under ~/.BeeperMCP for standalone/packaged use
const HOME_BASE =
  process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
const HOME_ENV = path.join(HOME_BASE, '.beeper-mcp-server.env');
try {
  // Load home-scoped env first if present
  if (fs.existsSync(HOME_ENV)) dotenv.config({ path: HOME_ENV });
} catch {}
// Then load cwd env file (overrides home values when present)
dotenv.config({ path: '.beeper-mcp-server.env' });
import sdk from 'matrix-js-sdk';
import fs from 'fs';
import { startStdioServer, startHttpServer } from './mcp-server.js';
import { isStdioMode } from './mcp-compat.js';
import {
  openLogDb,
  createLogWriter,
  createMediaWriter,
  createMediaDownloader,
} from '../utils.js';
import { setupEventLogging } from './event-logger.js';
import { loadConfig as loadRuntimeConfig } from './config/runtime.js';

const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
const TOKEN = process.env.MATRIX_TOKEN;
// Default persistent locations under ~/.BeeperMCP when not provided
const CACHE_DIR =
  process.env.MATRIX_CACHE_DIR || path.join(HOME_BASE, 'mx-cache');
const LOG_DIR =
  process.env.MESSAGE_LOG_DIR || path.join(HOME_BASE, 'room-logs');
const ENABLE_SEND = process.env.ENABLE_SEND_MESSAGE === '1';
const API_KEY =
  process.env.MCP_API_KEY || (isStdioMode() ? 'local-stdio-mode' : undefined);
const PORT = parseInt(process.env.MCP_SERVER_PORT || '3000');

export async function startServer() {
  console.error('Starting Beeper MCP server...');

  if (!UID) throw new Error('MATRIX_USERID is required');
  if (!TOKEN) throw new Error('MATRIX_TOKEN is required');

  // Ensure persistent directories exist
  for (const d of [HOME_BASE, CACHE_DIR, LOG_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // Load device ID from session if available
  let deviceId = null;
  try {
    const sessionFile = path.join(CACHE_DIR, 'session.json');
    if (fs.existsSync(sessionFile)) {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      deviceId = sessionData.deviceId;
    }
  } catch (e) {
    console.error('Failed to load session data:', e);
  }

  // Generate a new device ID if we don't have one
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 12);
  }

  console.error('Creating Matrix client...');
  const client = sdk.createClient({
    baseUrl: HS,
    userId: UID,
    accessToken: TOKEN,
    deviceId: deviceId,
  });

  try {
    console.error('Verifying access token...');
    const whoami = await client.whoami();
    console.error('Authenticated as:', whoami.user_id);

    // Initialize SQLite log DB and media/log writers
    const cfg = loadRuntimeConfig();
    const logDb = openLogDb(cfg.logDbPath);
    const { queue: queueMedia, flush: flushMedia } = createMediaWriter(logDb);
    const { queue: queueLog, flush: flushLogs } = createLogWriter(
      logDb,
      cfg.logSecret,
    );
    const mediaDownloader = createMediaDownloader(
      logDb,
      queueMedia,
      queueLog,
      cfg.mediaSecret,
    );
    const logging = setupEventLogging(client, console as any, {
      logDir: cfg.logDir,
      logMaxBytes: cfg.logMaxBytes,
      logSecret: cfg.logSecret,
      mediaSecret: cfg.mediaSecret,
      mediaDownloader,
      queueLog,
      testRoomId: cfg.testRoomId,
      testLimit: cfg.testLimit,
      uid: UID!,
      shutdown: async () => {
        await mediaDownloader.flush();
        await logging.flush();
        await flushMedia();
        await flushLogs();
        process.exit(0);
      },
    });

    // Determine mode and start appropriate server
    if (isStdioMode() || process.env.MCP_STDIO_MODE === '1') {
      console.error('Starting in STDIO mode for MCP clients...');
      return await startStdioServer(client, logDb, ENABLE_SEND, cfg.logSecret);
    } else {
      console.error(`Starting in HTTP mode on port ${PORT}...`);
      if (!API_KEY) {
        throw new Error('MCP_API_KEY is required for HTTP mode');
      }
      return await startHttpServer(
        client,
        logDb,
        ENABLE_SEND,
        API_KEY,
        cfg.logSecret,
        PORT,
      );
    }
  } catch (e) {
    console.error('Failed to start server:', e);
    throw e;
  }
}
