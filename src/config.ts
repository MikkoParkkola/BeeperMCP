import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { z } from 'zod';
import { envFlag } from '../utils.js';

export interface LocalConfig {
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

export function loadConfig(): LocalConfig {
  const HOME_BASE =
    process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
  const HOME_ENV = path.join(HOME_BASE, '.beeper-mcp-server.env');
  // Load home-scoped env first if present, then cwd as override
  try {
    if (process.env.BEEPERMCP_HOME && HOME_ENV)
      dotenv.config({ path: HOME_ENV });
  } catch {}
  dotenv.config({ path: '.beeper-mcp-server.env' });
  const schema = z.object({
    MATRIX_CACHE_DIR: z.string().optional(),
    MESSAGE_LOG_DIR: z.string().optional(),
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
  const cacheDir = env.MATRIX_CACHE_DIR || path.join(HOME_BASE, 'mx-cache');
  const logDir = env.MESSAGE_LOG_DIR || path.join(HOME_BASE, 'room-logs');
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
    enableSendMessage: envFlag('ENABLE_SEND_MESSAGE'),
    logDbPath: env.LOG_DB_PATH ?? path.join(logDir, 'messages.db'),
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
export type Provider = 'local' | 'remote';
export interface AnalyticsConfig {
  mcp: {
    transport: 'http-sse';
    baseUrl: string;
    rateLimits: { search: number; tools: number; send: number };
    featureFlags: {
      crossEncoder: boolean;
      llmSentimentRefinement: boolean;
      changePointDetection: boolean;
    };
    smoothingAlpha: number;
  };
  matrix: { homeserverUrl: string; accessToken: string; userId: string };
  embeddings: { modelVer: string; provider: Provider; dim: number };
  sentiment: {
    modelVer: string;
    provider: 'classifier' | 'llm';
    clamp: [number, number];
    subjectivityClamp: [number, number];
    lowConfidenceThreshold: number;
  };
  timezone: { defaultTz: string };
  db: {
    url: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
    pool: {
      max: number;
      idleTimeoutMillis?: number;
      connectionTimeoutMillis?: number;
    };
  };
}

export const config: AnalyticsConfig = {
  mcp: {
    transport: 'http-sse',
    baseUrl: process.env.MCP_BASE_URL ?? 'http://127.0.0.1:8757',
    rateLimits: {
      search: Number(process.env.RL_SEARCH ?? 20),
      tools: Number(process.env.RL_TOOLS ?? 10),
      send: Number(process.env.RL_SEND ?? 3),
    },
    featureFlags: {
      crossEncoder: process.env.FEAT_CROSS_ENCODER === '1',
      llmSentimentRefinement: process.env.FEAT_LLM_SENTIMENT === '1',
      changePointDetection: process.env.FEAT_CHANGE_POINT === '1',
    },
    smoothingAlpha: Number(process.env.SMOOTHING_ALPHA ?? 0.3),
  },
  matrix: {
    homeserverUrl: process.env.MATRIX_HS ?? 'https://matrix-client.matrix.org',
    accessToken: process.env.MATRIX_ACCESS_TOKEN ?? '',
    userId: process.env.MATRIX_USER_ID ?? '',
  },
  embeddings: {
    modelVer: process.env.EMB_MODEL_VER ?? 'e5-small-v1',
    provider: (process.env.EMB_PROVIDER as Provider) ?? 'local',
    dim: Number(process.env.EMB_DIM ?? 384),
  },
  sentiment: {
    modelVer: process.env.SENT_MODEL_VER ?? 'fasttext-v1',
    provider:
      (process.env.SENT_PROVIDER as 'classifier' | 'llm') ?? 'classifier',
    clamp: [-1, 1],
    subjectivityClamp: [0, 1],
    lowConfidenceThreshold: Number(process.env.SENT_LOW_CONF ?? 0.35),
  },
  timezone: {
    defaultTz: process.env.DEFAULT_TZ ?? 'Europe/Amsterdam',
  },
  db: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost/mcp',
    ssl: process.env.PGSSL ? { rejectUnauthorized: false } : undefined,
    pool: { max: Number(process.env.PGPOOL_MAX ?? 10) },
  },
};
