import crypto from 'node:crypto';
import { config } from '../config.js';

// Lightweight deterministic embedding via feature hashing
export function hashEmbed(text: string, dim = config.embeddings.dim): number[] {
  const arr = new Array<number>(dim).fill(0);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    const h = crypto.createHash('md5').update(t).digest();
    const idx = h[0] % dim;
    arr[idx] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
  return arr.map((v) => v / norm);
}

export function embedLiteral(vec: number[]): string {
  // pgvector accepts '[v1,v2,...]'
  return `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
}
