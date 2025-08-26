'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.startServer = startServer;
const dotenv_1 = __importDefault(require('dotenv'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
// Prefer config under ~/.BeeperMCP for standalone/packaged use
const HOME_BASE =
  process.env.BEEPERMCP_HOME ||
  path_1.default.join(os_1.default.homedir(), '.BeeperMCP');
const HOME_ENV = path_1.default.join(HOME_BASE, '.beeper-mcp-server.env');
try {
  // Load home-scoped env first if present
  if (fs_1.default.existsSync(HOME_ENV))
    dotenv_1.default.config({ path: HOME_ENV });
} catch {}
// Then load cwd env file (overrides home values when present)
dotenv_1.default.config({ path: '.beeper-mcp-server.env' });
const matrix_js_sdk_1 = __importDefault(require('matrix-js-sdk'));
const fs_1 = __importDefault(require('fs'));
const mcp_server_js_1 = require('./mcp-server.js');
const mcp_compat_js_1 = require('./mcp-compat.js');
const utils_js_1 = require('../utils.js');
const event_logger_js_1 = require('./event-logger.js');
const runtime_js_1 = require('./config/runtime.js');
const HS = process.env.MATRIX_HOMESERVER ?? 'https://matrix.beeper.com';
const UID = process.env.MATRIX_USERID;
const TOKEN = process.env.MATRIX_TOKEN;
// Default persistent locations under ~/.BeeperMCP when not provided
const CACHE_DIR =
  process.env.MATRIX_CACHE_DIR || path_1.default.join(HOME_BASE, 'mx-cache');
const LOG_DIR =
  process.env.MESSAGE_LOG_DIR || path_1.default.join(HOME_BASE, 'room-logs');
const ENABLE_SEND = process.env.ENABLE_SEND_MESSAGE === '1';
const API_KEY =
  process.env.MCP_API_KEY ||
  ((0, mcp_compat_js_1.isStdioMode)() ? 'local-stdio-mode' : undefined);
const PORT = parseInt(process.env.MCP_SERVER_PORT || '3000');
async function startServer() {
  console.error('Starting Beeper MCP server...');
  if (!UID) throw new Error('MATRIX_USERID is required');
  if (!TOKEN) throw new Error('MATRIX_TOKEN is required');
  // Ensure persistent directories exist
  for (const d of [HOME_BASE, CACHE_DIR, LOG_DIR]) {
    if (!fs_1.default.existsSync(d))
      fs_1.default.mkdirSync(d, { recursive: true });
  }
  // Load device ID from session if available
  let deviceId = null;
  try {
    const sessionFile = path_1.default.join(CACHE_DIR, 'session.json');
    if (fs_1.default.existsSync(sessionFile)) {
      const sessionData = JSON.parse(
        fs_1.default.readFileSync(sessionFile, 'utf8'),
      );
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
  const client = matrix_js_sdk_1.default.createClient({
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
    const cfg = (0, runtime_js_1.loadConfig)();
    const logDb = (0, utils_js_1.openLogDb)(cfg.logDbPath);
    const { queue: queueMedia, flush: flushMedia } = (0,
    utils_js_1.createMediaWriter)(logDb);
    const { queue: queueLog, flush: flushLogs } = (0,
    utils_js_1.createLogWriter)(logDb, cfg.logSecret);
    const mediaDownloader = (0, utils_js_1.createMediaDownloader)(
      logDb,
      queueMedia,
      queueLog,
      cfg.mediaSecret,
    );
    const logging = (0, event_logger_js_1.setupEventLogging)(client, console, {
      logDir: cfg.logDir,
      logMaxBytes: cfg.logMaxBytes,
      logSecret: cfg.logSecret,
      mediaSecret: cfg.mediaSecret,
      mediaDownloader,
      queueLog,
      testRoomId: cfg.testRoomId,
      testLimit: cfg.testLimit,
      uid: UID,
      shutdown: async () => {
        await mediaDownloader.flush();
        await logging.flush();
        await flushMedia();
        await flushLogs();
        process.exit(0);
      },
    });
    // Determine mode and start appropriate server
    if (
      (0, mcp_compat_js_1.isStdioMode)() ||
      process.env.MCP_STDIO_MODE === '1'
    ) {
      console.error('Starting in STDIO mode for MCP clients...');
      return await (0, mcp_server_js_1.startStdioServer)(
        client,
        logDb,
        ENABLE_SEND,
        cfg.logSecret,
      );
    } else {
      console.error(`Starting in HTTP mode on port ${PORT}...`);
      if (!API_KEY) {
        throw new Error('MCP_API_KEY is required for HTTP mode');
      }
      return await (0, mcp_server_js_1.startHttpServer)(
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
