'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.runDigest = runDigest;
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
function isTimestamp(s) {
  return /\d{4}-\d{2}-\d{2}T\d{2}:.+Z/.test(s);
}
function parseLine(line) {
  // Expect lines like: [2025-08-23T...Z] <@user:hs> text
  const m = line.match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
  if (!m) return null;
  return { ts: m[1], sender: m[2], text: m[3] };
}
function makeSpark(values, width = 24) {
  const blocks = '▁▂▃▄▅▆▇█';
  const n = Math.min(width, values.length);
  if (n === 0) return '';
  const slice = values.slice(-n);
  const max = Math.max(1, ...slice);
  return slice
    .map(
      (v) =>
        blocks[
          Math.max(
            0,
            Math.min(
              blocks.length - 1,
              Math.floor((v / max) * (blocks.length - 1)),
            ),
          )
        ],
    )
    .join('');
}
function topN(arr, n = 5) {
  const m = new Map();
  for (const k of arr) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
// Removed unused guessQuestions helper to satisfy lint
async function runDigest(opts = {}, askLLM) {
  const stealth = new stealth_mode_js_1.StealthMode();
  const lookbackH = Math.max(1, opts.hours ?? 24);
  const limitPerRoom = Math.max(50, opts.limitPerRoom ?? 300);
  const sinceIso = new Date(Date.now() - lookbackH * 3600000).toISOString();
  const dbFile = sqlitePath();
  if (!fs_1.default.existsSync(dbFile)) {
    throw new Error(
      `No SQLite log DB found at ${dbFile}. Run the server first.`,
    );
  }
  const db = (0, utils_js_1.openLogDb)(dbFile);
  const rooms = opts.rooms && opts.rooms.length ? opts.rooms : detectRooms(db);
  const perRoom = {};
  for (const roomId of rooms) {
    const lines =
      (0, utils_js_1.queryLogs)(
        db,
        roomId,
        limitPerRoom,
        sinceIso,
        undefined,
        undefined,
      ) || [];
    perRoom[roomId] = lines.reverse();
    await stealth.maintainUnreadStatus(roomId);
  }
  // Aggregate statistics and key snippets
  let total = 0;
  const byUser = {};
  const activity = new Array(24).fill(0);
  const quotes = [];
  const questions = [];
  for (const roomId of rooms) {
    for (const ln of perRoom[roomId]) {
      const p = parseLine(ln);
      if (!p || !isTimestamp(p.ts)) continue;
      total++;
      byUser[p.sender] = (byUser[p.sender] || 0) + 1;
      const hour = new Date(p.ts).getHours();
      activity[hour]++;
      if (p.text.length > 8 && p.text.length < 160)
        quotes.push(`[${roomId}] ${p.sender}: ${p.text}`);
      if (/\?$/.test(p.text))
        questions.push(`[${roomId}] ${p.sender}: ${p.text}`);
    }
  }
  const topUsers = topN(Object.keys(byUser), 5)
    .map(([u, c]) => `${u} (${c})`)
    .join(', ');
  const activitySpark = makeSpark(activity, 24);
  const qSample = questions.slice(0, 6).join('\n');
  const prompt = `You are writing a concise daily digest of chat activity.
TIME WINDOW: last ${lookbackH}h.
SHOW:
- Top topics (3 bullets)
- Key quotes (3 bullets)
- Action items (up to 5, imperative)
- Risks/blockers (1-3 short bullets)
KEEP it within 1600 characters. Be specific, no filler.

CONTEXT (participants & signals):
- Top participants: ${topUsers}
- Activity by hour (0..23): ${activitySpark}
- Sample questions:\n${qSample}
`;
  const summary = await askLLM(prompt);
  const out = `# Daily Digest (last ${lookbackH}h)\n\nRooms: ${rooms.join(', ')}\nMessages: ${total}\nTop users: ${topUsers}\nActivity: ${activitySpark}\n\n${summary}\n`;
  const outDir = path_1.default.join(homeBase(), 'digests');
  fs_1.default.mkdirSync(outDir, { recursive: true });
  const file = path_1.default.join(
    outDir,
    `${new Date().toISOString().slice(0, 10)}.md`,
  );
  fs_1.default.writeFileSync(file, out, { mode: 0o600 });
  return { file, preview: out.slice(0, 4000) };
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
