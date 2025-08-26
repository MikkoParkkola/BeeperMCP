'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.findActionables = findActionables;
exports.generateDrafts = generateDrafts;
exports.ensureRoomBrief = ensureRoomBrief;
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const utils_js_1 = require('../../../utils.js');
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
function briefsPath() {
  return path_1.default.join(homeBase(), 'room-briefs.json');
}
function loadBriefs() {
  try {
    const p = briefsPath();
    const raw = fs_1.default.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveBriefs(map) {
  const p = briefsPath();
  fs_1.default.mkdirSync(path_1.default.dirname(p), { recursive: true });
  fs_1.default.writeFileSync(p, JSON.stringify(map, null, 2), { mode: 0o600 });
}
function parseLine(line) {
  const m = line.match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
  if (!m) return null;
  return { ts: m[1], sender: m[2], text: m[3] };
}
function looksActionable(text, aliases) {
  const t = text.toLowerCase();
  if (/[?]$/.test(t)) return true;
  const cues = [
    'can you',
    'could you',
    'please',
    'wdyt',
    'what do you think',
    'eta',
    'need your',
    'any update',
  ];
  if (cues.some((c) => t.includes(c))) return true;
  if (aliases.some((a) => a && text.includes(a))) return true;
  return false;
}
function findActionables(prefs, opts = {}) {
  const hours = Math.max(1, opts.hours ?? 24);
  const perRoomLimit = Math.max(50, opts.perRoomLimit ?? 200);
  const ctxWin = Math.max(1, opts.contextWindow ?? 3);
  const dbFile = sqlitePath();
  if (!fs_1.default.existsSync(dbFile)) return [];
  const db = (0, utils_js_1.openLogDb)(dbFile);
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const rooms = detectRooms(db);
  const out = [];
  for (const roomId of rooms) {
    const lines =
      (0, utils_js_1.queryLogs)(
        db,
        roomId,
        perRoomLimit,
        since,
        undefined,
        undefined,
      ) || [];
    const parsed = lines.map(parseLine).filter(Boolean);
    for (let i = parsed.length - 1; i >= 0; i--) {
      const p = parsed[i];
      if (!p) continue;
      // skip if already by the user
      if (prefs.userAliases.some((a) => a && p.sender.includes(a))) continue;
      if (!looksActionable(p.text, prefs.userAliases)) continue;
      // if user replied after this line in same room, skip
      const replied = parsed
        .slice(i + 1)
        .some((q) => prefs.userAliases.some((a) => a && q.sender.includes(a)));
      if (replied) continue;
      const ctxStart = Math.max(0, i - ctxWin);
      const ctxEnd = Math.min(parsed.length, i + 1 + ctxWin);
      const ctx = parsed
        .slice(ctxStart, ctxEnd)
        .map((x) => `[${x.ts}] <${x.sender}> ${x.text}`);
      out.push({
        roomId,
        ts: p.ts,
        sender: p.sender,
        text: p.text,
        context: ctx,
      });
      break; // one actionable per room is enough for triage
    }
  }
  return out;
}
async function generateDrafts(
  candidate,
  prefs,
  intention,
  extraInstructions,
  askLLM,
) {
  const brief = await ensureRoomBrief(candidate.roomId, askLLM);
  const lang =
    prefs.language || brief.language || 'the same language as the context';
  const sys = `Write two alternative replies in ${lang} with a ${prefs.tone || 'friendly'} tone.
Keep each under 80 words. Use a relaxed, friendly voice. Light emojis are OK if it fits (optional). Be specific and helpful.
Audience & style hints (from prior conversations):
- ${(brief.styleHints || []).join('\n- ')}
- ${(brief.audienceNotes || []).join('\n- ')}
`;
  const prompt = `${sys}
Intention: ${intention}
Constraints/Extras: ${extraInstructions || 'none'}
Context (recent lines around the message):
${candidate.context.join('\n')}

Return as:
1) <reply>
2) <reply>
`;
  const out = await askLLM(prompt);
  return out;
}
async function ensureRoomBrief(roomId, askLLM) {
  const cache = loadBriefs();
  const cached = cache[roomId];
  const staleMs = 3 * 24 * 3600000; // refresh every ~3 days
  if (cached && Date.now() - Date.parse(cached.updatedAt) < staleMs) {
    return cached;
  }
  // Build brief from extended context (last 7 days; capped lines)
  const dbFile = sqlitePath();
  let lines = [];
  if (fs_1.default.existsSync(dbFile)) {
    const db = (0, utils_js_1.openLogDb)(dbFile);
    const since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
    // Pull more lines to analyze tone/language
    lines =
      (0, utils_js_1.queryLogs)(
        db,
        roomId,
        1500,
        since,
        undefined,
        undefined,
      ) || [];
    // Downsample to keep prompt tight
    if (lines.length > 400) {
      const step = Math.ceil(lines.length / 400);
      lines = lines.filter((_, i) => i % step === 0);
    }
  }
  const briefPrompt = `You will create a BRIEF profile for a chat room based on recent messages.
OUTPUT EXACTLY this format (no extra text):
LANG: <2-letter code or language name>
STYLE:
- <bullet about tone/emoji/formality/sign-offs>
- <bullet>
AUDIENCE:
- <bullet about roles/expectations>
- <bullet>
SENSITIVITIES:
- <bullet topics to avoid if any>
- <bullet>

MESSAGES SAMPLE (recent):
${lines.slice(-400).join('\n')}
`;
  const raw = await askLLM(briefPrompt);
  const brief = {
    roomId,
    updatedAt: new Date().toISOString(),
  };
  try {
    const langMatch = raw.match(/LANG:\s*(.+)/i);
    brief.language = langMatch ? langMatch[1].trim() : undefined;
    // Split bullets by sections heuristically
    const sec = (name) =>
      raw.split(new RegExp(`\n${name}:\n`, 'i'))[1]?.split(/\n[A-Z]+:/)[0] ||
      '';
    brief.styleHints = Array.from(sec('STYLE').matchAll(/^-\s+(.+)$/gim)).map(
      (m) => m[1].trim(),
    );
    brief.audienceNotes = Array.from(
      sec('AUDIENCE').matchAll(/^-\s+(.+)$/gim),
    ).map((m) => m[1].trim());
    brief.sensitivities = Array.from(
      sec('SENSITIVITIES').matchAll(/^-\s+(.+)$/gim),
    ).map((m) => m[1].trim());
  } catch {}
  cache[roomId] = brief;
  saveBriefs(cache);
  return brief;
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
