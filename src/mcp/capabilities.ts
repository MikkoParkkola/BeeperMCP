import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from './schemas/tools.js';
import { config } from '../config.js';

export interface Capabilities {
  resources: string[];
  tools: { id: string; inputSchema: JSONSchema7 }[];
  sampling: boolean;
  elicitation: boolean;
  utilities: string[];
  overview: {
    rateLimits: typeof config.mcp.rateLimits;
    featureFlags: typeof config.mcp.featureFlags;
  };
}

export function capabilities(): Capabilities {
  return {
    resources: [
      'im://matrix/room/{roomId}/history',
      'im://matrix/room/{roomId}/message/{eventId}/context',
      'im://matrix/media/{eventId}/{transcript|ocr|caption}',
      'im://matrix/index/status',
    ],
    tools: Object.entries(toolsSchemas).map(([id, schema]) => ({
      id,
      inputSchema: schema as JSONSchema7,
    })),
    sampling: true,
    elicitation: true,
    utilities: ['progress', 'cancel'],
    overview: {
      rateLimits: config.mcp.rateLimits,
      featureFlags: config.mcp.featureFlags,
    },
  };
}
