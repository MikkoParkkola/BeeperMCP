import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import readline from 'readline';
import crypto from 'crypto';

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text, secret) {
  const iv = crypto.randomBytes(16);
  const key = keyFromSecret(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(data, secret) {
  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(16, 32);
  const enc = buf.subarray(32);
  const key = keyFromSecret(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export async function tailFile(file, limit, secret) {
  const lines = [];
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8') });
    for await (const line of rl) {
      let out = line;
      if (secret) {
        try { out = decrypt(line, secret).replace(/\n$/, ''); } catch { continue; }
      }
      lines.push(out);
      if (lines.length > limit) lines.shift();
    }
  } catch {}
  return lines;
}

export async function appendWithRotate(file, line, maxBytes, secret) {
  try {
    ensureDir(path.dirname(file));
    const payload = secret ? encrypt(line, secret) + '\n' : line + '\n';
    const size = await fs.promises.stat(file).then(s => s.size).catch(() => 0);
    if (size + Buffer.byteLength(payload) > maxBytes) {
      try { await fs.promises.rename(file, `${file}.1`); } catch {}
    }
    await fs.promises.appendFile(file, payload);
  } catch {}
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
  constructor(file, secret) {
    this.file = file;
    this.secret = secret;
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
  #persist() {
    const write = (this.#writePromise ?? Promise.resolve()).then(async () => {
      let out = JSON.stringify(this.#data);
      if (this.secret) out = encrypt(out, this.secret);
      await fs.promises.writeFile(this.file, out);
    });
    this.#writePromise = write.finally(() => {
      if (this.#writePromise === write) this.#writePromise = null;
    });
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
    return this.#writePromise ?? Promise.resolve();
  }
}
