const test = require('node:test');
const assert = require('node:assert/strict');

const dbConfigured = Boolean(process.env.RUN_DB_TESTS && process.env.DB_NAME);

if (!dbConfigured) {
  test('integration suite is intentionally skipped without RUN_DB_TESTS=1 and database configuration', () => {
    assert.ok(true);
  });
} else {
  process.env.JWT_SECRET ||= 'integration-test-secret-with-at-least-32-characters-123';
  process.env.INTERNAL_SERVICE_TOKEN ||= 'integration-internal-token';
  process.env.SMS_ENABLED = 'false';
  const { httpServer } = require('../../src/app');
  let baseUrl;
  test.before(async () => {
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  test.after(async () => { await new Promise(resolve => httpServer.close(resolve)); });

  test('health endpoints are reachable', async () => {
    const response = await fetch(`${baseUrl}/api/health/live`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
  });

  test('protected queue endpoint refuses unauthenticated access', async () => {
    const response = await fetch(`${baseUrl}/api/queue`);
    assert.equal(response.status, 401);
  });
}
