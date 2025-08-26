'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.initMcpServer = initMcpServer;
const http_1 = __importDefault(require('http'));
const metrics_js_1 = require('./obs/metrics.js');
const node_crypto_1 = require('node:crypto');
const streamableHttp_js_1 = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const mcp_tools_js_1 = require('../mcp-tools.js');
const version =
  process.env.npm_package_version || process.env.BEEPER_MCP_VERSION || 'dev';
const resources_js_1 = require('./mcp/resources.js');
async function initMcpServer(
  client,
  logDb,
  enableSend,
  apiKey,
  logSecret,
  port = 3000,
) {
  const srv = (0, mcp_tools_js_1.buildMcpServer)(
    client,
    logDb,
    enableSend,
    apiKey,
    logSecret,
  );
  srv.server.registerCapabilities({ resources: { listChanged: true } });
  const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
    sessionIdGenerator: () => (0, node_crypto_1.randomUUID)(),
    enableJsonResponse: true,
  });
  await srv.connect(transport);
  // Register MCP Resources (list/read) with API key enforcement
  (0, resources_js_1.registerResources)(logDb, logSecret);
  const scopesMap = new Map();
  String(apiKey)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((tok) => {
      const [k, sc = ''] = tok.split(':');
      scopesMap.set(
        k,
        new Set(sc ? sc.split(/[+.,]/) : ['tools', 'resources']),
      );
    });
  const isAllowed = (key, scope) => {
    const k = Array.isArray(key) ? key[0] : key;
    if (!k) return false;
    const s = scopesMap.get(String(k));
    return !!s && (s.has(scope) || s.has('all'));
  };
  srv.server._requestHandlers.set('resources/list', (_req, extra) => {
    if (!isAllowed(extra?._meta?.apiKey, 'resources'))
      throw new Error('Invalid API key');
    const resources = (0, resources_js_1.listResources)().map((uri) => ({
      uri,
    }));
    return { resources };
  });
  srv.server._requestHandlers.set('resources/read', async (req, extra) => {
    if (!isAllowed(extra?._meta?.apiKey, 'resources'))
      throw new Error('Invalid API key');
    const uri =
      (req && (req.uri || req.resource?.uri || req.params?.uri)) || undefined;
    if (!uri || typeof uri !== 'string') throw new Error('Missing uri');
    const [base, qs = ''] = uri.split('?');
    const query = new URLSearchParams(qs);
    const t0 = Date.now();
    let data;
    try {
      (0, metrics_js_1.incr)('mcp.resources.read');
      data = await (0, resources_js_1.handleResource)(
        base,
        query,
        extra?._meta?.apiKey ?? 'local',
      );
      (0, metrics_js_1.incr)(`mcp.resources.read.ok`);
    } catch (e) {
      (0, metrics_js_1.incr)(`mcp.resources.read.err`);
      (0, metrics_js_1.recordDuration)(
        'mcp.resources.read.dur_ms',
        Date.now() - t0,
      );
      throw e;
    }
    (0, metrics_js_1.recordDuration)(
      'mcp.resources.read.dur_ms',
      Date.now() - t0,
    );
    return { contents: [{ type: 'json', json: data }] };
  });
  // Wrap tools/call for metrics (per-tool id)
  const origToolsCall = srv.server._requestHandlers.get('tools/call');
  if (origToolsCall) {
    srv.server._requestHandlers.set('tools/call', async (req, extra) => {
      const t0 = Date.now();
      const id = req?.params?.id || req?.id || 'unknown_tool';
      try {
        (0, metrics_js_1.incr)('mcp.tools.call');
        (0, metrics_js_1.incr)(`mcp.tools.${id}.call`);
        const out = await origToolsCall(req, extra);
        (0, metrics_js_1.incr)('mcp.tools.ok');
        (0, metrics_js_1.incr)(`mcp.tools.${id}.ok`);
        (0, metrics_js_1.recordDuration)('mcp.tools.dur_ms', Date.now() - t0);
        (0, metrics_js_1.recordDuration)(
          `mcp.tools.${id}.dur_ms`,
          Date.now() - t0,
        );
        return out;
      } catch (e) {
        (0, metrics_js_1.incr)('mcp.tools.err');
        (0, metrics_js_1.incr)(`mcp.tools.${id}.err`);
        (0, metrics_js_1.recordDuration)('mcp.tools.dur_ms', Date.now() - t0);
        (0, metrics_js_1.recordDuration)(
          `mcp.tools.${id}.dur_ms`,
          Date.now() - t0,
        );
        throw e;
      }
    });
  }
  const httpServer = http_1.default.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/mcp.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: 'Beeper',
          version,
          transport: 'streamable-http',
        }),
      );
    } else if (req.method === 'GET' && req.url?.startsWith('/metrics')) {
      const keyHeader = req.headers['x-api-key'];
      const provided = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
      const ok = provided && scopesMap.has(String(provided));
      if (!ok) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const format = url.searchParams.get('format');
      const verbose = url.searchParams.get('verbose') === '1';
      const all = verbose
        ? (0, metrics_js_1.snapshotVerbose)()
        : (0, metrics_js_1.snapshotAll)();
      if (format === 'prom') {
        const lines = [];
        const counters = all.counters || (0, metrics_js_1.snapshot)();
        const rates = all.rates || {};
        for (const [k, v] of Object.entries(counters)) {
          lines.push(`${k}_total ${v}`);
        }
        for (const [k, v] of Object.entries(rates)) {
          lines.push(`${k}_rate ${v}`);
        }
        if (verbose && all.durations) {
          const d = all.durations;
          for (const [k, v] of Object.entries(d.sum_ms || {})) {
            lines.push(`${k}_sum ${v}`);
          }
          for (const [k, v] of Object.entries(d.count || {})) {
            lines.push(`${k}_count ${v}`);
          }
          for (const [k, v] of Object.entries(d.avg_ms || {})) {
            lines.push(`${k}_avg ${v}`);
          }
        }
        const body = lines.join('\n') + '\n';
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(body);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(all));
      }
    } else {
      void transport.handleRequest(req, res);
    }
  });
  await new Promise((resolve) => httpServer.listen(port, () => resolve()));
  return { mcpServer: srv, httpServer };
}
