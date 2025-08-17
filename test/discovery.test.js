import test from 'node:test';
import assert from 'node:assert/strict';
import { initMcpServer } from '../dist/src/mcp.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const API_KEY = 'sekret';

test('well-known discovery and capability handshake', async () => {
  const client = { getRooms: () => [] };
  const { mcpServer, httpServer } = await initMcpServer(
    client,
    null,
    false,
    API_KEY,
    undefined,
    0,
  );
  const port = httpServer.address().port;

  const res = await fetch(`http://localhost:${port}/.well-known/mcp.json`);
  const meta = await res.json();
  assert.equal(meta.transport, 'streamable-http');
  assert.equal(meta.version, version);

  const resp = await fetch(`http://localhost:${port}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'test', version: '1.0.0' },
        capabilities: {},
      },
    }),
  });
  const data = await resp.json();
  assert.equal(data.result.serverInfo.version, version);
  assert.ok(data.result.capabilities.resources.listChanged);

  await mcpServer.close();
  await new Promise((resolve) => httpServer.close(resolve));
});
