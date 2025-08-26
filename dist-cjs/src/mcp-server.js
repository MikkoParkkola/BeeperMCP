'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createMcpServer = createMcpServer;
exports.startStdioServer = startStdioServer;
exports.startHttpServer = startHttpServer;
const stdio_js_1 = require('@modelcontextprotocol/sdk/server/stdio.js');
const streamableHttp_js_1 = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const node_crypto_1 = require('node:crypto');
const http_1 = __importDefault(require('http'));
const fs_1 = __importDefault(require('fs'));
const path_1 = __importDefault(require('path'));
const mcp_tools_js_1 = require('../mcp-tools.js');
const resources_js_1 = require('./mcp/resources.js');
const mcp_compat_js_1 = require('./mcp-compat.js');
const version =
  process.env.npm_package_version || process.env.BEEPER_MCP_VERSION || 'dev';
async function createMcpServer(client, logDb, enableSend, apiKey, logSecret) {
  // Use default API key for local mode if none provided
  const effectiveApiKey = (0, mcp_compat_js_1.isStdioMode)()
    ? undefined
    : apiKey;
  if (!effectiveApiKey && !(0, mcp_compat_js_1.isStdioMode)()) {
    throw new Error('MCP_API_KEY is required for HTTP mode');
  }
  // Build server and ensure resources are registered (history/context/media)
  const srv = (0, mcp_tools_js_1.buildMcpServer)(
    client,
    logDb,
    enableSend,
    effectiveApiKey,
    logSecret,
  );
  // Register MCP resources handlers with current DB/secret
  (0, resources_js_1.registerResources)(logDb, logSecret);
  return srv;
}
async function startStdioServer(client, logDb, enableSend = true, logSecret) {
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
  server.connect = async (transport) => {
    // Add version negotiation hook
    if (transport.onMessage) {
      const originalOnMessage = transport.onMessage.bind(transport);
      transport.onMessage = (message) => {
        if (
          message.method === 'initialize' &&
          message.params?.protocolVersion
        ) {
          const clientVersion = message.params.protocolVersion;
          const serverVersion = '2025-03-26'; // Our current version
          const negotiated = (0, mcp_compat_js_1.negotiateVersion)(
            clientVersion,
            serverVersion,
          );
          console.error(
            `Protocol negotiation: client=${clientVersion}, server=${serverVersion}, using=${negotiated.version}`,
          );
        }
        return originalOnMessage(message);
      };
    }
    return originalConnect(transport);
  };
  const transport = new stdio_js_1.StdioServerTransport();
  await server.connect(transport);
  console.error('BeeperMCP server ready and listening on STDIO');
  return server;
}
async function startHttpServer(
  client,
  logDb,
  enableSend,
  apiKey,
  logSecret,
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
  const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
    sessionIdGenerator: () => (0, node_crypto_1.randomUUID)(),
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const webRoot = path_1.default.join(process.cwd(), 'web');
  function serveStaticUI(req, res) {
    if (!req.url) return false;
    if (!req.url.startsWith('/ui')) return false;
    // Normalize path under /web
    let rel = req.url.replace(/^\/ui\/?/, '');
    if (!rel || rel === '') rel = 'index.html';
    const filePath = path_1.default.join(webRoot, rel);
    if (!filePath.startsWith(webRoot)) {
      // path traversal guard
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }
    try {
      const stat = fs_1.default.statSync(filePath);
      if (!stat.isFile()) throw new Error('Not file');
      const ext = path_1.default.extname(filePath).toLowerCase();
      const types = {
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
      fs_1.default.createReadStream(filePath).pipe(res);
      return true;
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return true;
    }
  }
  const httpServer = http_1.default.createServer((req, res) => {
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
  await new Promise((resolve) =>
    httpServer.listen(port, () => {
      console.error(`BeeperMCP HTTP server listening on port ${port}`);
      resolve();
    }),
  );
  return { mcpServer: server, httpServer };
}
