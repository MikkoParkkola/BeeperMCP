import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { queryLogs } from './utils.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pkg;
try {
  pkg = require('../package.json');
} catch {
  pkg = require('./package.json');
}
const { version } = pkg;

const logger = console;

/**
 * Build an MCP server instance with standard tools.
 * Requests must include the provided API key in `_meta.apiKey`.
 * @param {any} client Matrix client
 * @param {any} logDb SQLite database handle
 * @param {boolean} enableSend whether to register send_message tool
 * @param {string} apiKey API key required on each request
 * @param {string | undefined} logSecret optional log decryption secret
 * @param {Function} queryFn optional queryLogs override for testing
 * @returns {McpServer}
 */
export function buildMcpServer(
  client,
  logDb,
  enableSend,
  apiKey,
  logSecret,
  queryFn = queryLogs,
) {
  // If no apiKey is provided, disable API key enforcement (e.g., STDIO mode)
  const authDisabled = !apiKey;
  const srv = new McpServer({
    name: 'Beeper',
    version,
    description: 'Matrix↔MCP logger',
  });
  const scopesMap = new Map();
  if (!authDisabled) {
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
  }
  const isAllowed = (key, scope) => {
    if (authDisabled) return true;
    const k = Array.isArray(key) ? key[0] : key;
    if (!k) return false;
    const s = scopesMap.get(k);
    if (!s) return false;
    return s.has(scope) || s.has('all');
  };

  const authWrapper = (cb) => {
    return (args, extra) => {
      if (!isAllowed(extra?._meta?.apiKey, 'tools'))
        throw new Error('Invalid API key');
      return cb(args, extra);
    };
  };

  srv.tool(
    'list_rooms',
    z.object({ limit: z.number().int().positive().default(50) }),
    authWrapper(async ({ limit }) => {
      const out = client
        .getRooms()
        .sort(
          (a, b) =>
            (b.getLastActiveTimestamp?.() || 0) -
            (a.getLastActiveTimestamp?.() || 0),
        )
        .slice(0, limit)
        .map((r) => ({ room_id: r.roomId, name: r.name }));
      return { content: [{ type: 'json', json: out }] };
    }),
  );

  srv.tool(
    'create_room',
    z.object({
      name: z.string().min(1),
      encrypted: z.boolean().default(false),
    }),
    authWrapper(async ({ name, encrypted }) => {
      const opts = { name, visibility: 'private' };
      if (encrypted)
        opts.initial_state = [
          {
            type: 'm.room.encryption',
            state_key: '',
            content: { algorithm: 'm.megolm.v1.aes-sha2' },
          },
        ];
      const { room_id } = await client.createRoom(opts);
      return { content: [{ type: 'json', json: { room_id } }] };
    }),
  );

  srv.tool(
    'list_messages',
    z.object({
      room_id: z.string(),
      limit: z.number().int().positive().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
    }),
    authWrapper(async ({ room_id, limit, since, until }) => {
      let lines = [];
      try {
        lines = queryFn(logDb, room_id, limit, since, until, logSecret);
      } catch (err) {
        logger.warn('Failed to query logs', err);
      }
      return { content: [{ type: 'json', json: lines.filter(Boolean) }] };
    }),
  );

  if (enableSend) {
    srv.tool(
      'send_message',
      z.object({ room_id: z.string(), message: z.string().min(1) }),
      authWrapper(async ({ room_id, message }) => {
        await client.sendTextMessage(room_id, message);
        return { content: [{ type: 'text', text: 'sent' }] };
      }),
    );
  }

  const wrapHandler = (method) => {
    const orig = srv.server._requestHandlers.get(method);
    srv.server._requestHandlers.set(method, (req, extra) => {
      const scope = method.startsWith('resources') ? 'resources' : 'tools';
      if (!isAllowed(extra?._meta?.apiKey, scope))
        throw new Error('Invalid API key');
      return orig(req, extra);
    });
  };
  wrapHandler('tools/list');
  wrapHandler('tools/call');
  wrapHandler('resources/list');
  wrapHandler('resources/read');

  return srv;
}
