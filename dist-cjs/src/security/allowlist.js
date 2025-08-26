'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.isAllowed = isAllowed;
const allowlist = new Set([
  'search',
  'who_said',
  'recap',
  'extract_open_loops',
  'response_time_stats',
  'stats_activity',
  'sentiment_trends',
  'sentiment_distribution',
  'draft_reply',
  'send_message',
  'fetch',
]);
function isAllowed(toolName) {
  return allowlist.has(toolName);
}
