import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpServer } from '../mcp-tools.js';

test('list_rooms returns sorted limited rooms', async () => {
  const rooms = [
    { roomId: '1', name: 'one', getLastActiveTimestamp: () => 1 },
    { roomId: '2', name: 'two', getLastActiveTimestamp: () => 5 },
    { roomId: '3', name: 'three', getLastActiveTimestamp: () => 3 },
  ];
  const client = { getRooms: () => rooms };
  const srv = buildMcpServer(client, null, false);
  const res = await srv._registeredTools.list_rooms.callback({ limit: 2 });
  assert.deepEqual(res.content[0].json, [
    { room_id: '2', name: 'two' },
    { room_id: '3', name: 'three' },
  ]);
});

test('create_room forwards encryption flag', async () => {
  let opts;
  const client = {
    createRoom: async (o) => {
      opts = o;
      return { room_id: 'abc' };
    },
    getRooms: () => [],
  };
  const srv = buildMcpServer(client, null, false);
  const res = await srv._registeredTools.create_room.callback({
    name: 'Test',
    encrypted: true,
  });
  assert.equal(opts.initial_state[0].type, 'm.room.encryption');
  assert.equal(res.content[0].json.room_id, 'abc');
});

test('list_messages passes parameters to queryLogs', async () => {
  const client = { getRooms: () => [] };
  const logDb = {};
  let called;
  const srv = buildMcpServer(
    client,
    logDb,
    false,
    undefined,
    undefined,
    (db, roomId, limit, since, until, secret) => {
      called = { db, roomId, limit, since, until, secret };
      return ['a', '', 'b'];
    },
  );
  const res = await srv._registeredTools.list_messages.callback({
    room_id: '!room',
    limit: 5,
    since: '2020-01-01T00:00:00Z',
    until: '2020-01-02T00:00:00Z',
  });
  assert.deepEqual(called, {
    db: logDb,
    roomId: '!room',
    limit: 5,
    since: '2020-01-01T00:00:00Z',
    until: '2020-01-02T00:00:00Z',
    secret: undefined,
  });
  assert.deepEqual(res.content[0].json, ['a', 'b']);
});

test('send_message only registered when enabled', async () => {
  const client = {
    getRooms: () => [],
    sendTextMessage: async () => {},
  };
  const srvDisabled = buildMcpServer(client, null, false);
  assert.ok(!srvDisabled._registeredTools.send_message);

  let args;
  client.sendTextMessage = async (room, msg) => {
    args = { room, msg };
  };
  const srvEnabled = buildMcpServer(client, null, true);
  await srvEnabled._registeredTools.send_message.callback({
    room_id: 'r1',
    message: 'hi',
  });
  assert.deepEqual(args, { room: 'r1', msg: 'hi' });
});

test('requires matching MCP_API_KEY', async () => {
  const client = { getRooms: () => [] };
  const srv = buildMcpServer(client, null, false, undefined, 'sekret');
  assert.throws(
    () => srv._registeredTools.list_rooms.callback({ limit: 1 }),
    /Invalid API key/,
  );
  const res = await srv._registeredTools.list_rooms.callback(
    { limit: 1 },
    { _meta: { apiKey: 'sekret' } },
  );
  assert.deepEqual(res.content[0].json, []);
});
