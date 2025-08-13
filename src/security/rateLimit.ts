const buckets = new Map<string, { tokens: number; last: number }>();

export function rateLimiter(name: string, ratePerMinute: number) {
  const now = Date.now();
  const bucket = buckets.get(name) ?? { tokens: ratePerMinute, last: now };
  const delta = (now - bucket.last) / 60000;
  bucket.tokens = Math.min(ratePerMinute, bucket.tokens + delta * ratePerMinute);
  bucket.last = now;
  if (bucket.tokens < 1) {
    buckets.set(name, bucket);
    throw new Error(`rate_limited:${name}`);
  }
  bucket.tokens -= 1;
  buckets.set(name, bucket);
}
