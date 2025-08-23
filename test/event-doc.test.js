import test from 'node:test';
import assert from 'node:assert';
import { computeBasicStats } from '../dist/src/event-doc.js';

test('computeBasicStats counts words, chars, attachments', () => {
  const s1 = computeBasicStats('', 0);
  assert.deepStrictEqual(s1, { words: 0, chars: 0, attachments: 0 });

  const s2 = computeBasicStats('hello world', 2);
  assert.deepStrictEqual(s2, { words: 2, chars: 11, attachments: 2 });

  const s3 = computeBasicStats('  many\tspaces\nnewline  ', 1);
  // two spaces + 'many' + tab + 'spaces' + newline + 'newline' + two spaces
  assert.deepStrictEqual(s3, { words: 3, chars: 23, attachments: 1 });
});
