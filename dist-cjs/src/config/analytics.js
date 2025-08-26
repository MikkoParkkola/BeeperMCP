'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.config = void 0;
exports.config = {
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
    provider: process.env.EMB_PROVIDER ?? 'local',
    dim: Number(process.env.EMB_DIM ?? 384),
  },
  sentiment: {
    modelVer: process.env.SENT_MODEL_VER ?? 'fasttext-v1',
    provider: process.env.SENT_PROVIDER ?? 'classifier',
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
