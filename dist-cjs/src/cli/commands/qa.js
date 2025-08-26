'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.askQA = askQA;
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const utils_js_1 = require('../../../utils.js');
const stealth_mode_js_1 = require('../../core/stealth-mode.js');
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function sqlitePath() {
  const logDir =
    process.env.MESSAGE_LOG_DIR || path_1.default.join(homeBase(), 'room-logs');
  return path_1.default.join(logDir, 'messages.db');
}
async function askQA(question, opts = {}, askLLM) {
  const stealth = new stealth_mode_js_1.StealthMode();
  // Try SQLite fallback over recent messages if Postgres not configured
  const dbFile = sqlitePath();
  let contexts = [];
  if (fs_1.default.existsSync(dbFile)) {
    const db = (0, utils_js_1.openLogDb)(dbFile);
    const rooms =
      opts.rooms && opts.rooms.length ? opts.rooms : detectRooms(db);
    const limit = Math.max(50, opts.limitPerRoom ?? 200);
    for (const r of rooms) {
      const lines = (
        (0, utils_js_1.queryLogs)(
          db,
          r,
          limit,
          undefined,
          undefined,
          undefined,
        ) || []
      ).reverse();
      // Simple keyword prefilter
      const kw = question
        .replace(/\W+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const hits = lines.filter((ln) =>
        kw.some((w) => ln.toLowerCase().includes(w.toLowerCase())),
      );
      if (hits.length) contexts.push({ room: r, lines: hits.slice(0, 10) });
      await stealth.maintainUnreadStatus(r);
    }
  }
  const ctx = contexts
    .slice(0, 3)
    .map((c) => `Room ${c.room}:\n${c.lines.join('\n')}`)
    .join('\n\n');
  const prompt = `Answer the question using ONLY the context. If unknown, say "not found in recent history".
Question: ${question}
Context:\n${ctx}
`;
  const answer = await askLLM(prompt);
  return { answer, contextPreview: ctx };
}
function detectRooms(db) {
  try {
    const rows = db
      .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
      .all();
    return rows.map((r) => r.room_id);
  } catch {
    return [];
  }
}
