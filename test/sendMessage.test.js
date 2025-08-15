import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as sendHandler, __setSendFn } from '../dist/src/mcp/tools/sendMessage.js';
import { __resetRateLimiter } from '../dist/src/security/rateLimit.js';

test('send_message requires approval when send=false', async () => {
  __resetRateLimiter('mcp_tools_send');
  const res = await sendHandler({ room_id: '!r', draft_preview: 'hi', send: false });
  assert.equal(res.reason, 'approval_required');
});

test('send_message respects rate limits', async () => {
  __resetRateLimiter('mcp_tools_send');
  __setSendFn(async () => {});
  // Default send rate is 3 per minute; 4th should fail
  await sendHandler({ room_id: '!r', draft_preview: 'a', send: true });
  await sendHandler({ room_id: '!r', draft_preview: 'b', send: true });
  await sendHandler({ room_id: '!r', draft_preview: 'c', send: true });
  await assert.rejects(() => sendHandler({ room_id: '!r', draft_preview: 'd', send: true }), /rate_limited/);
});

test('send_message sanitizes text and calls sender', async () => {
  __resetRateLimiter('mcp_tools_send');
  let called;
  __setSendFn(async (room, text) => {
    called = { room, text };
  });
  await sendHandler({ room_id: '!r', draft_preview: '<b>hi</b>', send: true });
  assert.deepEqual(called, { room: '!r', text: 'hi' });
});
