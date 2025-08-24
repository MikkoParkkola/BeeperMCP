import fs from 'fs';
import os from 'os';
import path from 'path';
import { openLogDb, queryLogs } from '../../../utils.js';
import { getPersonalHints } from '../../style/engine.js';

export interface TriageCandidate {
  roomId: string;
  ts: string;
  sender: string;
  text: string;
  context: string[]; // few lines around anchor
}

export interface TriagePrefs {
  userAliases: string[]; // e.g., ["@mikko:"]
  tone?: 'concise' | 'friendly' | 'formal';
  language?: string; // e.g., 'en', 'fi'
}

export interface TriageOpts {
  hours?: number;
  perRoomLimit?: number;
  contextWindow?: number;
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function sqlitePath(): string {
  const logDir = process.env.MESSAGE_LOG_DIR || path.join(homeBase(), 'room-logs');
  return path.join(logDir, 'messages.db');
}

interface RoomBrief {
  roomId: string;
  updatedAt: string; // ISO
  language?: string; // ISO code or label
  styleHints?: string[]; // bullets about tone, formality, emojis, signatures
  audienceNotes?: string[]; // roles or expectations
  sensitivities?: string[]; // topics to avoid
}

function briefsPath(): string {
  return path.join(homeBase(), 'room-briefs.json');
}

function loadBriefs(): Record<string, RoomBrief> {
  try {
    const p = briefsPath();
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveBriefs(map: Record<string, RoomBrief>) {
  const p = briefsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(map, null, 2), { mode: 0o600 });
}

function parseLine(line: string) {
  const m = line.match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
  if (!m) return null as any;
  return { ts: m[1], sender: m[2], text: m[3] };
}

function looksActionable(text: string, aliases: string[]): boolean {
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

export function findActionables(
  prefs: TriagePrefs,
  opts: TriageOpts = {},
): TriageCandidate[] {
  const hours = Math.max(1, opts.hours ?? 24);
  const perRoomLimit = Math.max(50, opts.perRoomLimit ?? 200);
  const ctxWin = Math.max(1, opts.contextWindow ?? 3);
  const dbFile = sqlitePath();
  if (!fs.existsSync(dbFile)) return [];
  const db = openLogDb(dbFile);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rooms = detectRooms(db);
  const out: TriageCandidate[] = [];
  for (const roomId of rooms) {
    const lines = queryLogs(db, roomId, perRoomLimit, since, undefined, undefined) || [];
    const parsed = lines.map(parseLine).filter(Boolean) as any[];
    for (let i = parsed.length - 1; i >= 0; i--) {
      const p = parsed[i];
      if (!p) continue;
      // skip if already by the user
      if (prefs.userAliases.some((a) => a && p.sender.includes(a))) continue;
      if (!looksActionable(p.text, prefs.userAliases)) continue;
      // if user replied after this line in same room, skip
      const replied = parsed.slice(i + 1).some((q) => prefs.userAliases.some((a) => a && q.sender.includes(a)));
      if (replied) continue;
      const ctxStart = Math.max(0, i - ctxWin);
      const ctxEnd = Math.min(parsed.length, i + 1 + ctxWin);
      const ctx = parsed.slice(ctxStart, ctxEnd).map((x) => `[${x.ts}] <${x.sender}> ${x.text}`);
      out.push({ roomId, ts: p.ts, sender: p.sender, text: p.text, context: ctx });
      break; // one actionable per room is enough for triage
    }
  }
  return out;
}

export async function generateDrafts(
  candidate: TriageCandidate,
  prefs: TriagePrefs,
  intention: string,
  extraInstructions: string,
  askLLM: (prompt: string) => Promise<string>,
) {
  const brief = await ensureRoomBrief(candidate.roomId, askLLM);
  const lang = prefs.language || brief.language || 'the same language as the context';
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

export async function ensureRoomBrief(
  roomId: string,
  askLLM: (prompt: string) => Promise<string>,
): Promise<RoomBrief> {
  const cache = loadBriefs();
  const cached = cache[roomId];
  const staleMs = 3 * 24 * 3600_000; // refresh every ~3 days
  if (cached && Date.now() - Date.parse(cached.updatedAt) < staleMs) {
    return cached;
  }
  // Build brief from extended context (last 7 days; capped lines)
  const dbFile = sqlitePath();
  let lines: string[] = [];
  if (fs.existsSync(dbFile)) {
    const db = openLogDb(dbFile);
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    // Pull more lines to analyze tone/language
    lines = queryLogs(db, roomId, 1500, since, undefined, undefined) || [];
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
  const brief: RoomBrief = { roomId, updatedAt: new Date().toISOString() } as any;
  try {
    const langMatch = raw.match(/LANG:\s*(.+)/i);
    brief.language = langMatch ? langMatch[1].trim() : undefined;
    const style = Array.from(raw.matchAll(/^\-\s+(.+)$/gim)).map((m) => m[1].trim());
    // Split bullets by sections heuristically
    const sec = (name: string) =>
      raw.split(new RegExp(`\n${name}:\n`, 'i'))[1]?.split(/\n[A-Z]+:/)[0] || '';
    brief.styleHints = Array.from(sec('STYLE').matchAll(/^\-\s+(.+)$/gim)).map(
      (m) => m[1].trim(),
    );
    brief.audienceNotes = Array.from(
      sec('AUDIENCE').matchAll(/^\-\s+(.+)$/gim),
    ).map((m) => m[1].trim());
    brief.sensitivities = Array.from(
      sec('SENSITIVITIES').matchAll(/^\-\s+(.+)$/gim),
    ).map((m) => m[1].trim());
  } catch {}
  cache[roomId] = brief;
  saveBriefs(cache);
  return brief;
}

function detectRooms(db: any): string[] {
  try {
    const rows = db.prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id').all();
    return rows.map((r: any) => r.room_id);
  } catch {
    return [];
  }
}
