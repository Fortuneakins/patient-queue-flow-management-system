const test = require('node:test');
const assert = require('node:assert/strict');

const dbConfigured = Boolean(process.env.RUN_DB_TESTS && process.env.DB_NAME);
if (!dbConfigured) {
  test('continuity integration suite requires RUN_DB_TESTS=1 and PostgreSQL', { skip: true }, () => {});
} else {
  process.env.JWT_SECRET ||= 'integration-test-secret-with-at-least-32-characters-123';
  process.env.INTERNAL_SERVICE_TOKEN ||= 'integration-internal-token';
  process.env.SMS_ENABLED = 'false';

  const { httpServer } = require('../../src/app');
  const { pool } = require('../../src/db/pool');
  let baseUrl;
  let listening = false;

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const response = await fetch(baseUrl + path, { ...options, headers });
    const kind = response.headers.get('content-type') || '';
    const body = kind.includes('application/json') ? await response.json() : null;
    return { response, body };
  }
  const auth = token => ({ Authorization: 'Bearer ' + token });

  async function login(username) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: 'DemoPass2026!' })
    });
    assert.equal(result.response.status, 200, 'test login failed for ' + username);
    return result.body;
  }

  test.before(async () => {
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    listening = true;
    baseUrl = 'http://127.0.0.1:' + httpServer.address().port;
  });

  test.after(async () => {
    if (listening) await new Promise(resolve => httpServer.close(resolve));
    await pool.end();
  });

  test('synthetic continuity recovery is authenticated, reproducible, persisted and privacy-scoped', async t => {
    const admin = await login('admin_demo');
    const reception = await login('reception_demo');

    await t.test('continuity endpoints are admin-only', async () => {
      const forbiddenRun = await request('/api/intelligence/continuity/run', {
        method: 'POST',
        headers: auth(reception.token),
        body: JSON.stringify({ seed: 42, outage_minutes: 60 })
      });
      assert.equal(forbiddenRun.response.status, 403);
      const forbiddenList = await request('/api/intelligence/continuity/runs', { headers: auth(reception.token) });
      assert.equal(forbiddenList.response.status, 403);
    });

    await t.test('invalid scenario inputs are rejected', async () => {
      const invalid = await request('/api/intelligence/continuity/run', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ scenario_code: 'REAL_PATIENT_IMPORT', seed: 42, outage_minutes: 60 })
      });
      assert.equal(invalid.response.status, 400);
    });

    let created;
    await t.test('a synthetic recovery run returns discrepancies without patient data', async () => {
      const result = await request('/api/intelligence/continuity/run', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ seed: 6789, outage_minutes: 60 })
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.body));
      assert.equal(result.body.source_scope, 'SYNTHETIC_ONLY');
      assert.equal(result.body.seed, 6789);
      assert.ok(result.body.continuity_run_id);
      assert.ok(result.body.summary.reconstructed_visit_count > 0);
      assert.ok(result.body.anomalies.some(item => item.type === 'INVALID_TRANSITION'));
      assert.equal(JSON.stringify(result.body).includes('identification_number'), false);
      assert.equal(JSON.stringify(result.body).includes('patient_id'), false);
      created = result.body;
    });

    await t.test('saved run can be retrieved and its event is audited', async () => {
      const history = await request('/api/intelligence/continuity/runs?limit=10', { headers: auth(admin.token) });
      assert.equal(history.response.status, 200);
      const persisted = history.body.find(run => Number(run.continuity_run_id) === Number(created.continuity_run_id));
      assert.ok(persisted);
      assert.equal(persisted.output.engine_version, created.engine_version);
      assert.equal(persisted.output.summary.discrepancy_count, created.summary.discrepancy_count);
      const events = await request('/api/intelligence/events?event_type=CONTINUITY_SCENARIO_RUN&limit=20', { headers: auth(admin.token) });
      assert.equal(events.response.status, 200);
      assert.ok(events.body.some(event => String(event.entity_id) === String(created.continuity_run_id)));
    });
  });
}
