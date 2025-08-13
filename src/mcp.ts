import http from 'http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from '../mcp-tools.js';
import type { MatrixClient } from 'matrix-js-sdk';

export async function initMcpServer(
  client: MatrixClient,
  logDb: any,
  enableSend: boolean,
  apiKey: string,
  logSecret: string | undefined,
  port = 3000,
) {
  const srv = buildMcpServer(client, logDb, enableSend, apiKey, logSecret);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await srv.connect(transport);
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/mcp.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ transport: 'streamable-http' }));
    } else {
      void transport.handleRequest(req, res);
    }
  });
  await new Promise((resolve) => httpServer.listen(port, resolve));
  return { mcpServer: srv, httpServer };
}
