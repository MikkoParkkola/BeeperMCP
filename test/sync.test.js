import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { pushWithLimit, BoundedMap } from '../utils.js';

const logger = console;

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
      more = await client.paginateEventTimeline(tl, {
        backwards: true,
        limit: 1000,
      });
    } catch (err) {
      logger.warn('paginateEventTimeline failed', err);
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
  const warns = [];
  const origWarn = logger.warn;
  logger.warn = (...args) => {
    warns.push(args);
  };
  await backfillRoom(client, room);
  assert.equal(paginates, 2);
  assert.deepEqual(emitted, ['a', 'b']);
  assert.equal(warns.length, 1);
  logger.warn = origWarn;
});

// Simplified decrypt helper to test missing key retry logic
const UID = '@me:test';
async function decryptEvent(client, pending, ev) {
  if (!ev.isEncrypted()) return;
  try {
    const cryptoApi = client.getCrypto();
    if (cryptoApi) await cryptoApi.decryptEvent(ev);
  } catch (err) {
    logger.warn('Failed to decrypt event', err);
    const wire = ev.getWireContent();
    const mapKey = `${ev.getRoomId()}|${wire.session_id}`;
    const arr = pending.get(mapKey) || [];
    pushWithLimit(arr, ev, 5);
    pending.set(mapKey, arr);
    const sender = ev.getSender();
    if (sender !== UID) {
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        try {
          await cryptoApi.requestRoomKey(
            {
              room_id: ev.getRoomId(),
              session_id: wire.session_id,
              algorithm: wire.algorithm,
            },
            [{ userId: sender, deviceId: '*' }],
          );
        } catch (reqErr) {
          logger.warn('requestRoomKey failed', reqErr);
        }
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
  const warns = [];
  const origWarn = logger.warn;
  logger.warn = (...args) => {
    warns.push(args);
  };
  await decryptEvent(client, pending, event);
  assert.equal(requested, 1);
  // simulate key arrival and retry queued event
  event.hasKey = true;
  for (const pend of pending.get('!room|sess')) {
    await decryptEvent(client, pending, pend);
  }
  assert.equal(requested, 1); // no additional key request
  assert.equal(warns.length, 1);
  logger.warn = origWarn;
});

// Helper to simulate a single /sync request with retry on HTTP failure
async function syncOnceWithRetry(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.next_batch;
    }
  }
  throw new Error('sync failed');
}

test('sync loop retries after HTTP error', async () => {
  let calls = 0;
  const origFetch = global.fetch;
  global.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 502 };
    return { ok: true, json: async () => ({ next_batch: 's2' }) };
  };
  const token = await syncOnceWithRetry('/sync');
  assert.equal(calls, 2);
  assert.equal(token, 's2');
  global.fetch = origFetch;
});

// Helper to backfill, decrypt events and queue media downloads
async function backfillAndDecrypt(client, room, pending, downloader) {
  const tl = room.getLiveTimeline();
  let more = true;
  while (more) {
    try {
      more = await client.paginateEventTimeline(tl, {
        backwards: true,
        limit: 1000,
      });
    } catch (err) {
      logger.warn('paginateEventTimeline failed', err);
    }
  }
  for (const ev of tl.getEvents().sort((a, b) => a.getTs() - b.getTs())) {
    await decryptEvent(client, pending, ev);
    if (ev.decrypted) {
      const content = ev.getContent();
      if (content.url) downloader.queue({ url: content.url });
    }
  }
}

test('backfilled encrypted media event decrypts and downloads after key arrives', async () => {
  const pending = new BoundedMap(10);
  let requested = 0;
  const crypto = {
    async decryptEvent(ev) {
      if (!ev.hasKey) {
        const err = new Error('missing');
        err.name = 'DecryptionError';
        err.code = 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID';
        throw err;
      }
      ev.decrypted = true;
    },
    async requestRoomKey() {
      requested++;
    },
  };
  const client = new EventEmitter();
  client.getCrypto = () => crypto;
  let paginates = 0;
  client.paginateEventTimeline = async () => {
    paginates++;
    if (paginates === 1) throw new Error('network');
    return false;
  };
  const event = {
    hasKey: false,
    decrypted: false,
    isEncrypted: () => true,
    getTs: () => 1,
    getRoomId: () => '!room',
    getSender: () => '@alice:test',
    getWireContent: () => ({ session_id: 'sess', algorithm: 'alg' }),
    getContent: () => ({
      msgtype: 'm.image',
      url: 'http://mx/cat',
      info: { mimetype: 'text/plain', size: 4 },
    }),
    getId: () => '$e1',
  };
  const tl = { getEvents: () => [event] };
  const room = { getLiveTimeline: () => tl };
  const downloads = [];
  let fetchCalls = 0;
  const origFetch = global.fetch;
  global.fetch = async () => {
    fetchCalls++;
    return { ok: true, headers: new Headers(), body: Readable.from('data') };
  };
  const downloader = {
    queue(meta) {
      downloads.push(meta.url);
      fetch(meta.url);
    },
  };
  const warns = [];
  const origWarn = logger.warn;
  logger.warn = (...args) => {
    warns.push(args);
  };
  await backfillAndDecrypt(client, room, pending, downloader);
  assert.equal(paginates, 2);
  assert.equal(requested, 1);
  assert.equal(downloads.length, 0);
  assert.equal(warns.length, 2);
  event.hasKey = true;
  for (const pend of pending.get('!room|sess') || []) {
    await decryptEvent(client, pending, pend);
    if (pend.decrypted) {
      const content = pend.getContent();
      if (content.url) downloader.queue({ url: content.url });
    }
  }
  assert.equal(event.decrypted, true);
  assert.equal(fetchCalls, 1);
  assert.deepEqual(downloads, ['http://mx/cat']);
  global.fetch = origFetch;
  logger.warn = origWarn;
});
