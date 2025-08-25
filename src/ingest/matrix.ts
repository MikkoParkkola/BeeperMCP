import { Pool } from 'pg';
import { config } from '../config.js';
import { computeBasicStats } from '../event-doc.js';
import { getEffectiveTz, toLocalKeys } from '../time/tz.js';
import { NormalizedEventSchema } from './schemas.js';
import path from 'path';
import os from 'os';
import { createLogWriter, createMediaWriter, openLogDb } from '../../utils.js';

let pool: Pool | null = null;
function getPool() {
  if (!pool)
    pool = new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl as any,
      max: config.db.pool.max,
    });
  return pool;
}

// Optional SQLite logging (resources) — initialized on first use
let logDb: any | null = null;
let logWriter: ReturnType<typeof createLogWriter> | null = null;
let mediaWriter: ReturnType<typeof createMediaWriter> | null = null;
function ensureSqlite() {
  if (logDb) return;
  try {
    const HOME_BASE =
      process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
    const logDir =
      process.env.MESSAGE_LOG_DIR || path.join(HOME_BASE, 'room-logs');
    const dbPath = process.env.LOG_DB_PATH || path.join(logDir, 'messages.db');
    logDb = openLogDb(dbPath);
    logWriter = createLogWriter(logDb, process.env.LOG_SECRET);
    mediaWriter = createMediaWriter(logDb);
  } catch {
    logDb = null;
    logWriter = null;
    mediaWriter = null;
  }
}

function parseAttachments(ev: any): {
  has_media: boolean;
  media_types: string[];
  attachments: number;
} {
  const types: string[] = [];
  const msgtype = ev.content?.msgtype;
  const url = ev.content?.url || ev.content?.file?.url;
  const mime = ev.content?.info?.mimetype;
  if (url) {
    switch (msgtype) {
      case 'm.image':
      case 'm.sticker':
        types.push('image');
        break;
      case 'm.video':
        types.push('video');
        break;
      case 'm.audio':
        types.push('audio');
        break;
      case 'm.file':
        types.push('file');
        break;
      default:
        if (typeof mime === 'string') {
          if (mime.startsWith('image/')) types.push('image');
          else if (mime.startsWith('video/')) types.push('video');
          else if (mime.startsWith('audio/')) types.push('audio');
          else types.push('file');
        } else {
          types.push('file');
        }
    }
  }
  return {
    has_media: types.length > 0,
    media_types: types,
    attachments: types.length,
  };
}

async function persistEvent(ev: any, roomId: string) {
  const { has_media, media_types, attachments } = parseAttachments(ev);
  const text = typeof ev.content?.body === 'string' ? ev.content.body : null;
  const tsUtc = new Date(ev.origin_server_ts);
  const tokens = text ? text.trim().split(/\s+/).length : 0;
  const stats = computeBasicStats(text ?? '', attachments);
  const normalized = NormalizedEventSchema.parse({
    event_id: ev.event_id,
    room_id: roomId,
    sender: ev.sender,
    text,
    ts_utc: tsUtc,
    lang: ev.content?.['m.language'],
    participants: [ev.sender],
    is_me: ev.sender === config.matrix.userId,
    thread_id:
      ev.content?.['m.relates_to']?.['event_id'] ||
      ev.content?.['m.relates_to']?.['m.in_reply_to']?.['event_id'],
    has_media,
    media_types,
    tokens,
    words: stats.words,
    chars: stats.chars,
    attachments: stats.attachments,
  });
  const tz = await getEffectiveTz(normalized.ts_utc);
  const tzKeys = toLocalKeys(normalized.ts_utc, tz);
  const p = getPool();
  await p.query(
    `INSERT INTO messages (event_id, room_id, sender, text, ts_utc, lang, participants, is_me, thread_id, has_media, media_types, tz_day, tz_week, tz_month, tz_year, tz_hour, tz_dow, tokens, words, chars, attachments, tsv)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,to_tsvector('simple', COALESCE($4,'')))
     ON CONFLICT (event_id) DO NOTHING`,
    [
      normalized.event_id,
      normalized.room_id,
      normalized.sender,
      normalized.text,
      normalized.ts_utc.toISOString(),
      normalized.lang ?? null,
      normalized.participants,
      normalized.is_me,
      normalized.thread_id ?? null,
      normalized.has_media,
      normalized.media_types,
      tzKeys.tz_day,
      tzKeys.tz_week,
      tzKeys.tz_month,
      tzKeys.tz_year,
      tzKeys.tz_hour,
      tzKeys.tz_dow,
      normalized.tokens ?? null,
      normalized.words ?? null,
      normalized.chars ?? null,
      normalized.attachments ?? null,
    ],
  );

  // Also persist minimal line + media metadata into SQLite logs/media for resources
  try {
    ensureSqlite();
    if (logWriter) {
      const ts = normalized.ts_utc.toISOString();
      const line = normalized.text ?? (normalized.has_media ? '[media]' : '');
      logWriter.queue(normalized.room_id, ts, line, normalized.event_id);
    }
    if (mediaWriter && normalized.has_media) {
      const ts = normalized.ts_utc.toISOString();
      // Store minimal media metadata (no file path yet)
      mediaWriter.queue({
        eventId: normalized.event_id,
        roomId: normalized.room_id,
        ts,
        file: '',
        type: (ev.content?.info?.mimetype as string) || undefined,
        size: (ev.content?.info?.size as number) || undefined,
        hash: undefined,
      });
    }
  } catch {}
}

export async function startMatrixIngestLoop(): Promise<void> {
  if (!config.matrix.accessToken) return;
  let since: string | undefined;
  while (true) {
    const url = new URL(
      `${config.matrix.homeserverUrl}/_matrix/client/v3/sync`,
    );
    url.searchParams.set('timeout', '30000');
    if (since) url.searchParams.set('since', since);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.matrix.accessToken}` },
    });
    if (!res.ok) {
      console.error('Matrix sync failed', res.status, res.statusText);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const data = await res.json();
    since = data.next_batch;
    const rooms = data.rooms?.join ?? {};
    for (const [roomId, roomData] of Object.entries<any>(rooms)) {
      const events = roomData.timeline?.events ?? [];
      for (const ev of events) {
        if (ev.type !== 'm.room.message') continue;
        try {
          await persistEvent(ev, roomId);
        } catch (err) {
          console.error('ingest error', err);
        }
      }
    }
  }
}
