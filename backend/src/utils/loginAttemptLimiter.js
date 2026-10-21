const crypto = require('node:crypto');

function createLoginAttemptLimiter({
  windowMs = 15 * 60 * 1000,
  maxFailuresPerAccount = 5,
  maxAttemptsPerIp = 60,
  maxKeys = 10000,
  cleanupIntervalMs = 60 * 1000,
  now = Date.now
} = {}) {
  const accountBuckets = new Map();
  const ipBuckets = new Map();
  let lastCleanup = 0;

  function pruneMap(map, currentTime) {
    for (const [key, bucket] of map) {
      if (currentTime - bucket.start >= windowMs) map.delete(key);
    }
    // Bound memory under high-cardinality traffic. Map insertion order makes
    // this a deterministic oldest-entry eviction policy.
    while (map.size > maxKeys) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }

  function prune(currentTime) {
    if (currentTime - lastCleanup < cleanupIntervalMs) return;
    pruneMap(accountBuckets, currentTime);
    pruneMap(ipBuckets, currentTime);
    lastCleanup = currentTime;
  }

  function createBucket(map, key, currentTime) {
    let bucket = map.get(key);
    if (!bucket || currentTime - bucket.start >= windowMs) {
      bucket = { start: currentTime, attempts: 0, failures: 0 };
      map.delete(key);
      map.set(key, bucket);
    }
    return bucket;
  }

  function consume(ipAddress, username) {
    const currentTime = now();
    prune(currentTime);
    const ip = String(ipAddress || 'unknown').slice(0, 100);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const usernameHash = crypto.createHash('sha256').update(normalizedUsername).digest('hex');
    const accountKey = `${ip}|${usernameHash}`;

    const ipBucket = createBucket(ipBuckets, ip, currentTime);
    ipBucket.attempts += 1;
    if (ipBucket.attempts > maxAttemptsPerIp) {
      return { allowed: false, reason: 'ip', retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (currentTime - ipBucket.start)) / 1000)), accountKey };
    }

    const accountBucket = createBucket(accountBuckets, accountKey, currentTime);
    if (accountBucket.failures >= maxFailuresPerAccount) {
      return { allowed: false, reason: 'account', retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (currentTime - accountBucket.start)) / 1000)), accountKey };
    }
    accountBuckets.delete(accountKey);
    accountBuckets.set(accountKey, accountBucket);
    return { allowed: true, accountKey };
  }

  function recordFailure(accountKey) {
    const bucket = accountBuckets.get(accountKey);
    if (bucket) bucket.failures += 1;
  }

  function clearFailures(accountKey) {
    if (accountKey) accountBuckets.delete(accountKey);
  }

  return {
    consume,
    recordFailure,
    clearFailures,
    getStats: () => ({ accountKeys: accountBuckets.size, ipKeys: ipBuckets.size })
  };
}

module.exports = { createLoginAttemptLimiter };
