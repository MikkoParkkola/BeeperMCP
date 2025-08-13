import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
  ensureDir,
  safeFilename,
  getRoomDir,
  FileSessionStore,
  tailFile,
  appendWithRotate,
  openLogDb,
  insertLog,
  insertLogs,
  createLogWriter,
  queryLogs,
  insertMedia,
  queryMedia,
  createMediaDownloader,
  pushWithLimit,
  BoundedMap,
  envFlag,
  encryptFileStream,
  decryptFile,
} from '../utils.js';

const tmpBase = '.test-tmp';

function cleanup() {
  if (fs.existsSync(tmpBase))
    fs.rmSync(tmpBase, { recursive: true, force: true });
}

test('safeFilename sanitizes characters', () => {
  assert.strictEqual(safeFilename('hello/world'), 'hello_world');
  assert.strictEqual(safeFilename('a*b?c'), 'a_b_c');
});

test('ensureDir creates directories recursively', () => {
  cleanup();
  const dir = path.join(tmpBase, 'a/b/c');
  ensureDir(dir);
  assert.ok(fs.existsSync(dir));
});

test('ensureDir sets 0700 permissions', () => {
  cleanup();
  const dir = path.join(tmpBase, 'secure');
  ensureDir(dir);
  const mode = fs.statSync(dir).mode & 0o777;
  assert.strictEqual(mode, 0o700);
});

test('getRoomDir returns sanitized directory path', () => {
  cleanup();
  const roomDir = getRoomDir(tmpBase, '!room:example.org');
  assert.ok(
    roomDir.endsWith(
      path.join(tmpBase, '!room_example.org'.replace(/[^A-Za-z0-9._-]/g, '_')),
    ),
  );
  assert.ok(fs.existsSync(roomDir));
});

test('FileSessionStore implements basic Storage API', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'session.json');
  const store = new FileSessionStore(storePath);
  assert.strictEqual(store.length, 0);
  assert.strictEqual(store.getItem('foo'), null);
  store.setItem('foo', 'bar');
  store.setItem('baz', 'qux');
  assert.strictEqual(store.length, 2);
  assert.strictEqual(store.key(0), 'foo');
  assert.strictEqual(store.getItem('foo'), 'bar');
  store.removeItem('foo');
  assert.strictEqual(store.length, 1);
  store.clear();
  assert.strictEqual(store.length, 0);
  await store.flush();
});

test('FileSessionStore persists asynchronously', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'session.json');
  const store = new FileSessionStore(storePath, undefined, 50);
  store.setItem('foo', 'bar');
  // auto-flush after delay
  await new Promise((r) => setTimeout(r, 80));
  const store2 = new FileSessionStore(storePath);
  assert.strictEqual(store2.getItem('foo'), 'bar');
});

test('FileSessionStore writes 0600 permissions', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'perm.json');
  const store = new FileSessionStore(storePath);
  store.setItem('a', 'b');
  await store.flush();
  const mode = fs.statSync(storePath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('FileSessionStore encrypts data with secret', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'enc.json');
  const secret = 'shh';
  const store = new FileSessionStore(storePath, secret);
  store.setItem('foo', 'bar');
  await store.flush();
  const raw = fs.readFileSync(storePath, 'utf8');
  assert.doesNotThrow(() => Buffer.from(raw, 'base64'));
  const store2 = new FileSessionStore(storePath, secret);
  assert.strictEqual(store2.getItem('foo'), 'bar');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const storeWrong = new FileSessionStore(storePath, 'nope');
  console.warn = origWarn;
  assert.strictEqual(storeWrong.getItem('foo'), null);
  assert.strictEqual(warnings.length, 1);
});

test('tailFile returns last N lines', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'log.txt');
  const all = Array.from({ length: 100 }, (_, i) => `line${i}`);
  fs.writeFileSync(file, all.join('\n'));
  const last = await tailFile(file, 5);
  assert.deepStrictEqual(last, all.slice(-5));
});

test('pushWithLimit keeps array within limit', () => {
  const arr = [];
  for (let i = 0; i < 5; i++) pushWithLimit(arr, i, 3);
  assert.deepStrictEqual(arr, [2, 3, 4]);
});

