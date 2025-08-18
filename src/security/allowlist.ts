const allowlist = new Set<string>([
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

export function isAllowed(toolName: string): boolean {
  return allowlist.has(toolName);
}
