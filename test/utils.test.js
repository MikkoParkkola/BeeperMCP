import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  ensureDir,
  safeFilename,
  getRoomDir,
  FileSessionStore,
  tailFile,
  appendWithRotate,
  openLogDb,
  insertLog,
  queryLogs,
  pushWithLimit,
  BoundedMap,
  envFlag,
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
  const store = new FileSessionStore(storePath);
  store.setItem('foo', 'bar');
  await store.flush();
  const store2 = new FileSessionStore(storePath);
  assert.strictEqual(store2.getItem('foo'), 'bar');
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
  const storeWrong = new FileSessionStore(storePath, 'nope');
  assert.strictEqual(storeWrong.getItem('foo'), null);
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
  const lines = await tailFile(file, 10, secret);
  assert.deepStrictEqual(lines, ['secret line']);
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

test.after(() => {
  cleanup();
});