test('BoundedMap evicts oldest entries', () => {
  const map = new BoundedMap(2);
  map.set('a', 1);
  map.set('b', 2);
  map.set('c', 3);
  assert.ok(!map.has('a'));
  assert.strictEqual(map.get('b'), 2);
  assert.strictEqual(map.get('c'), 3);
});

test('envFlag parses truthy and falsy values', () => {
  process.env.TEST_FLAG = 'yes';
  assert.strictEqual(envFlag('TEST_FLAG'), true);
  process.env.TEST_FLAG = '0';
  assert.strictEqual(envFlag('TEST_FLAG', true), false);
  delete process.env.TEST_FLAG;
  assert.strictEqual(envFlag('TEST_FLAG', true), true);
});

test('appendWithRotate rotates log files', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'rot.log');
  await appendWithRotate(file, 'a'.repeat(50), 100);
  await appendWithRotate(file, 'b'.repeat(60), 100);
  assert.ok(fs.existsSync(`${file}.1`));
  const main = fs.statSync(file).size;
  assert.ok(main <= 61);
});

test('appendWithRotate applies 0600 permissions', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'perm.log');
  await appendWithRotate(file, 'hello', 100);
  const mode = fs.statSync(file).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('encrypted logs round-trip', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'enc.log');
  const secret = 's3cret';
  await appendWithRotate(file, 'hello', 1000, secret);
  const lines = await tailFile(file, 10, secret);
  assert.deepStrictEqual(lines, ['hello']);
});

test('tailFile skips lines that fail to decrypt', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'mix.log');
  const secret = 'secret';
  await appendWithRotate(file, 'secret line', 1000, secret);
  fs.appendFileSync(file, 'plain\n');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const lines = await tailFile(file, 10, secret);
  console.warn = origWarn;
  assert.deepStrictEqual(lines, ['secret line']);
  assert.strictEqual(warnings.length, 1);
});

test('log database stores and retrieves lines', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> hello',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> world',
  );
  const lines = queryLogs(db, 'room', 10);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> hello',
    '[2025-01-02T00:00:00.000Z] <u> world',
  ]);
});

test('openLogDb applies 0600 permissions', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  db.close();
  const mode = fs.statSync(dbPath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('openLogDb re-chmods existing file to 0600', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  fs.writeFileSync(dbPath, '');
  fs.chmodSync(dbPath, 0o644);
  const db = openLogDb(dbPath);
  db.close();
  const mode = fs.statSync(dbPath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('queryLogs honors since/until, limit and secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> a',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> b',
  );
  insertLog(
    db,
    'room',
    '2025-01-03T00:00:00.000Z',
    '[2025-01-03T00:00:00.000Z] <u> c',
  );
  // limit should return most recent entries first, in ascending order
  let lines = queryLogs(db, 'room', 2);
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // since/until filter to a middle slice
  lines = queryLogs(
    db,
    'room',
    undefined,
    '2025-01-02T00:00:00.000Z',
    '2025-01-03T00:00:00.000Z',
  );
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // secret should decrypt stored lines
  const secret = 's3cret';
  insertLog(db, 'room', '2025-01-04T00:00:00.000Z', '[enc]', secret);
  lines = queryLogs(db, 'room', undefined, undefined, undefined, secret);
  assert.ok(lines.includes('[enc]'));
});

test('insertLogs batches entries and decrypts with secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  const secret = 's3cret';
  insertLogs(
    db,
    [
      {
        roomId: 'room',
        ts: '2025-01-01T00:00:00.000Z',
        line: '[2025-01-01T00:00:00.000Z] <u> a',
      },
      {
        roomId: 'room',
        ts: '2025-01-02T00:00:00.000Z',
        line: '[2025-01-02T00:00:00.000Z] <u> b',
      },
    ],
    secret,
  );
  const lines = queryLogs(db, 'room', 10, undefined, undefined, secret);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> a',
    '[2025-01-02T00:00:00.000Z] <u> b',
  ]);
});

test('createLogWriter queues and flushes entries', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'writer.db');
  const db = openLogDb(dbPath);
  const { queue, flush } = createLogWriter(db);
  queue('room', '2025-01-01T00:00:00.000Z', '[a]', 'e1');
  queue('room', '2025-01-02T00:00:00.000Z', '[b]', 'e2');
  flush();
  const lines = queryLogs(db, 'room');
  assert.deepStrictEqual(lines, ['[a]', '[b]']);
});

