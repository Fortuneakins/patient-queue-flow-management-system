const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../../src/utils/rateLimit');

function fakeResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('rate limiter caps a single identity and allows a different identity', () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 2,
    keyGenerator: req => String(req.user.staff_id)
  });
  let passed = 0;
  function send(staffId) {
    const req = { user: { staff_id: staffId }, ip: '127.0.0.1' };
    const res = fakeResponse();
    limiter(req, res, () => { passed += 1; });
    return res;
  }

  const first = send(12);
  const second = send(12);
  const third = send(12);
  const otherStaff = send(13);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.headers['X-RateLimit-Limit'], '2');
  assert.equal(second.headers['X-RateLimit-Remaining'], '0');
  assert.equal(third.statusCode, 429);
  assert.deepEqual(third.body, { error: 'Too many requests. Please try again later.' });
  assert.equal(otherStaff.statusCode, 200);
  assert.equal(passed, 3);
});


test('caps unique client keys without evicting active budgets or growing memory', () => {
  let now = 1000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 10, maxKeys: 2, now: () => now });
  let passed = 0;
  const next = () => { passed += 1; };

  limiter({ ip: '192.0.2.1' }, fakeResponse(), next);
  limiter({ ip: '192.0.2.2' }, fakeResponse(), next);
  const response = fakeResponse();
  limiter({ ip: '192.0.2.3' }, response, next);

  assert.equal(passed, 2);
  assert.equal(response.statusCode, 429);
  assert.match(response.body.error, /capacity is temporarily exhausted/);
  assert.ok(Number(response.headers['Retry-After']) > 0);
});

test('expired keys are cleared to allow new clients once the window has elapsed', () => {
  let now = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, maxKeys: 1, now: () => now });
  let passed = 0;
  const next = () => { passed += 1; };

  limiter({ ip: '192.0.2.1' }, fakeResponse(), next);
  now = 2000;
  const response = fakeResponse();
  limiter({ ip: '192.0.2.2' }, response, next);
  assert.equal(response.statusCode, 200);
  assert.equal(passed, 2);
});

test('rejects invalid limiter settings at construction time', () => {
  assert.throws(() => createRateLimiter({ windowMs: 0, max: 10 }), /windowMs/);
  assert.throws(() => createRateLimiter({ windowMs: 1000, max: 0 }), /max must/);
  assert.throws(() => createRateLimiter({ windowMs: 1000, max: 10, maxKeys: 0 }), /maxKeys/);
});
