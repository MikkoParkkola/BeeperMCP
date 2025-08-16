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
    'local',
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
    'local',
  );
  assert.equal(res.file, 'f.bin');
});

test('resources: context retrieves logs around old events', async () => {
  const dbPath = `.test-resources-context-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  try {
    fs.unlinkSync(dbPath);
  } catch {}
  const db = openLogDb(dbPath);
  const base = Date.UTC(2025, 0, 1, 0, 0, 0);
  for (let i = 0; i < 20; i++) {
    const ts = new Date(base + i * 60_000).toISOString();
    insertLog(db, '!r', ts, `[${i}]`, undefined, `e${i}`);
  }
  registerResources(db);
  const res = await handleResource(
    'im://matrix/room/!r/message/e5/context',
    new URLSearchParams('before=1&after=1'),
    'local',
  );
  assert.deepEqual(res.items, ['[4]', '[5]', '[6]']);
});
