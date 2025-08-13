import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import readline from 'readline';

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

export async function tailFile(file, limit) {
  const lines = [];
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8') });
    for await (const line of rl) {
      lines.push(line);
      if (lines.length > limit) lines.shift();
    }
  } catch {}
  return lines;
}

export async function appendWithRotate(file, line, maxBytes) {
  try {
    ensureDir(path.dirname(file));
    const size = await fs.promises.stat(file).then(s => s.size).catch(() => 0);
    if (size + Buffer.byteLength(line) > maxBytes) {
      try {
        await fs.promises.rename(file, `${file}.1`);
      } catch {}
    }
    await fs.promises.appendFile(file, line);
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
  constructor(file) {
    this.file = file;
    ensureDir(path.dirname(file));
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.#data = JSON.parse(raw);
    } catch {
      this.#data = {};
    }
  }
  #data;
  #writePromise = null;
  #persist() {
    const write = (this.#writePromise ?? Promise.resolve()).then(() =>
      fs.promises.writeFile(this.file, JSON.stringify(this.#data))
    );
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
