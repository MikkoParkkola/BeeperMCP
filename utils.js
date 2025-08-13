import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import readline from 'readline';
import crypto from 'crypto';
import Database from 'better-sqlite3';

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function safeFilename(s = '') {
  return s.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function getRoomDir(base, roomId) {
  const d = path.join(base, safeFilename(roomId));
  ensureDir(d);
  return d;
}

export const pipelineAsync = promisify(pipeline);

export function envFlag(name, def = false) {
  const val = process.env[name];
  if (val === undefined) return def;
  const v = val.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return def;
}

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(data, secret) {
  const iv = crypto.randomBytes(16);
  const key = keyFromSecret(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(data, secret, asBuffer = false) {
  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(16, 32);
  const enc = buf.subarray(32);
  const key = keyFromSecret(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return asBuffer ? dec : dec.toString('utf8');
}

export async function encryptFileStream(src, dest, secret) {
  const iv = crypto.randomBytes(16);
  const key = keyFromSecret(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  ensureDir(path.dirname(dest));
  const out = fs.createWriteStream(dest, { mode: 0o600 });
  out.write(iv);
  await pipelineAsync(src, cipher, out);
  const tag = cipher.getAuthTag();
  await fs.promises.appendFile(dest, tag);
  await fs.promises.chmod(dest, 0o600).catch(() => {});
}

export async function decryptFile(file, secret) {
  const buf = await fs.promises.readFile(file);
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(16, buf.length - 16);
  const key = keyFromSecret(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export async function tailFile(file, limit, secret) {
  const lines = [];
  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(file, 'utf8'),
    });
    for await (const line of rl) {
      let out = line;
      if (secret) {
        try {
          out = decrypt(line, secret).replace(/\n$/, '');
        } catch {
          /* ignore: skip lines that fail to decrypt */
          continue;
        }
      }
      lines.push(out);
      if (lines.length > limit) lines.shift();
    }
  } catch {
    /* ignore: return collected lines on read errors */
  }
  return lines;
}

export async function appendWithRotate(file, line, maxBytes, secret) {
  try {
    ensureDir(path.dirname(file));
    const payload = secret ? encrypt(line, secret) + '\n' : line + '\n';
    const size = await fs.promises
      .stat(file)
      .then((s) => s.size)
      .catch(() => 0);
    if (size + Buffer.byteLength(payload) > maxBytes) {
      try {
        await fs.promises.rename(file, `${file}.1`);
      } catch {
        /* ignore: rotation best-effort */
      }
    }
    await fs.promises.appendFile(file, payload, { mode: 0o600 });
    await fs.promises.chmod(file, 0o600).catch(() => {});
  } catch {
    /* ignore: log append failure */
  }
}

export function openLogDb(file) {
  ensureDir(path.dirname(file));
  const db = new Database(file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
  // enable WAL for concurrent readers and set less strict sync for speed
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(
    'CREATE TABLE IF NOT EXISTS logs (room_id TEXT, ts TEXT, line TEXT, event_id TEXT);\n' +
      'CREATE INDEX IF NOT EXISTS idx_logs_room_ts ON logs(room_id, ts);\n' +
      'CREATE INDEX IF NOT EXISTS idx_logs_event ON logs(event_id);\n' +
      'CREATE TABLE IF NOT EXISTS media (event_id TEXT PRIMARY KEY, room_id TEXT, ts TEXT, file TEXT, type TEXT, size INTEGER);\n' +
      'CREATE INDEX IF NOT EXISTS idx_media_room_ts ON media(room_id, ts);\n' +
      'CREATE INDEX IF NOT EXISTS idx_media_type_size ON media(type, size)',
  );
  return db;
}

export function createLogWriter(db, secret, flushMs = 1000, maxEntries = 100) {
  const buffer = [];
  const flush = () => {
    if (buffer.length) insertLogs(db, buffer.splice(0, buffer.length), secret);
  };
  setInterval(flush, flushMs).unref();
  return {
    queue(roomId, ts, line, eventId) {
      buffer.push({ roomId, ts, line, eventId });
      if (buffer.length >= maxEntries) flush();
    },
    flush,
  };
}

export function insertLogs(db, entries, secret) {
  const stmt = db.prepare(
    'INSERT INTO logs (room_id, ts, line, event_id) VALUES (?, ?, ?, ?)',
  );
  const run = db.transaction((items) => {
    for (const { roomId, ts, line, eventId } of items) {
      const payload = secret ? encrypt(line, secret) : line;
      stmt.run(roomId, ts, payload, eventId);
    }
  });
  run(entries);
}

export function insertLog(db, roomId, ts, line, secret, eventId) {
  insertLogs(db, [{ roomId, ts, line, eventId }], secret);
}

export function queryLogs(db, roomId, limit, since, until, secret) {
  let sql = 'SELECT line FROM logs WHERE room_id = ?';
  const params = [roomId];
  if (since) {
    sql += ' AND ts >= ?';
    params.push(since);
  }
  if (until) {
    sql += ' AND ts <= ?';
    params.push(until);
  }
  sql += ' ORDER BY ts DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  const rows = db.prepare(sql).all(...params);
  return rows
    .map((r) => {
      let line = r.line;
      if (secret) {
        try {
          line = decrypt(line, secret);
        } catch {
          return null;
        }
      }
      return line;
    })
    .filter(Boolean)
    .reverse();
}

export function insertMedia(db, { eventId, roomId, ts, file, type, size }) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO media (event_id, room_id, ts, file, type, size) VALUES (?, ?, ?, ?, ?, ?)',
  );
  stmt.run(eventId, roomId, ts, file, type ?? null, size ?? null);
}

export function queryMedia(db, roomId, limit) {
  let sql =
    'SELECT event_id as eventId, ts, file, type, size FROM media WHERE room_id = ?';
  const params = [roomId];
  sql += ' ORDER BY ts DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  const rows = db.prepare(sql).all(...params);
  return rows.reverse();
}

export function createMediaDownloader(db, queueLog, secret, concurrency = 2) {
  const pending = [];
  let active = 0;
  const next = () => {
    while (active < concurrency && pending.length) {
      const item = pending.shift();
      active++;
      (async () => {
        const { url, dest, roomId, eventId, ts, sender, type, size } = item;
        let line;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('bad status');
          const ctype = type || res.headers.get('content-type');
          const clen = size || Number(res.headers.get('content-length') || 0);
          if (secret) await encryptFileStream(res.body, dest, secret);
          else await pipelineAsync(res.body, fs.createWriteStream(dest));
          insertMedia(db, {
            eventId,
            roomId,
            ts,
            file: path.basename(dest),
            type: ctype,
            size: clen,
          });
          line = `[${ts}] <${sender}> [media] ${path.basename(dest)}`;
        } catch {
          line = `[${ts}] <${sender}> [media download failed]`;
        }
        queueLog(roomId, ts, line, eventId);
      })().finally(() => {
        active--;
        next();
      });
    }
  };
  return {
    queue(item) {
      const { eventId, roomId, ts, sender, type, size } = item;
      let existing = db
        .prepare('SELECT file FROM media WHERE event_id = ?')
        .get(eventId);
      if (!existing && type && size != null) {
        existing = db
          .prepare('SELECT file FROM media WHERE type = ? AND size = ? LIMIT 1')
          .get(type, size);
        if (existing) {
          insertMedia(db, {
            eventId,
            roomId,
            ts,
            file: existing.file,
            type,
            size,
          });
        }
      }
      if (existing) {
        const line = `[${ts}] <${sender}> [media cached] ${existing.file}`;
        queueLog(roomId, ts, line, eventId);
        return;
      }
      pending.push(item);
      next();
    },
    flush() {
      return new Promise((resolve) => {
        const check = () => {
          if (pending.length === 0 && active === 0) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    },
  };
}

export function pushWithLimit(arr, val, limit) {
  arr.push(val);
  if (arr.length > limit) arr.shift();
  return arr;
}

export class BoundedMap extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }
  set(key, val) {
    if (!this.has(key) && this.size >= this.limit) {
      const first = this.keys().next().value;
      if (first !== undefined) this.delete(first);
    }
    return super.set(key, val);
  }
}

export class FileSessionStore {
  constructor(file, secret, flushMs = 100) {
    this.file = file;
    this.secret = secret;
    this.flushMs = flushMs;
    ensureDir(path.dirname(file));
    try {
      let raw = fs.readFileSync(this.file, 'utf8');
      if (this.secret) raw = decrypt(raw, this.secret);
      this.#data = JSON.parse(raw);
    } catch {
      this.#data = {};
    }
  }
  #data;
  #writePromise = null;
  #timer = null;
  #persistNow() {
    const write = (this.#writePromise ?? Promise.resolve()).then(async () => {
      let out = JSON.stringify(this.#data);
      if (this.secret) out = encrypt(out, this.secret);
      await fs.promises.writeFile(this.file, out, { mode: 0o600 });
      await fs.promises.chmod(this.file, 0o600).catch(() => {});
    });
    this.#writePromise = write.finally(() => {
      if (this.#writePromise === write) this.#writePromise = null;
    });
  }
  #persist() {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#persistNow();
    }, this.flushMs).unref();
  }
  get length() {
    return Object.keys(this.#data).length;
  }
  clear() {
    this.#data = {};
    this.#persist();
  }
  key(index) {
    return Object.keys(this.#data)[index] ?? null;
  }
  getItem(key) {
    return this.#data[key] ?? null;
  }
  setItem(key, val) {
    this.#data[key] = val;
    this.#persist();
  }
  removeItem(key) {
    delete this.#data[key];
    this.#persist();
  }
  flush() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#persistNow();
    }
    return this.#writePromise ?? Promise.resolve();
  }
}
