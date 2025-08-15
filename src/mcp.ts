import http from 'http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from '../mcp-tools.js';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  registerResources,
  listResources,
  handleResource,
} from './mcp/resources.js';

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
    enableJsonResponse: true,
  });
  await srv.connect(transport);
  // Register MCP Resources (list/read) with API key enforcement
  registerResources(logDb, logSecret);
  (srv.server as any)._requestHandlers.set(
    'resources/list',
    (_req: any, extra: any) => {
      if (extra?._meta?.apiKey !== apiKey) throw new Error('Invalid API key');
      const resources = listResources().map((uri) => ({ uri }));
      return { resources };
    },
  );
  (srv.server as any)._requestHandlers.set(
    'resources/read',
    async (req: any, extra: any) => {
      if (extra?._meta?.apiKey !== apiKey) throw new Error('Invalid API key');
      const uri: string | undefined =
        (req && (req.uri || req.resource?.uri || req.params?.uri)) || undefined;
      if (!uri || typeof uri !== 'string') throw new Error('Missing uri');
      const [base, qs = ''] = uri.split('?');
      const query = new URLSearchParams(qs);
      const data = await handleResource(base, query);
      return { contents: [{ type: 'json', json: data }] };
    },
  );

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/mcp.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ transport: 'streamable-http' }));
    } else {
      void transport.handleRequest(req, res);
    }
  });
  await new Promise<void>((resolve) =>
    httpServer.listen(port, () => resolve()),
  );
  return { mcpServer: srv, httpServer };
}
