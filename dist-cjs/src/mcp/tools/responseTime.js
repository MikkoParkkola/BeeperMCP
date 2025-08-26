'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.handler = handler;
const tools_js_1 = require('../schemas/tools.js');
exports.id = 'response_time_stats';
exports.inputSchema = tools_js_1.toolsSchemas.response_time_stats;
async function handler() {
  return { avg: null, median: null, p95: null, histogram: [] };
}
