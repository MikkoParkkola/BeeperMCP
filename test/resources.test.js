import test from 'node:test';
import assert from 'node:assert/strict';
import { openLogDb, insertLog, insertMedia, queryLogs } from '../utils.js';
import { registerResources, handleResource } from '../dist/src/mcp/resources.js';

test('resources: history returns logs from SQLite', async () => {
  const db = openLogDb('.test-resources.db');
  insertLog(db, '!r', '2025-01-01T00:00:00.000Z', '[a]', undefined, 'e1');
  insertLog(db, '!r', '2025-01-02T00:00:00.000Z', '[b]', undefined, 'e2');
  registerResources(db);
  const res = await handleResource('im://matrix/room/!r/history', new URLSearchParams('limit=10'));
  assert.deepEqual(res.items, ['[a]', '[b]']);
});

test('resources: media returns metadata by eventId', async () => {
  const db = openLogDb('.test-resources-media.db');
  insertMedia(db, { eventId: 'e1', roomId: '!r', ts: '2025-01-01T00:00:00.000Z', file: 'f.bin', type: 'application/bin', size: 1 });
  registerResources(db);
  const res = await handleResource('im://matrix/media/e1/file', new URLSearchParams());
  assert.equal(res.file, 'f.bin');
});
