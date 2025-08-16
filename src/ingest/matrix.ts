import { Pool } from 'pg';
import { config } from '../config.js';
import { computeBasicStats } from '../event-doc.js';
import { getEffectiveTz, toLocalKeys } from '../time/tz.js';
import { NormalizedEventSchema } from './schemas.js';

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

function parseAttachments(ev: any): {
  has_media: boolean;
  media_types: string[];
  attachments: number;
} {
  const types: string[] = [];
  const msgtype = ev.content?.msgtype;
  const url = ev.content?.url || ev.content?.file?.url;
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
        types.push('file');
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
