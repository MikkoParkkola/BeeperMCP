import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {ensureDir,safeFilename,getRoomDir,FileSessionStore} from '../utils.js';

const tmpBase = '.test-tmp';

function cleanup() {
  if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
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
  assert.ok(roomDir.endsWith(path.join(tmpBase, '!room_example.org'.replace(/[^A-Za-z0-9._-]/g,'_'))));
  assert.ok(fs.existsSync(roomDir));
});

test('FileSessionStore persists values', () => {
  cleanup();
  const storePath = path.join(tmpBase, 'session.json');
  const store = new FileSessionStore(storePath);
  assert.strictEqual(store.getItem('foo'), null);
  store.setItem('foo', 'bar');
  assert.strictEqual(store.getItem('foo'), 'bar');
  store.removeItem('foo');
  assert.strictEqual(store.getItem('foo'), null);
});

test.after(() => {
  cleanup();
});
