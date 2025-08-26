'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.capabilities = capabilities;
const tools_js_1 = require('./schemas/tools.js');
const config_js_1 = require('../config.js');
function capabilities() {
  return {
    resources: [
      'im://matrix/room/{roomId}/history',
      'im://matrix/room/{roomId}/message/{eventId}/context',
      'im://matrix/media/{eventId}/{transcript|ocr|caption}',
      'im://matrix/index/status',
    ],
    tools: Object.entries(tools_js_1.toolsSchemas).map(([id, schema]) => ({
      id,
      inputSchema: schema,
    })),
    sampling: true,
    elicitation: true,
    utilities: ['progress', 'cancel'],
    overview: {
      rateLimits: config_js_1.config.mcp.rateLimits,
      featureFlags: config_js_1.config.mcp.featureFlags,
    },
  };
}
