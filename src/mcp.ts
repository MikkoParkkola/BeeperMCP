import http from 'http';
import { snapshot as metricsSnapshot, snapshotAll as metricsSnapshotAll, snapshotVerbose as metricsSnapshotVerbose, incr, recordDuration } from './obs/metrics.js';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from '../mcp-tools.js';
import type { MatrixClient } from 'matrix-js-sdk';
import { registerResources, listResources, handleResource, matchResourceTemplate } from './mcp/resources.js';

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
  const apiKeys = new Set(
    (apiKey || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const assertApiKey = (key?: string | string[]) => {
    const k = Array.isArray(key) ? key[0] : key;
    if (!k || !apiKeys.has(k)) throw new Error('Invalid API key');
  };
  (srv.server as any)._requestHandlers.set(
    'resources/list',
    (_req: any, extra: any) => {
      assertApiKey(extra?._meta?.apiKey);
      incr('mcp.resources.list');
      const resources = listResources().map((uri) => ({ uri }));
      return { resources };
    },
  );
  (srv.server as any)._requestHandlers.set(
    'resources/read',
    async (req: any, extra: any) => {
      assertApiKey(extra?._meta?.apiKey);
      incr('mcp.resources.read');
      const uri: string | undefined =
        (req && (req.uri || req.resource?.uri || req.params?.uri)) || undefined;
      if (!uri || typeof uri !== 'string') throw new Error('Missing uri');
      const [base, qs = ''] = uri.split('?');
      const query = new URLSearchParams(qs);
      let data;
      const t0 = Date.now();
      try {
        data = await handleResource(base, query);
        const tmpl = matchResourceTemplate(base) || 'unknown';
        incr(`mcp.resources.read.ok`);
        incr(`mcp.resources.read.${tmpl}`);
        recordDuration(`mcp.resources.read.${tmpl}.dur_ms`, Date.now() - t0);
      } catch (e) {
        const tmpl = matchResourceTemplate(base) || 'unknown';
        incr(`mcp.resources.read.err`);
        incr(`mcp.resources.read.${tmpl}.err`);
        recordDuration(`mcp.resources.read.${tmpl}.dur_ms`, Date.now() - t0);
        throw e;
      }
      return { contents: [{ type: 'json', json: data }] };
    },
  );

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/mcp.json') {
      incr('mcp.well_known');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ transport: 'streamable-http' }));
    } else if (req.method === 'GET' && req.url?.startsWith('/metrics')) {
      incr('mcp.metrics');
      const key = req.headers['x-api-key'];
      if (!key || (Array.isArray(key) ? !apiKeys.has(key[0]!) : !apiKeys.has(String(key)))) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
      } else {
        const url = new URL(req.url, 'http://localhost');
        const format = url.searchParams.get('format');
        const verbose = url.searchParams.get('verbose') === '1';
        const all = verbose ? metricsSnapshotVerbose() : metricsSnapshotAll();
        if (format === 'prom') {
          const lines: string[] = [];
          const counters = (all as any).counters || {};
          const rates = (all as any).rates || {};
          for (const [k, v] of Object.entries(counters)) lines.push(`${k}_total ${v}`);
          for (const [k, v] of Object.entries(rates)) lines.push(`${k}_rate ${v}`);
          if (verbose && (all as any).durations) {
            const d = (all as any).durations;
            for (const [k, v] of Object.entries(d.sum_ms || {})) lines.push(`${k}_sum ${v}`);
            for (const [k, v] of Object.entries(d.count || {})) lines.push(`${k}_count ${v}`);
            for (const [k, v] of Object.entries(d.avg_ms || {})) lines.push(`${k}_avg ${v}`);
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
