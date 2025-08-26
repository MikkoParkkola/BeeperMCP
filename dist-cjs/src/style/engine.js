'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.loadStyle = loadStyle;
exports.saveStyle = saveStyle;
exports.learnPersonalTone = learnPersonalTone;
exports.getPersonalHints = getPersonalHints;
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const utils_js_1 = require('../../utils.js');
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function stylePath() {
  return path_1.default.join(homeBase(), 'style.json');
}
function loadStyle() {
  try {
    const raw = fs_1.default.readFileSync(stylePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveStyle(map) {
  fs_1.default.mkdirSync(homeBase(), { recursive: true });
  fs_1.default.writeFileSync(stylePath(), JSON.stringify(map, null, 2), {
    mode: 0o600,
  });
}
const EN_SW = new Set([
  'the',
  'and',
  'is',
  'are',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'it',
  'this',
]);
const FI_SW = new Set([
  'ja',
  'on',
  'olen',
  'olla',
  'se',
  'ne',
  'että',
  'kun',
  'tai',
  'mutta',
  'kanssa',
  'joka',
]);
function detectLang(text) {
  const t = text.toLowerCase();
  let en = 0,
    fi = 0;
  for (const w of t.split(/\W+/)) {
    if (EN_SW.has(w)) en++;
    if (FI_SW.has(w)) fi++;
  }
  if (en === 0 && fi === 0) return undefined;
  return en >= fi ? 'en' : 'fi';
}
function isEmoji(ch) {
  // simple heuristic: common emoji ranges
  const code = ch.codePointAt(0) || 0;
  return (
    (code >= 0x1f300 && code <= 0x1f6ff) || // Misc symbols and pictographs
    (code >= 0x1f900 && code <= 0x1f9ff) || // Supplemental symbols
    (code >= 0x2600 && code <= 0x27bf) // Misc symbols
  );
}
function collectGreeting(line) {
  const m = line.match(/^(hi|hey|hello|moi|hei|morning|evening|yo)[,!\s]/i);
  return m ? m[1].toLowerCase() : undefined;
}
function collectSignoff(line) {
  const m = line.match(/^(regards|best|cheers|t\.|yours)/i);
  return m ? m[1].toLowerCase() : undefined;
}
function learnPersonalTone(aliases, opts = {}) {
  const sinceDays = Math.max(1, opts.sinceDays ?? 60);
  const perPersonMax = Math.max(50, opts.perPersonMax ?? 500);
  const dbFile = path_1.default.join(
    process.env.MESSAGE_LOG_DIR || path_1.default.join(homeBase(), 'room-logs'),
    'messages.db',
  );
  if (!fs_1.default.existsSync(dbFile)) return {};
  const db = (0, utils_js_1.openLogDb)(dbFile);
  const since = new Date(Date.now() - sinceDays * 24 * 3600000).toISOString();
  const rooms = db
    .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
    .all()
    .map((r) => r.room_id);
  const map = loadStyle();
  const ensure = (id) =>
    map[id] ||
    (map[id] = {
      personId: id,
      language: undefined,
      formality: 0.5,
      emojiRate: 0,
      exclaimRate: 0,
      greetings: [],
      signoffs: [],
      phrases: [],
      samples: 0,
      updatedAt: new Date().toISOString(),
    });
  const counts = {};
  const greetSet = {};
  const signSet = {};
  const langScore = {};
  for (const roomId of rooms) {
    const rows = db
      .prepare(
        'SELECT ts, line FROM logs WHERE room_id = ? AND ts >= ? ORDER BY ts ASC',
      )
      .all(roomId, since);
    const parsed = rows
      .map((r) => {
        const m = String(r.line || '').match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
        return m ? { ts: m[1], sender: m[2], text: m[3] } : null;
      })
      .filter(Boolean);
    if (!parsed.length) continue;
    // precompute other participants for 1:1 detection
    const participants = Array.from(new Set(parsed.map((p) => p.sender)));
    const isOneToOne =
      participants.length === 2 &&
      aliases.some((a) => participants.includes(a));
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      if (!aliases.some((a) => p.sender.includes(a))) continue; // only user's own lines
      // Determine peer: in 1:1 rooms, the other participant; otherwise last non-user sender
      let peer = participants.find((x) => !aliases.some((a) => x.includes(a)));
      if (!isOneToOne) {
        for (let j = i - 1; j >= 0; j--) {
          const prev = parsed[j];
          if (!aliases.some((a) => prev.sender.includes(a))) {
            peer = prev.sender;
            break;
          }
        }
      }
      if (!peer) continue;
      const prof = ensure(peer);
      prof.samples = (prof.samples || 0) + 1;
      prof.updatedAt = new Date().toISOString();
      // Language detection
      const lang = detectLang(p.text || '');
      if (lang) {
        const ls = langScore[peer] || (langScore[peer] = { en: 0, fi: 0 });
        ls[lang]++;
        prof.language = ls.en >= ls.fi ? 'en' : 'fi';
      }
      // Emoji / exclaim counts
      const t = String(p.text || '');
      const c =
        counts[peer] || (counts[peer] = { chars: 0, emojis: 0, exclaims: 0 });
      c.chars += t.length;
      c.exclaims += (t.match(/!/g) || []).length;
      for (const ch of t) if (isEmoji(ch)) c.emojis++;
      prof.emojiRate = (100 * c.emojis) / Math.max(1, c.chars);
      prof.exclaimRate = (100 * c.exclaims) / Math.max(1, c.chars);
      // Greetings/signoffs
      const lines = t.split(/\n+/);
      const g = collectGreeting(lines[0]);
      if (g) (greetSet[peer] || (greetSet[peer] = new Set())).add(g);
      const sline = lines[lines.length - 1].trim();
      const s = collectSignoff(sline);
      if (s) (signSet[peer] || (signSet[peer] = new Set())).add(s);
      prof.greetings = Array.from(greetSet[peer] || []);
      prof.signoffs = Array.from(signSet[peer] || []);
      // Formality: crude heuristic — higher exclaimRate/emojiRate => casual => lower formality
      const casual =
        (prof.emojiRate || 0) * 0.6 + (prof.exclaimRate || 0) * 0.4;
      prof.formality = Math.max(0, Math.min(1, 1 - casual / 5));
      if (prof.samples >= perPersonMax) continue;
    }
  }
  saveStyle(map);
  return map;
}
function getPersonalHints(personId) {
  const map = loadStyle();
  return map[personId];
}
