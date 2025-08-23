import test from 'node:test';
import assert from 'node:assert';

const mod = await import('../dist/src/mcp/tools/filters.js');

test('applyCommonFilters handles non-text media types', () => {
  const where = [];
  const args = [];
  const next = mod.applyCommonFilters(where, args, 1, {
    types: ['image', 'video'],
  });
  assert.ok(where.some((w) => w.includes('media_types && $1')));
  assert.deepStrictEqual(args[0], ['image', 'video']);
  assert.equal(next, 2);
});

test('applyCommonFilters handles text-only type', () => {
  const where = [];
  const args = [];
  const next = mod.applyCommonFilters(where, args, 3, { types: ['text'] });
  assert.ok(where.some((w) => w.includes('media_types IS NULL')));
  assert.equal(args.length, 0);
  assert.equal(next, 3);
});

test('applyCommonFilters handles mixed types and other filters', () => {
  const where = [];
  const args = [];
  const next = mod.applyCommonFilters(where, args, 5, {
    rooms: ['!r:hs'],
    participants: ['@u:hs'],
    lang: 'en',
    from: '2025-01-01T00:00:00Z',
    to: '2025-01-02T00:00:00Z',
    types: ['text', 'image'],
  });
  assert.ok(where[0].includes('room_id = ANY($5)'));
  assert.ok(where[1].includes('sender = ANY($6)'));
  assert.ok(where[2].includes('lang = $7'));
  assert.ok(where[3].includes('ts_utc >= $8'));
  assert.ok(where[4].includes('ts_utc <= $9'));
  assert.ok(where[5].includes('(media_types && $10)'));
  assert.equal(next, 11);
});
