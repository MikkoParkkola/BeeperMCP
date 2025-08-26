'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.handler = handler;
const tools_js_1 = require('../schemas/tools.js');
const config_js_1 = require('../../config.js');
exports.id = 'fetch';
exports.inputSchema = tools_js_1.toolsSchemas.fetch;
function resolveUrl(raw) {
  if (raw.startsWith('mxc://')) {
    const m = raw.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!m) throw new Error('invalid mxc url');
    const base = config_js_1.config.matrix.homeserverUrl.replace(/\/$/, '');
    const u = new URL(`/_matrix/media/v3/download/${m[1]}/${m[2]}`, base);
    if (config_js_1.config.matrix.accessToken) {
      u.searchParams.set('access_token', config_js_1.config.matrix.accessToken);
    }
    return u.toString();
  }
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('unsupported scheme');
  }
  return u.toString();
}
async function handler(input) {
  const maxBytes = input.maxBytes ?? 1000000;
  const url = resolveUrl(String(input.url));
  const method = String(input.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error('unsupported method');
  }
  const headers = input.headers || {};
  const res = await fetch(url, { method, headers });
  const len = Number(res.headers.get('content-length'));
  if (!Number.isNaN(len) && len > maxBytes) {
    throw new Error('maxBytes exceeded');
  }
  const contentType = res.headers.get('content-type') || '';
  const headersObj = Object.fromEntries(res.headers.entries());
  const chunks = [];
  let bytes = 0;
  const reader = res.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('maxBytes exceeded');
        chunks.push(value);
      }
    }
  }
  const buf = Buffer.concat(chunks);
  const ct = contentType.split(';')[0];
  const out = {
    status: res.status,
    statusText: res.statusText,
    headers: headersObj,
    contentType: ct,
    bytes,
  };
  if (ct === 'application/json') {
    out.data = JSON.parse(buf.toString('utf8'));
  } else if (ct.startsWith('text/')) {
    out.body = buf.toString('utf8');
  } else if (buf.length) {
    out.body = buf.toString('base64');
  }
  return out;
}
