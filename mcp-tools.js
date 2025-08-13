import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { queryLogs } from './utils.js';

const logger = console;

/**
 * Build an MCP server instance with standard tools.
 * Requires `MCP_API_KEY` to be set in the environment; requests must include
 * this key in `_meta.apiKey`.
 * @param {any} client Matrix client
 * @param {any} logDb SQLite database handle
 * @param {boolean} enableSend whether to register send_message tool
 * @param {string | undefined} logSecret optional log decryption secret
 * @param {Function} queryFn optional queryLogs override for testing
 * @returns {McpServer}
 */
export function buildMcpServer(
  client,
  logDb,
  enableSend,
  logSecret,
  queryFn = queryLogs,
) {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) throw new Error('MCP_API_KEY is required');
  const srv = new McpServer({
    name: 'Beeper',
    version: '2.2.0',
    description: 'Matrix↔MCP logger',
  });

  const authWrapper = (cb) => {
    return (args, extra) => {
      if (extra?._meta?.apiKey !== apiKey) throw new Error('Invalid API key');
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
      if (extra?._meta?.apiKey !== apiKey) throw new Error('Invalid API key');
      return orig(req, extra);
    });
  };
  wrapHandler('tools/list');
  wrapHandler('tools/call');

  return srv;
}
