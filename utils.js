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
  }
  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }
  getItem(key) {
    return this.read()[key] ?? null;
  }
  setItem(key, val) {
    const data = this.read();
    data[key] = val;
    fs.writeFileSync(this.file, JSON.stringify(data));
  }
  removeItem(key) {
    const data = this.read();
    delete data[key];
    fs.writeFileSync(this.file, JSON.stringify(data));
  }
}