test('insertMedia stores metadata and queryMedia retrieves it', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'media.db');
  const db = openLogDb(dbPath);
  insertMedia(db, {
    eventId: 'e1',
    roomId: 'room',
    ts: '2025-01-01T00:00:00.000Z',
    file: 'file.txt',
    type: 'text/plain',
    size: 5,
  });
  const rows = queryMedia(db, 'room');
  assert.deepStrictEqual(rows, [
    {
      eventId: 'e1',
      ts: '2025-01-01T00:00:00.000Z',
      file: 'file.txt',
      type: 'text/plain',
      size: 5,
    },
  ]);
});

test('createMediaDownloader reuses cached media for identical events', async () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'media.db');
  const db = openLogDb(dbPath);
  const logs = [];
  const queueLog = (roomId, ts, line) => logs.push(line);
  let fetchCalls = 0;
  const origFetch = global.fetch;
  global.fetch = async () => {
    fetchCalls++;
    return {
      ok: true,
      headers: new Headers({
        'content-type': 'text/plain',
        'content-length': '4',
      }),
      body: Readable.from(Buffer.from('data')),
    };
  };
  const dl = createMediaDownloader(db, queueLog);
  const dest1 = path.join(tmpBase, 'a');
  dl.queue({
    url: 'http://x',
    dest: dest1,
    roomId: 'room',
    eventId: 'e1',
    ts: '2025-01-01T00:00:00.000Z',
    sender: 'u',
    type: 'text/plain',
    size: 4,
  });
  await dl.flush();
  const dest2 = path.join(tmpBase, 'b');
  dl.queue({
    url: 'http://x',
    dest: dest2,
    roomId: 'room',
    eventId: 'e1',
    ts: '2025-01-01T00:00:00.000Z',
    sender: 'u',
    type: 'text/plain',
    size: 4,
  });
  await dl.flush();
  global.fetch = origFetch;
  assert.strictEqual(fetchCalls, 1);
  assert.deepStrictEqual(logs, [
    `[2025-01-01T00:00:00.000Z] <u> [media] ${path.basename(dest1)}`,
    `[2025-01-01T00:00:00.000Z] <u> [media cached] ${path.basename(dest1)}`,
  ]);
});

test('encryptFileStream writes encrypted media', async () => {
  const secret = 'media-secret';
  const dest = path.join(tmpBase, 'media.enc');
  const src = Readable.from(Buffer.from('hello'));
  await encryptFileStream(src, dest, secret);
  const dec = await decryptFile(dest, secret);
  assert.strictEqual(dec.toString(), 'hello');
  const mode = fs.statSync(dest).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('FileSessionStore persists asynchronously', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'session.json');
  const store = new FileSessionStore(storePath);
  store.setItem('foo', 'bar');
  await store.flush();
  const store2 = new FileSessionStore(storePath);
  assert.strictEqual(store2.getItem('foo'), 'bar');
});

test('FileSessionStore writes 0600 permissions', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'perm.json');
  const store = new FileSessionStore(storePath);
  store.setItem('a', 'b');
  await store.flush();
  const mode = fs.statSync(storePath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('FileSessionStore encrypts data with secret', async () => {
  cleanup();
  const storePath = path.join(tmpBase, 'enc.json');
  const secret = 'shh';
  const store = new FileSessionStore(storePath, secret);
  store.setItem('foo', 'bar');
  await store.flush();
  const raw = fs.readFileSync(storePath, 'utf8');
  assert.doesNotThrow(() => Buffer.from(raw, 'base64'));
  const store2 = new FileSessionStore(storePath, secret);
  assert.strictEqual(store2.getItem('foo'), 'bar');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const storeWrong = new FileSessionStore(storePath, 'nope');
  console.warn = origWarn;
  assert.strictEqual(storeWrong.getItem('foo'), null);
  assert.strictEqual(warnings.length, 1);
});

test('tailFile returns last N lines', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'log.txt');
  const all = Array.from({ length: 100 }, (_, i) => `line${i}`);
  fs.writeFileSync(file, all.join('\n'));
  const last = await tailFile(file, 5);
  assert.deepStrictEqual(last, all.slice(-5));
});

