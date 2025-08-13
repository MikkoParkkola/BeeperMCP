import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from '../mcp-tools.js';

const API_KEY = 'sekret';

test('Streamable HTTP transport initialization', async () => {
  const client = { getRooms: () => [] };
  const srv = buildMcpServer(client, null, false, API_KEY, undefined);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => 'sess',
    enableJsonResponse: true,
  });
  await srv.connect(transport);
  const server = http.createServer((req, res) => {
    transport.handleRequest(req, res);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
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
  assert.equal(data.result.serverInfo.name, 'Beeper');
  assert.ok(data.result.capabilities.tools.listChanged);
  await srv.close();
  await new Promise((resolve) => server.close(resolve));
});
