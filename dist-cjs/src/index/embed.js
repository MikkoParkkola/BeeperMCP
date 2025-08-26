'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.hashEmbed = hashEmbed;
exports.embedLiteral = embedLiteral;
const node_crypto_1 = __importDefault(require('node:crypto'));
const config_js_1 = require('../config.js');
// Lightweight deterministic embedding via feature hashing
function hashEmbed(text, dim = config_js_1.config.embeddings.dim) {
  const arr = new Array(dim).fill(0);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    const h = node_crypto_1.default.createHash('md5').update(t).digest();
    const idx = h[0] % dim;
    arr[idx] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
  return arr.map((v) => v / norm);
}
function embedLiteral(vec) {
  // pgvector accepts '[v1,v2,...]'
  return `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
}