test('pushWithLimit keeps array within limit', () => {
  const arr = [];
  for (let i = 0; i < 5; i++) pushWithLimit(arr, i, 3);
  assert.deepStrictEqual(arr, [2, 3, 4]);
});

test('BoundedMap evicts oldest entries', () => {
  const map = new BoundedMap(2);
  map.set('a', 1);
  map.set('b', 2);
  map.set('c', 3);
  assert.ok(!map.has('a'));
  assert.strictEqual(map.get('b'), 2);
  assert.strictEqual(map.get('c'), 3);
});

test('envFlag parses truthy and falsy values', () => {
  process.env.TEST_FLAG = 'yes';
  assert.strictEqual(envFlag('TEST_FLAG'), true);
  process.env.TEST_FLAG = '0';
  assert.strictEqual(envFlag('TEST_FLAG', true), false);
  delete process.env.TEST_FLAG;
  assert.strictEqual(envFlag('TEST_FLAG', true), true);
});

test('appendWithRotate rotates log files', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'rot.log');
  await appendWithRotate(file, 'a'.repeat(50), 100);
  await appendWithRotate(file, 'b'.repeat(60), 100);
  assert.ok(fs.existsSync(`${file}.1`));
  const main = fs.statSync(file).size;
  assert.ok(main <= 61);
});

test('appendWithRotate applies 0600 permissions', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'perm.log');
  await appendWithRotate(file, 'hello', 100);
  const mode = fs.statSync(file).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('encrypted logs round-trip', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'enc.log');
  const secret = 's3cret';
  await appendWithRotate(file, 'hello', 1000, secret);
  const lines = await tailFile(file, 10, secret);
  assert.deepStrictEqual(lines, ['hello']);
});

test('tailFile skips lines that fail to decrypt', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'mix.log');
  const secret = 'secret';
  await appendWithRotate(file, 'secret line', 1000, secret);
  fs.appendFileSync(file, 'plain\n');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const lines = await tailFile(file, 10, secret);
  console.warn = origWarn;
  assert.deepStrictEqual(lines, ['secret line']);
  assert.strictEqual(warnings.length, 1);
});

test('log database stores and retrieves lines', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> hello',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> world',
  );
  const lines = queryLogs(db, 'room', 10);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> hello',
    '[2025-01-02T00:00:00.000Z] <u> world',
  ]);
});

test('openLogDb applies 0600 permissions', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  db.close();
  const mode = fs.statSync(dbPath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('openLogDb re-chmods existing file to 0600', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  fs.writeFileSync(dbPath, '');
  fs.chmodSync(dbPath, 0o644);
  const db = openLogDb(dbPath);
  db.close();
  const mode = fs.statSync(dbPath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('queryLogs honors since/until, limit and secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> a',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> b',
  );
  insertLog(
    db,
    'room',
    '2025-01-03T00:00:00.000Z',
    '[2025-01-03T00:00:00.000Z] <u> c',
  );
  // limit should return most recent entries first, in ascending order
  let lines = queryLogs(db, 'room', 2);
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // since/until filter to a middle slice
  lines = queryLogs(
    db,
    'room',
    undefined,
    '2025-01-02T00:00:00.000Z',
    '2025-01-03T00:00:00.000Z',
  );
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // secret should decrypt stored lines
  const secret = 's3cret';
  insertLog(db, 'room', '2025-01-04T00:00:00.000Z', '[enc]', secret);
  lines = queryLogs(db, 'room', undefined, undefined, undefined, secret);
  assert.ok(lines.includes('[enc]'));
});

test('insertLogs batches entries and decrypts with secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  const secret = 's3cret';
  insertLogs(
    db,
    [
      {
        roomId: 'room',
        ts: '2025-01-01T00:00:00.000Z',
        line: '[2025-01-01T00:00:00.000Z] <u> a',
      },
      {
        roomId: 'room',
        ts: '2025-01-02T00:00:00.000Z',
        line: '[2025-01-02T00:00:00.000Z] <u> b',
      },
    ],
    secret,
  );
  const lines = queryLogs(db, 'room', 10, undefined, undefined, secret);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> a',
    '[2025-01-02T00:00:00.000Z] <u> b',
  ]);
});

