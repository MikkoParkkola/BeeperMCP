import fs from 'fs';
import os from 'os';
import path from 'path';
import { openLogDb, queryLogs } from '../../../utils.js';
import { StealthMode } from '../../core/stealth-mode.js';

interface QAOpts {
  rooms?: string[];
  limitPerRoom?: number;
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function sqlitePath(): string {
  const logDir =
    process.env.MESSAGE_LOG_DIR || path.join(homeBase(), 'room-logs');
  return path.join(logDir, 'messages.db');
}

export async function askQA(
  question: string,
  opts: QAOpts = {},
  askLLM: (prompt: string) => Promise<string>,
) {
  const stealth = new StealthMode();
  // Try SQLite fallback over recent messages if Postgres not configured
  const dbFile = sqlitePath();
  let contexts: { room: string; lines: string[] }[] = [];
  if (fs.existsSync(dbFile)) {
    const db = openLogDb(dbFile);
    const rooms =
      opts.rooms && opts.rooms.length ? opts.rooms : detectRooms(db);
    const limit = Math.max(50, opts.limitPerRoom ?? 200);
    for (const r of rooms) {
      const lines = (
        queryLogs(db, r, limit, undefined, undefined, undefined) || []
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
