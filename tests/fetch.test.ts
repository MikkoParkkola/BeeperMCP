import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { handler as fetchHandler } from '../src/mcp/tools/fetch.js';
import { config } from '../src/config.js';

function createServer(
  fn: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const srv = http.createServer(fn);
    srv.listen(0, () => {
      const addr = srv.address();
      const url = `http://127.0.0.1:${(addr as any).port}`;
      resolve({ url, close: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

test('fetches HTTP JSON', async () => {
  const { url, close } = await createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  const res = await fetchHandler({ url });
  assert.equal(res.status, 200);
  assert.equal(res.contentType, 'application/json');
  assert.deepEqual(res.data, { ok: true });
  await close();
});

test('rejects non-http scheme', async () => {
  await assert.rejects(() => fetchHandler({ url: 'file:///etc/passwd' }));
});

test('enforces maxBytes', async () => {
  const { url, close } = await createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.end('a'.repeat(20));
  });
  await assert.rejects(() => fetchHandler({ url, maxBytes: 5 }));
  await close();
});

test('allows HEAD method', async () => {
  const { url, close } = await createServer((req, res) => {
    assert.equal(req.method, 'HEAD');
    res.statusCode = 200;
    res.end();
  });
  const res = await fetchHandler({ url, method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.bytes, 0);
  await close();
});

test('rejects disallowed methods', async () => {
  await assert.rejects(() =>
    fetchHandler({ url: 'http://example.com', method: 'POST' }),
  );
});

test('handles mxc URLs with access token', async () => {
  const { url, close } = await createServer((req, res) => {
    assert.ok(req.url?.includes('/_matrix/media/v3/download/m.server/id'));
    assert.ok(req.url?.includes('access_token=testtoken'));
    res.setHeader('Content-Type', 'text/plain');
    res.end('hi');
  });
  const oldHs = config.matrix.homeserverUrl;
  const oldToken = config.matrix.accessToken;
  config.matrix.homeserverUrl = url;
  config.matrix.accessToken = 'testtoken';
  const res = await fetchHandler({ url: 'mxc://m.server/id' });
  assert.equal(res.status, 200);
  assert.equal(res.body, 'hi');
  config.matrix.homeserverUrl = oldHs;
  config.matrix.accessToken = oldToken;
  await close();
});
