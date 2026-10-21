function createRateLimiter({ windowMs, max, maxKeys = 10000, keyGenerator = req => req.ip, now = Date.now }) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError('windowMs must be a positive integer.');
  }
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new TypeError('max must be a positive integer.');
  }
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) {
    throw new TypeError('maxKeys must be a positive integer.');
  }

  const buckets = new Map();
  let lastCleanup = 0;
  const cleanupIntervalMs = Math.min(windowMs, 60_000);

  function prune(currentTime) {
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.start >= windowMs) buckets.delete(key);
    }
    lastCleanup = currentTime;
  }

  return (req, res, next) => {
    const currentTime = now();
    if (currentTime - lastCleanup >= cleanupIntervalMs) {
      prune(currentTime);
    }

    const key = String(keyGenerator(req) ?? 'unknown').slice(0, 200);
    let bucket = buckets.get(key);

    if (!bucket) {
      // Fail closed when the key store is full instead of allocating unbounded
      // memory or silently evicting an active client's rate budget.
      if (buckets.size >= maxKeys) {
        const nextCleanup = lastCleanup + cleanupIntervalMs;
        const retryAfter = Math.max(1, Math.ceil((nextCleanup - currentTime) / 1000));
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', '0');
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Rate-limit capacity is temporarily exhausted. Please try again later.' });
      }
      bucket = { start: currentTime, count: 0 };
      buckets.set(key, bucket);
    } else if (currentTime - bucket.start >= windowMs) {
      bucket = { start: currentTime, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.start + windowMs - currentTime) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

module.exports = { createRateLimiter };
