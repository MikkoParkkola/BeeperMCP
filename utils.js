import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

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