test('createLogWriter queues and flushes entries', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'writer.db');
  const db = openLogDb(dbPath);
  const { queue, flush } = createLogWriter(db);
  queue('room', '2025-01-01T00:00:00.000Z', '[a]');
  queue('room', '2025-01-02T00:00:00.000Z', '[b]');
  flush();
  const lines = queryLogs(db, 'room');
  assert.deepStrictEqual(lines, ['[a]', '[b]']);
});

test('encryptFileStream writes encrypted media', async () => {
  const secret = 'media-secret';
  const dest = path.join(tmpBase, 'media.enc');
  const src = Readable.from(Buffer.from('hello'));
  await encryptFileStream(src, dest, secret);
  const dec = await decryptFile(dest, secret);
  assert.strictEqual(dec.toString(), 'hello');
  const mode = fs.statSync(dest).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('BoundedMap evicts oldest entries', () => {
  const map = new BoundedMap(2);
  map.set('a', 1);
  map.set('b', 2);
  map.set('c', 3);
  assert.ok(!map.has('a'));
  assert.strictEqual(map.get('b'), 2);
  assert.strictEqual(map.get('c'), 3);
});

test('envFlag parses truthy and falsy values', () => {
  process.env.TEST_FLAG = 'yes';
  assert.strictEqual(envFlag('TEST_FLAG'), true);
  process.env.TEST_FLAG = '0';
  assert.strictEqual(envFlag('TEST_FLAG', true), false);
  delete process.env.TEST_FLAG;
  assert.strictEqual(envFlag('TEST_FLAG', true), true);
});

test('appendWithRotate rotates log files', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'rot.log');
  await appendWithRotate(file, 'a'.repeat(50), 100);
  await appendWithRotate(file, 'b'.repeat(60), 100);
  assert.ok(fs.existsSync(`${file}.1`));
  const main = fs.statSync(file).size;
  assert.ok(main <= 61);
});

test('appendWithRotate applies 0600 permissions', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'perm.log');
  await appendWithRotate(file, 'hello', 100);
  const mode = fs.statSync(file).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('encrypted logs round-trip', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'enc.log');
  const secret = 's3cret';
  await appendWithRotate(file, 'hello', 1000, secret);
  const lines = await tailFile(file, 10, secret);
  assert.deepStrictEqual(lines, ['hello']);
});

test('tailFile skips lines that fail to decrypt', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'mix.log');
  const secret = 'secret';
  await appendWithRotate(file, 'secret line', 1000, secret);
  fs.appendFileSync(file, 'plain\n');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const lines = await tailFile(file, 10, secret);
  console.warn = origWarn;
  assert.deepStrictEqual(lines, ['secret line']);
  assert.strictEqual(warnings.length, 1);
});

test('log database stores and retrieves lines', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> hello',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> world',
  );
  const lines = queryLogs(db, 'room', 10);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> hello',
    '[2025-01-02T00:00:00.000Z] <u> world',
  ]);
});

test('queryLogs honors since/until, limit and secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> a',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> b',
  );
  insertLog(
    db,
    'room',
    '2025-01-03T00:00:00.000Z',
    '[2025-01-03T00:00:00.000Z] <u> c',
  );
  // limit should return most recent entries first, in ascending order
  let lines = queryLogs(db, 'room', 2);
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // since/until filter to a middle slice
  lines = queryLogs(
    db,
    'room',
    undefined,
    '2025-01-02T00:00:00.000Z',
    '2025-01-03T00:00:00.000Z',
  );
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // secret should decrypt stored lines
  const secret = 's3cret';
  insertLog(db, 'room', '2025-01-04T00:00:00.000Z', '[enc]', secret);
  lines = queryLogs(db, 'room', undefined, undefined, undefined, secret);
  assert.ok(lines.includes('[enc]'));
});

