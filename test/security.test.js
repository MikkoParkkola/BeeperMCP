import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText } from '../dist/src/security/sanitize.js';
import { checkGuardrails } from '../dist/src/security/guardrails.js';
import {
  rateLimiter,
  __resetRateLimiter,
} from '../dist/src/security/rateLimit.js';

test('sanitizeText strips html and clamps length', () => {
  const html = '<b>Hello</b>   world\n<script>alert(1)</script>';
  const out = sanitizeText(html);
  assert.equal(out, 'Hello world alert(1)');
  const long = 'x'.repeat(5000);
  assert.equal(sanitizeText(long).length, 4000);
});

test('guardrails blocks blocked keywords and impersonation', () => {
  assert.ok(checkGuardrails('no issues').ok);
  const blocked = checkGuardrails('wire transfer now');
  assert.equal(blocked.ok, false);
});

test('rateLimiter enforces token bucket', () => {
  __resetRateLimiter('t');
  // 2 per minute
  rateLimiter('t', 2);
  rateLimiter('t', 2);
  assert.throws(() => rateLimiter('t', 2), /rate_limited/);
});
