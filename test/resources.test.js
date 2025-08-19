import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { openLogDb, insertLog, insertMedia } from '../utils.js';
import {
  registerResources,
  handleResource,
} from '../dist/src/mcp/resources.js';

test('resources: history returns logs from SQLite', async () => {
  const dbPath = `.test-resources-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  try {
    fs.unlinkSync(dbPath);
  } catch {}
  const db = openLogDb(dbPath);
  insertLog(db, '!r', '2025-01-01T00:00:00.000Z', '[a]', undefined, 'e1');
  insertLog(db, '!r', '2025-01-02T00:00:00.000Z', '[b]', undefined, 'e2');
  registerResources(db);
  const res = await handleResource(
    'im://matrix/room/!r/history',
    new URLSearchParams('limit=10'),
  );
  assert.deepEqual(res.items, ['[a]', '[b]']);
});

test('resources: media returns metadata by eventId', async () => {
  const dbPath = `.test-resources-media-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  try {
    fs.unlinkSync(dbPath);
  } catch {}
  const db = openLogDb(dbPath);
  insertMedia(db, {
    eventId: 'e1',
    roomId: '!r',
    ts: '2025-01-01T00:00:00.000Z',
    file: 'f.bin',
    type: 'application/bin',
    size: 1,
  });
  registerResources(db);
  const res = await handleResource(
    'im://matrix/media/e1/file',
    new URLSearchParams(),
  );
  assert.equal(res.file, 'f.bin');
});

test('resources: context returns decrypted window around event', async () => {
  const secret = 's3cret';
  const dbPath = `.test-resources-context-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.db`;
  try {
    fs.unlinkSync(dbPath);
  } catch {}
  const db = openLogDb(dbPath);
  // Insert three lines with encryption, center is anchor with eventId e2
  insertLog(db, '!r', '2025-01-01T00:00:00.000Z', '[a]', secret, 'e1');
  insertLog(db, '!r', '2025-01-01T00:00:10.000Z', '[b]', secret, 'e2');
  insertLog(db, '!r', '2025-01-01T00:00:20.000Z', '[c]', secret, 'e3');
  registerResources(db, secret);
  const res = await handleResource(
    'im://matrix/room/!r/message/e2/context',
    new URLSearchParams('before=1&after=1'),
  );
  // Expect three items with decrypted lines in order [a], [b], [c]
  assert.equal(res.items.length, 3);
  assert.deepEqual(res.items.map((i) => i.line), ['[a]', '[b]', '[c]']);
});
