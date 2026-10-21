const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginAttemptLimiter } = require('../../src/utils/loginAttemptLimiter');

test('throttles repeated failures for the same account and IP', () => {
  const limiter = createLoginAttemptLimiter({ now: () => 1000, maxFailuresPerAccount: 2 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = limiter.consume('192.0.2.1', 'admin');
    assert.equal(result.allowed, true);
    limiter.recordFailure(result.accountKey);
  }
  assert.equal(limiter.consume('192.0.2.1', 'ADMIN').allowed, false);
});

test('clears account failure count after a successful login without resetting IP budget', () => {
  const limiter = createLoginAttemptLimiter({ now: () => 1000, maxFailuresPerAccount: 1, maxAttemptsPerIp: 4 });
  const first = limiter.consume('192.0.2.2', 'reception');
  limiter.recordFailure(first.accountKey);
  assert.equal(limiter.consume('192.0.2.2', 'reception').allowed, false);
  limiter.clearFailures(first.accountKey);
  assert.equal(limiter.consume('192.0.2.2', 'reception').allowed, true);
});

test('throttles high-volume attempts across rotating usernames from a single IP', () => {
  const limiter = createLoginAttemptLimiter({ now: () => 1000, maxAttemptsPerIp: 3 });
  assert.equal(limiter.consume('192.0.2.3', 'user-a').allowed, true);
  assert.equal(limiter.consume('192.0.2.3', 'user-b').allowed, true);
  assert.equal(limiter.consume('192.0.2.3', 'user-c').allowed, true);
  const blocked = limiter.consume('192.0.2.3', 'user-d');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'ip');
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('expires rate buckets and bounds memory during high-cardinality attempts', () => {
  let now = 1000;
  const limiter = createLoginAttemptLimiter({ now: () => now, maxKeys: 3, cleanupIntervalMs: 0 });
  for (let index = 0; index < 10; index += 1) limiter.consume(`192.0.2.${index}`, `user-${index}`);
  assert.ok(limiter.getStats().accountKeys <= 3);
  assert.ok(limiter.getStats().ipKeys <= 3);
  now += 16 * 60 * 1000;
  limiter.consume('192.0.2.50', 'new-user');
  assert.ok(limiter.getStats().accountKeys <= 2);
  assert.ok(limiter.getStats().ipKeys <= 2);
});
