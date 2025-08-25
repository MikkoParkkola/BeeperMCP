import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openLogDb, insertLog } from '../utils.js';
import {
  registerResources,
  handleResource,
} from '../dist/src/mcp/resources.js';

test('resources: history supports cursor pagination', async () => {
  const dbPath = `.test-resources-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  try {
    fs.unlinkSync(dbPath);
  } catch {}
  const db = openLogDb(dbPath);
  const base = Date.UTC(2025, 0, 1, 0, 0, 0);
  // 5 items at minute intervals
  const ts = (i) => new Date(base + i * 60_000).toISOString();
  insertLog(db, '!r', ts(0), 'A', undefined, 'e0');
  insertLog(db, '!r', ts(1), 'B', undefined, 'e1');
  insertLog(db, '!r', ts(2), 'C', undefined, 'e2');
  insertLog(db, '!r', ts(3), 'D', undefined, 'e3');
  insertLog(db, '!r', ts(4), 'E', undefined, 'e4');
  registerResources(db);
  // first page
  let res = await handleResource(
    'im://matrix/room/!r/history',
    new URLSearchParams('limit=2'),
    'local',
  );
  assert.deepEqual(res.items, ['A', 'B']);
  // next page using nextCursor
  res = await handleResource(
    'im://matrix/room/!r/history',
    new URLSearchParams(`limit=2&cursor=${encodeURIComponent(ts(1))}&dir=next`),
    'local',
  );
  assert.deepEqual(res.items, ['C', 'D']);
  // prev page from D cursor: should include items strictly before D (from A/B/C)
  res = await handleResource(
    'im://matrix/room/!r/history',
    new URLSearchParams(`limit=2&cursor=${encodeURIComponent(ts(3))}&dir=prev`),
    'local',
  );
  assert.ok(res.items.length >= 1 && res.items.length <= 2);
  assert.ok(res.items.every((it) => ['A', 'B', 'C'].includes(it)));
});
