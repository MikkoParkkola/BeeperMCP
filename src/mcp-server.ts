import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import http from 'http';
import { buildMcpServer } from '../mcp-tools.js';
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
  const effectiveApiKey =
    apiKey || (isStdioMode() ? 'local-stdio-mode' : undefined);

  if (!effectiveApiKey && !isStdioMode()) {
    throw new Error('MCP_API_KEY is required for HTTP mode');
  }

  return buildMcpServer(client, logDb, enableSend, effectiveApiKey!, logSecret);
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
