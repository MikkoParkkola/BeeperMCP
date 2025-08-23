import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';

const { setupEventLogging } = await import('../dist/src/event-logger.js');

function makeLogger() {
  const fn = () => {};
  return { info: fn, warn: fn, error: fn, debug: fn, trace: fn };
}

function makeClient() {
  const listeners = new Map();
  return {
    on: (ev, cb) => listeners.set(ev, cb),
    emit: (ev, payload) => listeners.get(ev)?.(payload),
    mxcUrlToHttp: (u) => u.replace('mxc://', 'http://example/'),
    getCrypto: () => null,
  };
}

function makeEvent({ id, roomId, sender, type, content, ts }) {
  return {
    isEncrypted: () => false,
    getId: () => id,
    getRoomId: () => roomId,
    getType: () => type,
    getContent: () => content,
    getClearType: () => type,
    getClearContent: () => content,
    getTs: () => ts.getTime(),
    getSender: () => sender,
  };
}

test('event-logger logs plain text messages', async () => {
  const client = makeClient();
  const logger = makeLogger();
  const tmp = path.join('.test-tmp', 'ev1');
  fs.rmSync(tmp, { recursive: true, force: true });
  const calls = [];
  const ctrl = setupEventLogging(client, logger, {
    logDir: tmp,
    logMaxBytes: 100000,
    mediaDownloader: { queue: () => ({ queued: false, file: 'x' }) },
    queueLog: (roomId, ts, line, eventId) =>
      calls.push({ roomId, ts, line: JSON.parse(line), eventId }),
    testRoomId: 'room',
    testLimit: 0,
    uid: 'me',
    shutdown: async () => {},
  });
  const ev = makeEvent({
    id: 'e1',
    roomId: 'room',
    sender: '@u:hs',
    type: 'm.room.message',
    content: { body: 'hello' },
    ts: new Date('2025-01-01T00:00:00Z'),
  });
  client.emit('event', ev);
  await new Promise((r) => setTimeout(r, 0));
  await ctrl.flush();
  assert.equal(calls.length, 1);
  assert.ok(typeof calls[0].line.tz === 'string');
  assert.ok(typeof calls[0].line.tz_keys === 'object');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('event-logger logs media messages and queues downloader', async () => {
  const client = makeClient();
  const logger = makeLogger();
  const tmp = path.join('.test-tmp', 'ev2');
  fs.rmSync(tmp, { recursive: true, force: true });
  const calls = [];
  let queuedCalls = 0;
  const ctrl = setupEventLogging(client, logger, {
    logDir: tmp,
    logMaxBytes: 100000,
    mediaDownloader: {
      queue: () => {
        queuedCalls++;
        return { queued: true, file: 'file.bin' };
      },
    },
    queueLog: (roomId, ts, line, eventId) =>
      calls.push({ roomId, ts, line: JSON.parse(line), eventId }),
    testRoomId: 'room',
    testLimit: 0,
    uid: 'me',
    shutdown: async () => {},
  });
  const ev = makeEvent({
    id: 'e2',
    roomId: 'room',
    sender: '@u:hs',
    type: 'm.room.message',
    content: {
      url: 'mxc://media',
      body: 'ignored',
      info: { mimetype: 'text/plain', size: 4 },
    },
    ts: new Date('2025-01-01T00:00:01Z'),
  });
  client.emit('event', ev);
  await new Promise((r) => setTimeout(r, 0));
  await ctrl.flush();
  assert.equal(queuedCalls, 1);
  assert.equal(calls.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('event-logger handles non-message event types', async () => {
  const client = makeClient();
  const logger = makeLogger();
  const tmp = path.join('.test-tmp', 'ev3');
  fs.rmSync(tmp, { recursive: true, force: true });
  const calls = [];
  setupEventLogging(client, logger, {
    logDir: tmp,
    logMaxBytes: 100000,
    mediaDownloader: { queue: () => ({ queued: false, file: 'x' }) },
    queueLog: (roomId, ts, line, eventId) =>
      calls.push({ roomId, ts, line: JSON.parse(line), eventId }),
    testRoomId: 'room',
    testLimit: 0,
    uid: 'me',
    shutdown: async () => {},
  });
  const ev = makeEvent({
    id: 'e3',
    roomId: 'room',
    sender: '@u:hs',
    type: 'm.room.redaction',
    content: { reason: 'cleanup' },
    ts: new Date('2025-01-01T00:00:02Z'),
  });
  client.emit('event', ev);
  await new Promise((r) => setTimeout(r, 0));
  // no assertion on file; ensure queueLog received
  assert.equal(calls.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
