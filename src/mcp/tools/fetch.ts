import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';
import { config } from '../../config.js';

export const id = 'fetch';
export const inputSchema = toolsSchemas.fetch as JSONSchema7;

function resolveUrl(raw: string): string {
  if (raw.startsWith('mxc://')) {
    const m = raw.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!m) throw new Error('invalid mxc url');
    const base = config.matrix.homeserverUrl.replace(/\/$/, '');
    const u = new URL(`/_matrix/media/v3/download/${m[1]}/${m[2]}`, base);
    if (config.matrix.accessToken) {
      u.searchParams.set('access_token', config.matrix.accessToken);
    }
    return u.toString();
  }
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('unsupported scheme');
  }
  return u.toString();
}

export async function handler(input: any) {
  const maxBytes = input.maxBytes ?? 1_000_000;
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
  const chunks: Uint8Array[] = [];
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
  const out: any = {
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
