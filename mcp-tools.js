import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { queryLogs } from './utils.js';

/**
 * Build an MCP server instance with standard tools.
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
  const srv = new McpServer({
    name: 'Beeper',
    version: '2.2.0',
    description: 'Matrix↔MCP logger',
  });

  srv.tool(
    'list_rooms',
    z.object({ limit: z.number().int().positive().default(50) }),
    async ({ limit }) => {
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
    },
  );

  srv.tool(
    'create_room',
    z.object({
      name: z.string().min(1),
      encrypted: z.boolean().default(false),
    }),
    async ({ name, encrypted }) => {
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
    },
  );

  srv.tool(
    'list_messages',
    z.object({
      room_id: z.string(),
      limit: z.number().int().positive().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
    }),
    async ({ room_id, limit, since, until }) => {
      let lines = [];
      try {
        lines = queryFn(logDb, room_id, limit, since, until, logSecret);
      } catch {}
      return { content: [{ type: 'json', json: lines.filter(Boolean) }] };
    },
  );

  if (enableSend) {
    srv.tool(
      'send_message',
      z.object({ room_id: z.string(), message: z.string().min(1) }),
      async ({ room_id, message }) => {
        await client.sendTextMessage(room_id, message);
        return { content: [{ type: 'text', text: 'sent' }] };
      },
    );
  }

  return srv;
}
