import fs from 'fs';
import os from 'os';
import path from 'path';
import { openLogDb, queryLogs } from '../../../utils.js';
import { StealthMode } from '../../core/stealth-mode.js';

export interface DigestOpts {
  rooms?: string[];
  hours?: number; // lookback window, default 24h
  limitPerRoom?: number; // cap messages per room, default 300
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function sqlitePath(): string {
  const logDir =
    process.env.MESSAGE_LOG_DIR || path.join(homeBase(), 'room-logs');
  return path.join(logDir, 'messages.db');
}

function isTimestamp(s: string): boolean {
  return /\d{4}-\d{2}-\d{2}T\d{2}:.+Z/.test(s);
}

function parseLine(line: string) {
  // Expect lines like: [2025-08-23T...Z] <@user:hs> text
  const m = line.match(/^\[(.+?)\]\s+<([^>]+)>\s+(.*)$/);
  if (!m) return null as any;
  return { ts: m[1], sender: m[2], text: m[3] };
}

function makeSpark(values: number[], width = 24): string {
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

function topN<K extends string>(arr: K[], n = 5) {
  const m = new Map<K, number>();
  for (const k of arr) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Removed unused guessQuestions helper to satisfy lint

export async function runDigest(
  opts: DigestOpts = {},
  askLLM: (prompt: string) => Promise<string>,
) {
  const stealth = new StealthMode();
  const lookbackH = Math.max(1, opts.hours ?? 24);
  const limitPerRoom = Math.max(50, opts.limitPerRoom ?? 300);
  const sinceIso = new Date(Date.now() - lookbackH * 3600_000).toISOString();
  const dbFile = sqlitePath();
  if (!fs.existsSync(dbFile)) {
    throw new Error(
      `No SQLite log DB found at ${dbFile}. Run the server first.`,
    );
  }
  const db = openLogDb(dbFile);
  const rooms = opts.rooms && opts.rooms.length ? opts.rooms : detectRooms(db);
  const perRoom: Record<string, string[]> = {};
  for (const roomId of rooms) {
    const lines =
      queryLogs(db, roomId, limitPerRoom, sinceIso, undefined, undefined) || [];
    perRoom[roomId] = lines.reverse();
    await stealth.maintainUnreadStatus(roomId);
  }
  // Aggregate statistics and key snippets
  let total = 0;
  const byUser: Record<string, number> = {};
  const activity: number[] = new Array(24).fill(0);
  const quotes: string[] = [];
  const questions: string[] = [];
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
  const topUsers = topN(Object.keys(byUser) as any, 5)
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
  const outDir = path.join(homeBase(), 'digests');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(file, out, { mode: 0o600 });
  return { file, preview: out.slice(0, 4000) };
}

function detectRooms(db: any): string[] {
  try {
    const rows = db
      .prepare('SELECT DISTINCT room_id FROM logs ORDER BY room_id')
      .all();
    return rows.map((r: any) => r.room_id);
  } catch {
    return [];
  }
}
