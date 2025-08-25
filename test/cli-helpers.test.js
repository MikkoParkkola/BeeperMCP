import test from 'node:test';
import assert from 'node:assert/strict';
import { truncateHistory } from '../dist/src/cli/helpers.js';

function msg(role, content) {
  return { role, content };
}

test('truncateHistory respects maxMessages', () => {
  const h = Array.from({ length: 50 }, (_, i) => msg('user', String(i)));
  const out = truncateHistory(h, { maxMessages: 10, maxChars: 10000 });
  assert.equal(out.length, 10);
  assert.equal(out[0].content, '40');
  assert.equal(out[9].content, '49');
});

test('truncateHistory enforces maxChars from tail', () => {
  const h = [
    msg('user', 'a'.repeat(100)),
    msg('assistant', 'b'.repeat(100)),
    msg('user', 'c'.repeat(100)),
  ];
  const out = truncateHistory(h, { maxMessages: 10, maxChars: 150 });
  // Should keep from the tail: last messages that fit within 150 chars
  const headChars = out.map((m) => m.content[0]).join('');
  assert.ok(headChars.includes('c'));
  const total = out.reduce((s, m) => s + m.content.length, 0);
  assert.ok(total <= 150);
});
