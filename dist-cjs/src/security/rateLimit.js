'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.rateLimiter = rateLimiter;
exports.__resetRateLimiter = __resetRateLimiter;
const buckets = new Map();
function rateLimiter(name, ratePerMinute) {
  const now = Date.now();
  const bucket = buckets.get(name) ?? { tokens: ratePerMinute, last: now };
  const delta = (now - bucket.last) / 60000;
  bucket.tokens = Math.min(
    ratePerMinute,
    bucket.tokens + delta * ratePerMinute,
  );
  bucket.last = now;
  if (bucket.tokens < 1) {
    buckets.set(name, bucket);
    throw new Error(`rate_limited:${name}`);
  }
  bucket.tokens -= 1;
  buckets.set(name, bucket);
}
// test helper
function __resetRateLimiter(name) {
  if (!name) buckets.clear();
  else buckets.delete(name);
}
