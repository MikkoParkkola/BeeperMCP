import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpServer } from '../mcp-tools.js';

const API_KEY = 'sekret';
process.env.MCP_API_KEY = API_KEY;

class StubClient {
  constructor() {
    this.sent = [];
  }
  getRooms() {
    return [];
  }
  async sendTextMessage(room, msg) {
    this.sent.push({ room, msg });
    if (msg === 'fail') throw new Error('send failed');
    return { event_id: '$ev' };
  }
}

test('send_message handles message edits via stub client', async () => {
  const client = new StubClient();
  const srv = buildMcpServer(client, null, true, undefined);
  await srv._registeredTools.send_message.callback(
    { room_id: 'r1', message: 'hello' },
    { _meta: { apiKey: API_KEY } },
  );
  await srv._registeredTools.send_message.callback(
    { room_id: 'r1', message: '* hello' },
    { _meta: { apiKey: API_KEY } },
  );
  assert.deepEqual(client.sent, [
    { room: 'r1', msg: 'hello' },
    { room: 'r1', msg: '* hello' },
  ]);
});

test('send_message can send media-style messages', async () => {
  const client = new StubClient();
  const srv = buildMcpServer(client, null, true, undefined);
  await srv._registeredTools.send_message.callback(
    { room_id: 'r1', message: 'mxc://image' },
    { _meta: { apiKey: API_KEY } },
  );
  assert.deepEqual(client.sent, [{ room: 'r1', msg: 'mxc://image' }]);
});

test('send_message surfaces client errors', async () => {
  const client = new StubClient();
  const srv = buildMcpServer(client, null, true, undefined);
  await assert.rejects(
    srv._registeredTools.send_message.callback(
      { room_id: 'r1', message: 'fail' },
      { _meta: { apiKey: API_KEY } },
    ),
    /send failed/,
  );
});
