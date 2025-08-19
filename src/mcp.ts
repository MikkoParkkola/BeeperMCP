import http from 'http';
import {
  snapshot as metricsSnapshot,
  snapshotAll as metricsSnapshotAll,
  snapshotVerbose as metricsSnapshotVerbose,
  incr,
  recordDuration,
} from './obs/metrics.js';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from '../mcp-tools.js';
import type { MatrixClient } from 'matrix-js-sdk';
const version =
  process.env.npm_package_version || process.env.BEEPER_MCP_VERSION || 'dev';
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
  srv.server.registerCapabilities({ resources: { listChanged: true } });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });
  await srv.connect(transport);
  // Register MCP Resources (list/read) with API key enforcement
  registerResources(logDb, logSecret);
  const scopesMap = new Map<string, Set<string>>();
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
  const isAllowed = (key: any, scope: 'tools' | 'resources') => {
    const k = Array.isArray(key) ? key[0] : key;
    if (!k) return false;
    const s = scopesMap.get(String(k));
    return !!s && (s.has(scope) || s.has('all'));
  };

  (srv.server as any)._requestHandlers.set(
    'resources/list',
    (_req: any, extra: any) => {
      if (!isAllowed(extra?._meta?.apiKey, 'resources'))
        throw new Error('Invalid API key');
      const resources = listResources().map((uri) => ({ uri }));
      return { resources };
    },
  );
  (srv.server as any)._requestHandlers.set(
    'resources/read',
    async (req: any, extra: any) => {
      if (!isAllowed(extra?._meta?.apiKey, 'resources'))
        throw new Error('Invalid API key');
      const uri: string | undefined =
        (req && (req.uri || req.resource?.uri || req.params?.uri)) || undefined;
      if (!uri || typeof uri !== 'string') throw new Error('Missing uri');
      const [base, qs = ''] = uri.split('?');
      const query = new URLSearchParams(qs);
      const t0 = Date.now();
      let data;
      try {
        incr('mcp.resources.read');
        data = await handleResource(
          base,
          query,
          extra?._meta?.apiKey ?? 'local',
        );
        incr(`mcp.resources.read.ok`);
      } catch (e) {
        incr(`mcp.resources.read.err`);
        recordDuration('mcp.resources.read.dur_ms', Date.now() - t0);
        throw e;
      }
      recordDuration('mcp.resources.read.dur_ms', Date.now() - t0);
      return { contents: [{ type: 'json', json: data }] };
    },
  );

  // Wrap tools/call for metrics (per-tool id)
  const origToolsCall = (srv.server as any)._requestHandlers.get('tools/call');
  if (origToolsCall) {
    (srv.server as any)._requestHandlers.set(
      'tools/call',
      async (req: any, extra: any) => {
        const t0 = Date.now();
        const id = req?.params?.id || req?.id || 'unknown_tool';
        try {
          incr('mcp.tools.call');
          incr(`mcp.tools.${id}.call`);
          const out = await origToolsCall(req, extra);
          incr('mcp.tools.ok');
          incr(`mcp.tools.${id}.ok`);
          recordDuration('mcp.tools.dur_ms', Date.now() - t0);
          recordDuration(`mcp.tools.${id}.dur_ms`, Date.now() - t0);
          return out;
        } catch (e) {
          incr('mcp.tools.err');
          incr(`mcp.tools.${id}.err`);
          recordDuration('mcp.tools.dur_ms', Date.now() - t0);
          recordDuration(`mcp.tools.${id}.dur_ms`, Date.now() - t0);
          throw e;
        }
      },
    );
  }

  const httpServer = http.createServer((req, res) => {
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
      const key = req.headers['x-api-key'];
      if (key !== apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
      } else {
        const url = new URL(req.url, 'http://localhost');
        const format = url.searchParams.get('format');
        const verbose = url.searchParams.get('verbose') === '1';
        const all = verbose ? metricsSnapshotVerbose() : metricsSnapshotAll();
        if (format === 'prom') {
          const lines: string[] = [];
          const counters = (all as any).counters || metricsSnapshot();
          const rates = (all as any).rates || {};
          for (const [k, v] of Object.entries(counters))
            lines.push(`${k}_total ${v}`);
          for (const [k, v] of Object.entries(rates))
            lines.push(`${k}_rate ${v}`);
          if (verbose && (all as any).durations) {
            const d = (all as any).durations;
            for (const [k, v] of Object.entries(d.sum_ms || {}))
              lines.push(`${k}_sum ${v}`);
            for (const [k, v] of Object.entries(d.count || {}))
              lines.push(`${k}_count ${v}`);
            for (const [k, v] of Object.entries(d.avg_ms || {}))
              lines.push(`${k}_avg ${v}`);
          }
          const body = lines.join('\n') + '\n';
          res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
          res.end(body);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(all));
        }
      }
    } else {
      void transport.handleRequest(req, res);
    }
  });
  await new Promise<void>((resolve) =>
    httpServer.listen(port, () => resolve()),
  );
  return { mcpServer: srv, httpServer };
}
