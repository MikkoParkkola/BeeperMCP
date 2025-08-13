import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { envFlag } from '../utils.js';

export interface Config {
  cacheDir: string;
  logDir: string;
  logMaxBytes: number;
  logSecret?: string;
  mediaSecret?: string;
  logLevel: string;
  logRetentionDays: number;
  homeserver: string;
  userId: string;
  token?: string;
  mcpApiKey: string;
  backfillConcurrency: number;
  msc4190: boolean;
  msc3202: boolean;
  enableSendMessage: boolean;
  logDbPath: string;
  testRoomId?: string;
  testLimit: number;
  sessionSecret?: string;
  pendingDecryptMaxSessions: number;
  pendingDecryptMaxPerSession: number;
  requestedKeysMax: number;
  keyRequestIntervalMs: number;
  keyRequestMaxIntervalMs: number;
  keyBackupRecoveryKey?: string;
  mcpPort: number;
}

export function loadConfig(): Config {
  dotenv.config({ path: '.beeper-mcp-server.env' });
  const schema = z.object({
    MATRIX_CACHE_DIR: z.string().default('./mx-cache'),
    MESSAGE_LOG_DIR: z.string().default('./room-logs'),
    LOG_MAX_BYTES: z.coerce.number().default(5_000_000),
    LOG_SECRET: z.string().optional(),
    MEDIA_SECRET: z.string().optional(),
    LOG_LEVEL: z.string().default('info'),
    LOG_RETENTION_DAYS: z.coerce.number().default(30),
    MATRIX_HOMESERVER: z.string().default('https://matrix.beeper.com'),
    MATRIX_USERID: z.string(),
    MATRIX_TOKEN: z.string().optional(),
    MCP_API_KEY: z.string(),
    BACKFILL_CONCURRENCY: z.coerce.number().default(5),
    MSC4190: z.string().optional(),
    MSC3202: z.string().optional(),
    ENABLE_SEND_MESSAGE: z.string().optional(),
    LOG_DB_PATH: z.string().optional(),
    TEST_ROOM_ID: z.string().optional(),
    TEST_LIMIT: z.coerce.number().default(0),
    SESSION_SECRET: z.string().optional(),
    PENDING_DECRYPT_MAX_SESSIONS: z.coerce.number().default(1000),
    PENDING_DECRYPT_MAX_PER_SESSION: z.coerce.number().default(100),
    REQUESTED_KEYS_MAX: z.coerce.number().default(1000),
    KEY_REQUEST_INTERVAL_MS: z.coerce.number().default(1000),
    KEY_REQUEST_MAX_INTERVAL_MS: z.coerce.number().default(300000),
    KEY_BACKUP_RECOVERY_KEY: z.string().optional(),
    MCP_PORT: z.coerce.number().default(3000),
  });
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  const env = result.data;
  return {
    cacheDir: env.MATRIX_CACHE_DIR,
    logDir: env.MESSAGE_LOG_DIR,
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
    enableSendMessage: envFlag('ENABLE_SEND_MESSAGE'),
    logDbPath: env.LOG_DB_PATH ?? path.join(env.MESSAGE_LOG_DIR, 'messages.db'),
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
