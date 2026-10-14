function createRateLimiter({ windowMs, max, keyGenerator = req => req.ip }) {
  const buckets = new Map();
  let lastCleanup = 0;

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      for (const [key, bucket] of buckets) if (now - bucket.start >= windowMs) buckets.delete(key);
      lastCleanup = now;
    }

    const key = keyGenerator(req);
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    next();
  };
}

module.exports = { createRateLimiter };
