import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { buildMcpServer } from '../mcp-tools.js';
import { registerResources } from './mcp/resources.js';
import { negotiateVersion, isStdioMode } from './mcp-compat.js';
import type { MatrixClient } from 'matrix-js-sdk';

const version =
  process.env.npm_package_version || process.env.BEEPER_MCP_VERSION || 'dev';

export async function createMcpServer(
  client: MatrixClient,
  logDb: any,
  enableSend: boolean,
  apiKey?: string,
  logSecret?: string,
) {
  // Use default API key for local mode if none provided
  const effectiveApiKey = isStdioMode() ? undefined : apiKey;

  if (!effectiveApiKey && !isStdioMode()) {
    throw new Error('MCP_API_KEY is required for HTTP mode');
  }

  // Build server and ensure resources are registered (history/context/media)
  const srv = buildMcpServer(
    client,
    logDb,
    enableSend,
    effectiveApiKey,
    logSecret,
  );
  // Register MCP resources handlers with current DB/secret
  registerResources(logDb, logSecret);
  return srv;
}

export async function startStdioServer(
  client: MatrixClient,
  logDb: any,
  enableSend: boolean = true,
  logSecret?: string,
) {
  console.error('Starting BeeperMCP server in STDIO mode...');

  const server = await createMcpServer(
    client,
    logDb,
    enableSend,
    'local-stdio-mode',
    logSecret,
  );

  // Handle protocol version negotiation
  const originalConnect = server.connect.bind(server);
  server.connect = async (transport: any) => {
    // Add version negotiation hook
    if (transport.onMessage) {
      const originalOnMessage = transport.onMessage.bind(transport);
      transport.onMessage = (message: any) => {
        if (
          message.method === 'initialize' &&
          message.params?.protocolVersion
        ) {
          const clientVersion = message.params.protocolVersion;
          const serverVersion = '2025-03-26'; // Our current version
          const negotiated = negotiateVersion(clientVersion, serverVersion);
          console.error(
            `Protocol negotiation: client=${clientVersion}, server=${serverVersion}, using=${negotiated.version}`,
          );
        }
        return originalOnMessage(message);
      };
    }

    return originalConnect(transport);
  };

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('BeeperMCP server ready and listening on STDIO');
  return server;
}

export async function startHttpServer(
  client: MatrixClient,
  logDb: any,
  enableSend: boolean,
  apiKey: string,
  logSecret?: string,
  port = 3000,
) {
  const server = await createMcpServer(
    client,
    logDb,
    enableSend,
    apiKey,
    logSecret,
  );

  // Register capabilities based on negotiated version
  server.server.registerCapabilities({
    resources: { listChanged: true },
    tools: {},
    prompts: {},
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const webRoot = path.join(process.cwd(), 'web');

  function serveStaticUI(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!req.url) return false;
    if (!req.url.startsWith('/ui')) return false;

    // Normalize path under /web
    let rel = req.url.replace(/^\/ui\/?/, '');
    if (!rel || rel === '') rel = 'index.html';
    const filePath = path.join(webRoot, rel);
    if (!filePath.startsWith(webRoot)) {
      // path traversal guard
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) throw new Error('Not file');
      const ext = path.extname(filePath).toLowerCase();
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
      };
      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
      });
      fs.createReadStream(filePath).pipe(res);
      return true;
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return true;
    }
  }

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/mcp.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: 'Beeper',
          version,
          transport: 'streamable-http',
          protocolVersions: ['2024-11-05', '2025-03-26', '2025-06-18'],
          defaultProtocolVersion: '2024-11-05', // Most compatible default
        }),
      );
    } else if (req.method === 'GET' && (req.url === '/' || req.url === '/ui')) {
      // Redirect root and bare /ui to UI index
      res.writeHead(302, { Location: '/ui/index.html' });
      res.end();
    } else if (serveStaticUI(req, res)) {
      // Handled
    } else {
      void transport.handleRequest(req, res);
    }
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(port, () => {
      console.error(`BeeperMCP HTTP server listening on port ${port}`);
      resolve();
    }),
  );

  return { mcpServer: server, httpServer };
}
