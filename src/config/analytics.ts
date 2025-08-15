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
