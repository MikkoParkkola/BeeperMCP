import fs from 'fs';
import os from 'os';
import path from 'path';
import { openLogDb } from '../../utils.js';

export interface PersonalProfile {
  personId: string; // typically a Matrix userId like @alice:server
  language?: string; // 'en', 'fi', etc.
  formality?: number; // 0..1 (0 casual, 1 formal)
  emojiRate?: number; // emojis per 100 chars
  exclaimRate?: number; // exclamation per 100 chars
  greetings?: string[];
  signoffs?: string[];
  phrases?: string[];
  samples?: number; // number of lines analyzed
  updatedAt: string;
}

interface LearnOpts {
  sinceDays?: number; // default 60
  perPersonMax?: number; // default 500 messages
}

function homeBase() {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function stylePath() {
  return path.join(homeBase(), 'style.json');
}

export function loadStyle(): Record<string, PersonalProfile> {
  try {
    const raw = fs.readFileSync(stylePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveStyle(map: Record<string, PersonalProfile>) {
  fs.mkdirSync(homeBase(), { recursive: true });
  fs.writeFileSync(stylePath(), JSON.stringify(map, null, 2), { mode: 0o600 });
}

const EN_SW = new Set(['the', 'and', 'is', 'are', 'to', 'for', 'of', 'in', 'on', 'with', 'it', 'this']);
const FI_SW = new Set(['ja', 'on', 'olen', 'olla', 'se', 'ne', 'että', 'kun', 'tai', 'mutta', 'kanssa', 'joka']);

function detectLang(text: string): string | undefined {
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

function isEmoji(ch: string) {
  // simple heuristic: common emoji ranges
  const code = ch.codePointAt(0) || 0;
  return (
    (code >= 0x1f300 && code <= 0x1f6ff) || // Misc symbols and pictographs
    (code >= 0x1f900 && code <= 0x1f9ff) || // Supplemental symbols
    (code >= 0x2600 && code <= 0x27bf) // Misc symbols
  );
}

function collectGreeting(line: string) {
  const m = line.match(/^(hi|hey|hello|moi|hei|morning|evening|yo)[,!\s]/i);
  return m ? m[1].toLowerCase() : undefined;
}

function collectSignoff(line: string) {
  const m = line.match(/^(regards|best|cheers|t\.|yours)/i);
  return m ? m[1].toLowerCase() : undefined;
}

export function learnPersonalTone(
  aliases: string[],
  opts: LearnOpts = {},
): Record<string, PersonalProfile> {
  const sinceDays = Math.max(1, opts.sinceDays ?? 60);
  const perPersonMax = Math.max(50, opts.perPersonMax ?? 500);
  const dbFile = path.join(
    process.env.MESSAGE_LOG_DIR || path.join(homeBase(), 'room-logs'),
    'messages.db',
  );
  if (!fs.existsSync(dbFile)) return {};
  const db = openLogDb(dbFile);
  const since = new Date(Date.now() - sinceDays * 24 * 3600_000).toISOString();
  const rooms = db
    .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
    .all()
    .map((r: any) => r.room_id);
  const map: Record<string, PersonalProfile> = loadStyle();
  const ensure = (id: string): PersonalProfile =>
    (map[id] ||= {
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
  const counts: Record<string, { chars: number; emojis: number; exclaims: number }> = {};
  const greetSet: Record<string, Set<string>> = {};
  const signSet: Record<string, Set<string>> = {};
  const langScore: Record<string, { en: number; fi: number }> = {};

  for (const roomId of rooms) {
    const rows = db
      .prepare('SELECT ts, line FROM logs WHERE room_id = ? AND ts >= ? ORDER BY ts ASC')
      .all(roomId, since);
    const parsed = rows
      .map((r: any) => {
        const m = String(r.line || '').match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
        return m ? { ts: m[1], sender: m[2], text: m[3] } : null;
      })
      .filter(Boolean) as any[];
    if (!parsed.length) continue;
    // precompute other participants for 1:1 detection
    const participants = Array.from(new Set(parsed.map((p) => p.sender)));
    const isOneToOne = participants.length === 2 && aliases.some((a) => participants.includes(a));
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
        const ls = (langScore[peer] ||= { en: 0, fi: 0 });
        (ls as any)[lang]++;
        prof.language = (ls.en >= ls.fi ? 'en' : 'fi') as any;
      }
      // Emoji / exclaim counts
      const t = String(p.text || '');
      const c = (counts[peer] ||= { chars: 0, emojis: 0, exclaims: 0 });
      c.chars += t.length;
      c.exclaims += (t.match(/!/g) || []).length;
      for (const ch of t) if (isEmoji(ch)) c.emojis++;
      prof.emojiRate = (100 * c.emojis) / Math.max(1, c.chars);
      prof.exclaimRate = (100 * c.exclaims) / Math.max(1, c.chars);
      // Greetings/signoffs
      const lines = t.split(/\n+/);
      const g = collectGreeting(lines[0]);
      if (g) (greetSet[peer] ||= new Set()).add(g);
      const sline = lines[lines.length - 1].trim();
      const s = collectSignoff(sline);
      if (s) (signSet[peer] ||= new Set()).add(s);
      prof.greetings = Array.from(greetSet[peer] || []);
      prof.signoffs = Array.from(signSet[peer] || []);
      // Formality: crude heuristic — higher exclaimRate/emojiRate => casual => lower formality
      const casual = (prof.emojiRate || 0) * 0.6 + (prof.exclaimRate || 0) * 0.4;
      prof.formality = Math.max(0, Math.min(1, 1 - casual / 5));
      if (prof.samples >= perPersonMax) continue;
    }
  }
  saveStyle(map);
  return map;
}

export function getPersonalHints(personId: string): PersonalProfile | undefined {
  const map = loadStyle();
  return map[personId];
}

