/**
 * Best-effort per-instance rate limiter. Guards against a runaway loop or
 * abusive client hammering an endpoint from one signed-in account; it is not
 * a substitute for auth and won't coordinate across serverless instances,
 * but it's a real backstop with zero added infrastructure.
 */
const buckets = new Map();

/** @returns {boolean} true if the request is allowed, false if it should be rejected */
export function allowRequest(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// Periodically drop stale buckets so the Map doesn't grow unbounded on a long-lived instance.
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [key, bucket] of buckets) {
    if (bucket.windowStart < cutoff) buckets.delete(key);
  }
}, 5 * 60_000).unref?.();