test('insertLogs batches entries and decrypts with secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  const secret = 's3cret';
  insertLogs(
    db,
    [
      {
        roomId: 'room',
        ts: '2025-01-01T00:00:00.000Z',
        line: '[2025-01-01T00:00:00.000Z] <u> a',
      },
      {
        roomId: 'room',
        ts: '2025-01-02T00:00:00.000Z',
        line: '[2025-01-02T00:00:00.000Z] <u> b',
      },
    ],
    secret,
  );
  const lines = queryLogs(db, 'room', 10, undefined, undefined, secret);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> a',
    '[2025-01-02T00:00:00.000Z] <u> b',
  ]);
});

test('createLogWriter queues and flushes entries', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'writer.db');
  const db = openLogDb(dbPath);
  const { queue, flush } = createLogWriter(db);
  queue('room', '2025-01-01T00:00:00.000Z', '[a]');
  queue('room', '2025-01-02T00:00:00.000Z', '[b]');
  flush();
  const lines = queryLogs(db, 'room');
  assert.deepStrictEqual(lines, ['[a]', '[b]']);
});

test('encryptFileStream writes encrypted media', async () => {
  const secret = 'media-secret';
  const dest = path.join(tmpBase, 'media.enc');
  const src = Readable.from(Buffer.from('hello'));
  await encryptFileStream(src, dest, secret);
  const dec = await decryptFile(dest, secret);
  assert.strictEqual(dec.toString(), 'hello');
  const mode = fs.statSync(dest).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('BoundedMap evicts oldest entries', () => {
  const map = new BoundedMap(2);
  map.set('a', 1);
  map.set('b', 2);
  map.set('c', 3);
  assert.ok(!map.has('a'));
  assert.strictEqual(map.get('b'), 2);
  assert.strictEqual(map.get('c'), 3);
});

test('envFlag parses truthy and falsy values', () => {
  process.env.TEST_FLAG = 'yes';
  assert.strictEqual(envFlag('TEST_FLAG'), true);
  process.env.TEST_FLAG = '0';
  assert.strictEqual(envFlag('TEST_FLAG', true), false);
  delete process.env.TEST_FLAG;
  assert.strictEqual(envFlag('TEST_FLAG', true), true);
});

test('appendWithRotate rotates log files', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'rot.log');
  await appendWithRotate(file, 'a'.repeat(50), 100);
  await appendWithRotate(file, 'b'.repeat(60), 100);
  assert.ok(fs.existsSync(`${file}.1`));
  const main = fs.statSync(file).size;
  assert.ok(main <= 61);
});

test('appendWithRotate applies 0600 permissions', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'perm.log');
  await appendWithRotate(file, 'hello', 100);
  const mode = fs.statSync(file).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('encrypted logs round-trip', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'enc.log');
  const secret = 's3cret';
  await appendWithRotate(file, 'hello', 1000, secret);
  const lines = await tailFile(file, 10, secret);
  assert.deepStrictEqual(lines, ['hello']);
});

test('tailFile skips lines that fail to decrypt', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'mix.log');
  const secret = 'secret';
  await appendWithRotate(file, 'secret line', 1000, secret);
  fs.appendFileSync(file, 'plain\n');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const lines = await tailFile(file, 10, secret);
  console.warn = origWarn;
  assert.deepStrictEqual(lines, ['secret line']);
  assert.strictEqual(warnings.length, 1);
});

test('log database stores and retrieves lines', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> hello',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> world',
  );
  const lines = queryLogs(db, 'room', 10);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> hello',
    '[2025-01-02T00:00:00.000Z] <u> world',
  ]);
});

test('queryLogs honors since/until, limit and secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> a',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> b',
  );
  insertLog(
    db,
    'room',
    '2025-01-03T00:00:00.000Z',
    '[2025-01-03T00:00:00.000Z] <u> c',
  );
  // limit should return most recent entries first, in ascending order
  let lines = queryLogs(db, 'room', 2);
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // since/until filter to a middle slice
  lines = queryLogs(
    db,
    'room',
    undefined,
    '2025-01-02T00:00:00.000Z',
    '2025-01-03T00:00:00.000Z',
  );
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // secret should decrypt stored lines
  const secret = 's3cret';
  insertLog(db, 'room', '2025-01-04T00:00:00.000Z', '[enc]', secret);
  lines = queryLogs(db, 'room', undefined, undefined, undefined, secret);
  assert.ok(lines.includes('[enc]'));
});

