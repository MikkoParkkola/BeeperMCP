#!/usr/bin/env node
'use strict';
/**
 * Entrypoint for the Beeper MCP server.
 *
 * You've added several core source files (client, event-logger, reembed, draftReply,
 * recap, responseTime). To build, run and test the project end-to-end you'll typically
 * also want to ensure the following supporting files are present in the repository:
 *
 * - package.json
 * - tsconfig.json
 * - src/config.ts                // configuration loading & typed config
 * - utils.js                     // many runtime helpers used by server & tests
 * - mcp-tools.js                 // MCP server wiring helpers (buildMcpServer)
 * - src/mcp/resources.ts         // MCP resource handlers (history, context, index/status)
 * - src/index/search.ts          // search implementation used by tools
 * - src/index/reembed.ts         // re-embedding worker (you already added)
 * - Postgres messages schema     // CREATE TABLE messages ... required by tools using PG
 *
 * Common MCP tools & analytics helpers you may want to add or refine:
 * - src/mcp/tools/whoSaid.ts
 * - src/mcp/tools/activity.ts
 * - src/mcp/tools/sentimentTrends.ts
 * - src/mcp/tools/sentimentDistribution.ts
 * - src/mcp/tools/sendMessage.ts
 * - src/ingest/matrix.ts         // full /sync ingest pipeline to populate messages table
 *
 * Tests in this project expect built output under `dist/`. After adding missing
 * files run `npm ci && npm run build` before `npm test`.
 */
Object.defineProperty(exports, '__esModule', { value: true });
const server_js_1 = require('./src/server.js');
(0, server_js_1.startServer)();
