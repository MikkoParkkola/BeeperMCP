'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.loadConfig = loadConfig;
const path_1 = __importDefault(require('path'));
const os_1 = __importDefault(require('os'));
const dotenv_1 = __importDefault(require('dotenv'));
const zod_1 = require('zod');
const utils_js_1 = require('../../utils.js');
function loadConfig() {
  const HOME_BASE =
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP');
  const HOME_ENV = path_1.default.join(HOME_BASE, '.beeper-mcp-server.env');
  try {
    if (process.env.BEEPERMCP_HOME && HOME_ENV)
      dotenv_1.default.config({ path: HOME_ENV });
  } catch {}
  dotenv_1.default.config({ path: '.beeper-mcp-server.env' });
  const schema = zod_1.z.object({
    MATRIX_CACHE_DIR: zod_1.z.string().optional(),
    MESSAGE_LOG_DIR: zod_1.z.string().optional(),
    LOG_MAX_BYTES: zod_1.z.coerce.number().default(5000000),
    LOG_SECRET: zod_1.z.string().optional(),
    MEDIA_SECRET: zod_1.z.string().optional(),
    LOG_LEVEL: zod_1.z.string().default('info'),
    LOG_RETENTION_DAYS: zod_1.z.coerce.number().default(30),
    MATRIX_HOMESERVER: zod_1.z.string().default('https://matrix.beeper.com'),
    MATRIX_USERID: zod_1.z.string(),
    MATRIX_TOKEN: zod_1.z.string().optional(),
    MCP_API_KEY: zod_1.z.string(),
    BACKFILL_CONCURRENCY: zod_1.z.coerce.number().default(5),
    MSC4190: zod_1.z.string().optional(),
    MSC3202: zod_1.z.string().optional(),
    ENABLE_SEND_MESSAGE: zod_1.z.string().optional(),
    LOG_DB_PATH: zod_1.z.string().optional(),
    TEST_ROOM_ID: zod_1.z.string().optional(),
    TEST_LIMIT: zod_1.z.coerce.number().default(0),
    SESSION_SECRET: zod_1.z.string().optional(),
    PENDING_DECRYPT_MAX_SESSIONS: zod_1.z.coerce.number().default(1000),
    PENDING_DECRYPT_MAX_PER_SESSION: zod_1.z.coerce.number().default(100),
    REQUESTED_KEYS_MAX: zod_1.z.coerce.number().default(1000),
    KEY_REQUEST_INTERVAL_MS: zod_1.z.coerce.number().default(1000),
    KEY_REQUEST_MAX_INTERVAL_MS: zod_1.z.coerce.number().default(300000),
    KEY_BACKUP_RECOVERY_KEY: zod_1.z.string().optional(),
    MCP_PORT: zod_1.z.coerce.number().default(3000),
  });
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  const env = result.data;
  const cacheDir =
    env.MATRIX_CACHE_DIR || path_1.default.join(HOME_BASE, 'mx-cache');
  const logDir =
    env.MESSAGE_LOG_DIR || path_1.default.join(HOME_BASE, 'room-logs');
  return {
    cacheDir,
    logDir,
    logMaxBytes: env.LOG_MAX_BYTES,
    logSecret: env.LOG_SECRET,
    mediaSecret: env.MEDIA_SECRET,
    logLevel: env.LOG_LEVEL,
    logRetentionDays: env.LOG_RETENTION_DAYS,
    homeserver: env.MATRIX_HOMESERVER,
    userId: env.MATRIX_USERID,
    token: env.MATRIX_TOKEN,
    mcpApiKey: env.MCP_API_KEY,
    backfillConcurrency: env.BACKFILL_CONCURRENCY,
    msc4190: env.MSC4190 !== 'false',
    msc3202: env.MSC3202 !== 'false',
    enableSendMessage: (0, utils_js_1.envFlag)('ENABLE_SEND_MESSAGE'),
    logDbPath: env.LOG_DB_PATH ?? path_1.default.join(logDir, 'messages.db'),
    testRoomId: env.TEST_ROOM_ID,
    testLimit: env.TEST_LIMIT,
    sessionSecret: env.SESSION_SECRET,
    pendingDecryptMaxSessions: env.PENDING_DECRYPT_MAX_SESSIONS,
    pendingDecryptMaxPerSession: env.PENDING_DECRYPT_MAX_PER_SESSION,
    requestedKeysMax: env.REQUESTED_KEYS_MAX,
    keyRequestIntervalMs: env.KEY_REQUEST_INTERVAL_MS,
    keyRequestMaxIntervalMs: env.KEY_REQUEST_MAX_INTERVAL_MS,
    keyBackupRecoveryKey: env.KEY_BACKUP_RECOVERY_KEY,
    mcpPort: env.MCP_PORT,
  };
}