test('insertLogs batches entries and decrypts with secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  const secret = 's3cret';
  insertLogs(
    db,
    [
      {
        roomId: 'room',
        ts: '2025-01-01T00:00:00.000Z',
        line: '[2025-01-01T00:00:00.000Z] <u> a',
      },
      {
        roomId: 'room',
        ts: '2025-01-02T00:00:00.000Z',
        line: '[2025-01-02T00:00:00.000Z] <u> b',
      },
    ],
    secret,
  );
  const lines = queryLogs(db, 'room', 10, undefined, undefined, secret);
  assert.deepStrictEqual(lines, [
    '[2025-01-01T00:00:00.000Z] <u> a',
    '[2025-01-02T00:00:00.000Z] <u> b',
  ]);
});

test('encryptFileStream writes encrypted media', async () => {
  const secret = 'media-secret';
  const dest = path.join(tmpBase, 'media.enc');
  const src = Readable.from(Buffer.from('hello'));
  await encryptFileStream(src, dest, secret);
  const dec = await decryptFile(dest, secret);
  assert.strictEqual(dec.toString(), 'hello');
  const mode = fs.statSync(dest).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('encryptFileStream writes encrypted media', async () => {
  const secret = 'media-secret';
  const dest = path.join(tmpBase, 'media.enc');
  const src = Readable.from(Buffer.from('hello'));
  await encryptFileStream(src, dest, secret);
  const dec = await decryptFile(dest, secret);
  assert.strictEqual(dec.toString(), 'hello');
});

test('queryLogs honors since/until, limit and secret', () => {
  cleanup();
  ensureDir(tmpBase);
  const dbPath = path.join(tmpBase, 'logs.db');
  const db = openLogDb(dbPath);
  insertLog(
    db,
    'room',
    '2025-01-01T00:00:00.000Z',
    '[2025-01-01T00:00:00.000Z] <u> a',
  );
  insertLog(
    db,
    'room',
    '2025-01-02T00:00:00.000Z',
    '[2025-01-02T00:00:00.000Z] <u> b',
  );
  insertLog(
    db,
    'room',
    '2025-01-03T00:00:00.000Z',
    '[2025-01-03T00:00:00.000Z] <u> c',
  );
  // limit should return most recent entries first, in ascending order
  let lines = queryLogs(db, 'room', 2);
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // since/until filter to a middle slice
  lines = queryLogs(
    db,
    'room',
    undefined,
    '2025-01-02T00:00:00.000Z',
    '2025-01-03T00:00:00.000Z',
  );
  assert.deepStrictEqual(lines, [
    '[2025-01-02T00:00:00.000Z] <u> b',
    '[2025-01-03T00:00:00.000Z] <u> c',
  ]);
  // secret should decrypt stored lines
  const secret = 's3cret';
  insertLog(db, 'room', '2025-01-04T00:00:00.000Z', '[enc]', secret);
  lines = queryLogs(db, 'room', undefined, undefined, undefined, secret);
  assert.ok(lines.includes('[enc]'));
});

test('pushWithLimit keeps array within limit', () => {
  const arr = [];
  for (let i = 0; i < 5; i++) pushWithLimit(arr, i, 3);
  assert.deepStrictEqual(arr, [2, 3, 4]);
});

test('BoundedMap evicts oldest entries', () => {
  const map = new BoundedMap(2);
  map.set('a', 1);
  map.set('b', 2);
  map.set('c', 3);
  assert.ok(!map.has('a'));
  assert.strictEqual(map.get('b'), 2);
  assert.strictEqual(map.get('c'), 3);
});

test('appendWithRotate rotates log files', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'rot.log');
  await appendWithRotate(file, 'a'.repeat(50), 100);
  await appendWithRotate(file, 'b'.repeat(60), 100);
  assert.ok(fs.existsSync(`${file}.1`));
  const main = fs.statSync(file).size;
  assert.ok(main <= 61);
});

test('encrypted logs round-trip', async () => {
  cleanup();
  ensureDir(tmpBase);
  const file = path.join(tmpBase, 'enc.log');
  const secret = 's3cret';
  await appendWithRotate(file, 'hello', 1000, secret);
  const lines = await tailFile(file, 10, secret);
  assert.deepStrictEqual(lines, ['hello']);
});

test.after(() => {
  cleanup();
});
