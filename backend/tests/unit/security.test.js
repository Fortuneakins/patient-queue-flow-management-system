process.env.JWT_SECRET = 'unit-test-secret-with-at-least-32-characters-123456';
process.env.INTERNAL_SERVICE_TOKEN = 'unit-internal-token';
process.env.SMS_ENABLED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createToken } = require('../../src/services/authService');
const env = require('../../src/config/env');

test('creates issuer- and audience-bound access tokens', () => {
  const token = createToken({
    staff_id: 7,
    username: 'doctor_demo',
    role: 'DOCTOR',
    extra_permissions: []
  });
  const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'pqfms', audience: 'pqfms-web' });
  assert.equal(decoded.staff_id, 7);
  assert.equal(decoded.role, 'DOCTOR');
  assert.equal(decoded.aud, 'pqfms-web');
  assert.equal(decoded.iss, 'pqfms');
});

test('rejects a token signed with the wrong secret', () => {
  const token = jwt.sign({ staff_id: 7 }, env.JWT_SECRET + '-wrong');
  assert.throws(() => jwt.verify(token, env.JWT_SECRET));
});
