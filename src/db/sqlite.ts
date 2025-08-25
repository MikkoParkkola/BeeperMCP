type Database = any;
import {
  openLogDb,
  queryLogs,
  createLogWriter,
  createMediaWriter,
  createMediaDownloader,
} from '../../utils.js';

export interface SqliteSecrets {
  logSecret?: string;
  mediaSecret?: string;
}

export interface HistoryOpts {
  limit?: number;
  from?: string;
  to?: string;
}

export interface ContextOpts {
  before?: number; // items before anchor
  after?: number; // items after anchor
}

export class DatabaseManager {
  readonly db: Database;
  readonly logSecret?: string;
  readonly mediaSecret?: string;
  readonly logWriter: ReturnType<typeof createLogWriter>;
  readonly mediaWriter: ReturnType<typeof createMediaWriter>;
  readonly mediaDownloader: ReturnType<typeof createMediaDownloader>;

  constructor(filePath: string, secrets: SqliteSecrets = {}) {
    this.db = openLogDb(filePath) as unknown as Database;
    this.logSecret = secrets.logSecret;
    this.mediaSecret = secrets.mediaSecret;
    this.mediaWriter = createMediaWriter(this.db);
    this.logWriter = createLogWriter(this.db, this.logSecret);
    this.mediaDownloader = createMediaDownloader(
      this.db,
      this.mediaWriter.queue,
      this.logWriter.queue,
      this.mediaSecret,
    );
  }

  history(roomId: string, opts: HistoryOpts = {}) {
    const { limit = 100, from, to } = opts;
    return queryLogs(this.db, roomId, limit, from, to, this.logSecret);
  }

  context(roomId: string, eventId: string, opts: ContextOpts = {}) {
    const before = Math.max(0, opts.before ?? 5);
    const after = Math.max(0, opts.after ?? 5);
    const row = (this.db as any)
      .prepare('SELECT ts FROM logs WHERE event_id = ? LIMIT 1')
      .get(eventId);
    const anchor: string | undefined = row?.ts;
    if (!anchor) return [] as string[];
    let since: string | undefined;
    let until: string | undefined;
    if (before > 0) {
      const br = (this.db as any)
        .prepare(
          'SELECT ts FROM logs WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1 OFFSET ?',
        )
        .get(roomId, anchor, before - 1);
      since = br?.ts;
    } else since = anchor;
    if (after > 0) {
      const ar = (this.db as any)
        .prepare(
          'SELECT ts FROM logs WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT 1 OFFSET ?',
        )
        .get(roomId, anchor, after - 1);
      until = ar?.ts;
    } else until = anchor;
    return queryLogs(
      this.db,
      roomId,
      before + after + 1,
      since,
      until,
      this.logSecret,
    );
  }

  mediaByEventId(eventId: string) {
    const row = (this.db as any)
      .prepare(
        'SELECT event_id as eventId, room_id as roomId, ts, file, type, size, hash FROM media WHERE event_id = ?',
      )
      .get(eventId);
    return row ?? null;
  }

  async flush() {
    await this.mediaDownloader.flush();
    await this.mediaWriter.flush();
    await this.logWriter.flush();
  }
}
