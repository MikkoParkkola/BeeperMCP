'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.DatabaseManager = void 0;
const utils_js_1 = require('../../utils.js');
class DatabaseManager {
  constructor(filePath, secrets = {}) {
    this.db = (0, utils_js_1.openLogDb)(filePath);
    this.logSecret = secrets.logSecret;
    this.mediaSecret = secrets.mediaSecret;
    this.mediaWriter = (0, utils_js_1.createMediaWriter)(this.db);
    this.logWriter = (0, utils_js_1.createLogWriter)(this.db, this.logSecret);
    this.mediaDownloader = (0, utils_js_1.createMediaDownloader)(
      this.db,
      this.mediaWriter.queue,
      this.logWriter.queue,
      this.mediaSecret,
    );
  }
  history(roomId, opts = {}) {
    const { limit = 100, from, to } = opts;
    return (0, utils_js_1.queryLogs)(
      this.db,
      roomId,
      limit,
      from,
      to,
      this.logSecret,
    );
  }
  context(roomId, eventId, opts = {}) {
    const before = Math.max(0, opts.before ?? 5);
    const after = Math.max(0, opts.after ?? 5);
    const row = this.db
      .prepare('SELECT ts FROM logs WHERE event_id = ? LIMIT 1')
      .get(eventId);
    const anchor = row?.ts;
    if (!anchor) return [];
    let since;
    let until;
    if (before > 0) {
      const br = this.db
        .prepare(
          'SELECT ts FROM logs WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT 1 OFFSET ?',
        )
        .get(roomId, anchor, before - 1);
      since = br?.ts;
    } else since = anchor;
    if (after > 0) {
      const ar = this.db
        .prepare(
          'SELECT ts FROM logs WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT 1 OFFSET ?',
        )
        .get(roomId, anchor, after - 1);
      until = ar?.ts;
    } else until = anchor;
    return (0, utils_js_1.queryLogs)(
      this.db,
      roomId,
      before + after + 1,
      since,
      until,
      this.logSecret,
    );
  }
  mediaByEventId(eventId) {
    const row = this.db
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
exports.DatabaseManager = DatabaseManager;
