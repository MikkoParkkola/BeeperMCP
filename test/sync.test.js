import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { pushWithLimit, BoundedMap } from '../utils.js';

// Helper to simulate starting the Matrix client with one retry on failure
async function startWithRetry(client, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      await client.startClient();
      return;
    } catch (err) {
      if (i === retries) throw err;
    }
  }
}

test('client reconnects after network failure', async () => {
  let attempts = 0;
  const client = {
    async startClient() {
      attempts++;
      if (attempts === 1) throw new Error('network');
    },
  };
  await startWithRetry(client, 1);
  assert.equal(attempts, 2);
});

// Helper to perform message backfill with retry on paginate errors
async function backfillRoom(client, room) {
  const tl = room.getLiveTimeline();
  let more = true;
  while (more) {
    try {
      more = await client.paginateEventTimeline(tl, { backwards: true, limit: 1000 });
    } catch {
      // retry immediately
    }
  }
  for (const ev of tl.getEvents().sort((a, b) => a.getTs() - b.getTs())) {
    await client.emit('event', ev);
  }
}

test('message backfill retries after network failure', async () => {
  const client = new EventEmitter();
  let paginates = 0;
  client.paginateEventTimeline = async () => {
    paginates++;
    if (paginates === 1) throw new Error('network');
    return false; // no more events
  };
  const ev1 = { getTs: () => 2, payload: 'b' };
  const ev2 = { getTs: () => 1, payload: 'a' };
  const tl = { getEvents: () => [ev1, ev2] };
  const room = { getLiveTimeline: () => tl };
  const emitted = [];
  client.emit = (name, ev) => {
    if (name === 'event') emitted.push(ev.payload);
    return EventEmitter.prototype.emit.call(client, name, ev);
  };
  await backfillRoom(client, room);
  assert.equal(paginates, 2);
  assert.deepEqual(emitted, ['a', 'b']);
});

// Simplified decrypt helper to test missing key retry logic
const UID = '@me:test';
async function decryptEvent(client, pending, ev) {
  if (!ev.isEncrypted()) return;
  try {
    const cryptoApi = client.getCrypto();
    if (cryptoApi) await cryptoApi.decryptEvent(ev);
  } catch (e) {
    const wire = ev.getWireContent();
    const mapKey = `${ev.getRoomId()}|${wire.session_id}`;
    const arr = pending.get(mapKey) || [];
    pushWithLimit(arr, ev, 5);
    pending.set(mapKey, arr);
    const sender = ev.getSender();
    if (sender !== UID) {
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.requestRoomKey(
          { room_id: ev.getRoomId(), session_id: wire.session_id, algorithm: wire.algorithm },
          [{ userId: sender, deviceId: '*' }],
        );
      }
    }
  }
}

test('missing keys trigger key request and queued retry', async () => {
  let requested = 0;
  const crypto = {
    async decryptEvent(ev) {
      if (!ev.hasKey) {
        const err = new Error('missing');
        err.name = 'DecryptionError';
        err.code = 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID';
        throw err;
      }
    },
    async requestRoomKey() {
      requested++;
    },
  };
  const client = {
    getCrypto: () => crypto,
    emit: () => {},
  };
  const pending = new BoundedMap(10);
  const event = {
    hasKey: false,
    isEncrypted: () => true,
    getRoomId: () => '!room',
    getSender: () => '@alice:test',
    getWireContent: () => ({ session_id: 'sess', algorithm: 'alg' }),
  };
  await decryptEvent(client, pending, event);
  assert.equal(requested, 1);
  // simulate key arrival and retry queued event
  event.hasKey = true;
  for (const pend of pending.get('!room|sess')) {
    await decryptEvent(client, pending, pend);
  }
  assert.equal(requested, 1); // no additional key request
});
