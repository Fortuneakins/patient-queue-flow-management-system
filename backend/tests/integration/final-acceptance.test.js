const test = require('node:test');
const assert = require('node:assert/strict');

const dbConfigured = Boolean(process.env.RUN_DB_TESTS && process.env.DB_NAME);

if (!dbConfigured) {
  test('final acceptance integration suite requires RUN_DB_TESTS=1 and PostgreSQL', { skip: true }, () => {});
} else {
  process.env.JWT_SECRET ||= 'integration-test-secret-with-at-least-32-characters-123';
  process.env.INTERNAL_SERVICE_TOKEN ||= 'integration-internal-token';
  process.env.SMS_ENABLED = 'false';

  const { httpServer } = require('../../src/app');
  const { query, pool } = require('../../src/db/pool');

  let baseUrl;
  const tokens = {};
  const createdPatientIds = [];
  const createdShiftIds = [];
  const createdStaffIds = [];

  function passportId(suffix = '') {
    return `TEST${Date.now().toString().slice(-8)}${suffix}`.slice(0, 15);
  }

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    return { response, body };
  }

  async function login(username, password = 'DemoPass2026!') {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.body)}`);
    return result.body;
  }

  function auth(token) {
    return { Authorization: `Bearer ${token}` };
  }

  test.before(async () => {
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  test.after(async () => {
    for (const patientId of createdPatientIds) {
      await query('DELETE FROM queue_entries WHERE patient_id = $1', [patientId]);
      await query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
    }
    for (const shiftId of createdShiftIds) await query('DELETE FROM shifts WHERE shift_id = $1', [shiftId]);
    for (const staffId of createdStaffIds) {
  // Remove login events for this test-created account only.
  await query('DELETE FROM login_events WHERE staff_id = $1', [staffId]);

  // Remove the disposable account created by this test run.
  await query('DELETE FROM clinic_staff WHERE staff_id = $1', [staffId]);
}
    await new Promise(resolve => httpServer.close(resolve));
    await pool.end();
  });

  test('final release acceptance flow, security boundaries and integrity guarantees', async t => {
    const admin = await login('admin_demo');
    const reception = await login('reception_demo');
    const nurse = await login('nurse_demo');
    const doctor = await login('doctor_demo');
    tokens.admin = admin.token;
    tokens.reception = reception.token;
    tokens.nurse = nurse.token;
    tokens.doctor = doctor.token;

    await t.test('public endpoints expose only intended operational data', async () => {
      const queue = await request('/api/queue/public');
      assert.equal(queue.response.status, 200);
      assert.deepEqual(Object.keys(queue.body).sort(), ['now_serving', 'updated_at', 'waiting_counts'].sort());
      assert.deepEqual(Object.keys(queue.body.waiting_counts).sort(), ['1', '2', '3', '4']);

      const unknown = await request('/api/patients/verify/DOESNOTEXIST');
      assert.equal(unknown.response.status, 404);
    });

    const patientPayload = {
      identification_type: 'PASSPORT',
      identification_number: passportId('A'),
      full_name: 'Integration Patient A',
      date_of_birth: '1998-05-12',
      contact_no: '0821234501'
    };
    const patient = await request('/api/patients', {
      method: 'POST',
      headers: auth(tokens.reception),
      body: JSON.stringify(patientPayload)
    });
    assert.equal(patient.response.status, 201);
    createdPatientIds.push(patient.body.patient_id);

    await t.test('patient registration enforces uniqueness and privacy-safe verification', async () => {
      const duplicate = await request('/api/patients', {
        method: 'POST',
        headers: auth(tokens.reception),
        body: JSON.stringify(patientPayload)
      });
      assert.equal(duplicate.response.status, 409);

      const verified = await request(`/api/patients/verify/${patientPayload.identification_number}`);
      assert.equal(verified.response.status, 200);
      assert.deepEqual(Object.keys(verified.body), ['first_name']);
      assert.equal(verified.body.first_name, 'Integration');
    });

    const secondPayload = {
      ...patientPayload,
      identification_number: passportId('B'),
      full_name: 'Integration Patient B'
    };
    const second = await request('/api/patients', {
      method: 'POST', headers: auth(tokens.reception), body: JSON.stringify(secondPayload)
    });
    assert.equal(second.response.status, 201);
    createdPatientIds.push(second.body.patient_id);

    await t.test('kiosk check-in is sequential and protected against duplicate active visits', async () => {
     const concurrentCheckIns = 8;

const results = await Promise.all(
  Array.from({ length: concurrentCheckIns }, () =>
    request('/api/queue/check-in', {
      method: 'POST',
      body: JSON.stringify({
        identification_number: patientPayload.identification_number,
        symptoms: 'Headache and fatigue'
      })
    })
  )
);

const created = results.filter(r => r.response.status === 201);
const conflicts = results.filter(r => r.response.status === 409);

assert.equal(created.length, 1, 'exactly one concurrent check-in should succeed');
assert.equal(
  conflicts.length,
  concurrentCheckIns - 1,
  'all other concurrent check-ins should be rejected as duplicates'
);
assert.match(created[0].body.ticket_number, /^TKT-\d{4}$/);

      const secondVisit = await request('/api/queue/check-in', {
        method: 'POST',
        body: JSON.stringify({ identification_number: secondPayload.identification_number, symptoms: 'Cough' })
      });
      assert.equal(secondVisit.response.status, 201);
      assert.notEqual(secondVisit.body.ticket_number, created[0].body.ticket_number);

      const invalid = await request('/api/queue/check-in', {
        method: 'POST',
        body: JSON.stringify({ identification_number: patientPayload.identification_number, symptoms: '' })
      });
      assert.equal(invalid.response.status, 400);
    });

    const queueAfterCheckIn = await request('/api/queue', { headers: auth(tokens.nurse) });
    assert.equal(queueAfterCheckIn.response.status, 200);
    const testVisit = queueAfterCheckIn.body.find(row => row.patient_id === createdPatientIds[0]);
    const secondVisitRow = queueAfterCheckIn.body.find(row => row.patient_id === createdPatientIds[1]);
    assert.ok(testVisit?.queue_id);
    assert.ok(secondVisitRow?.queue_id);

    await t.test('role boundaries are enforced by the API', async () => {
      const receptionQueue = await request('/api/queue', { headers: auth(tokens.reception) });
      assert.equal(receptionQueue.response.status, 403);

      const nurseCall = await request(`/api/queue/${testVisit.queue_id}/call`, {
        method: 'PUT', headers: auth(tokens.nurse), body: '{}'
      });
      assert.equal(nurseCall.response.status, 403);

      const nurseNotes = await request(`/api/queue/${testVisit.queue_id}/notes`, {
        method: 'PUT', headers: auth(tokens.nurse), body: JSON.stringify({ doctor_notes: 'nope' })
      });
      assert.equal(nurseNotes.response.status, 403);
    });

    await t.test('triage enforces tier range, visit state and actor attribution', async () => {
      const invalid = await request(`/api/queue/${testVisit.queue_id}/priority`, {
        method: 'PUT', headers: auth(tokens.nurse), body: JSON.stringify({ priority_level: 5 })
      });
      assert.equal(invalid.response.status, 400);

      const triaged = await request(`/api/queue/${testVisit.queue_id}/priority`, {
        method: 'PUT', headers: auth(tokens.nurse), body: JSON.stringify({ priority_level: 2 })
      });
      assert.equal(triaged.response.status, 200);
      assert.equal(triaged.body.priority_level, 2);
      assert.equal(triaged.body.triaged_by_staff_id, nurse.staff_id);
      assert.ok(triaged.body.triaged_at);
    });

    await t.test('queue ordering respects effective tier then arrival time', async () => {
      const queue = await request('/api/queue', { headers: auth(tokens.nurse) });
      const ids = queue.body.map(row => row.queue_id);
      const indexTriaged = ids.indexOf(testVisit.queue_id);
      const indexUnassessed = ids.indexOf(secondVisitRow.queue_id);
      assert.ok(indexTriaged >= 0 && indexUnassessed >= 0);
      assert.ok(indexTriaged < indexUnassessed, 'tier 2 visit should precede unassessed tier 4 visit');
    });

    await t.test('doctor lifecycle is concurrency-safe and isolates SMS failure', async () => {
      const calls = await Promise.all([
        request(`/api/queue/${testVisit.queue_id}/call`, { method: 'PUT', headers: auth(tokens.doctor), body: '{}' }),
        request(`/api/queue/${testVisit.queue_id}/call`, { method: 'PUT', headers: auth(tokens.doctor), body: '{}' })
      ]);
      const success = calls.filter(r => r.response.status === 200);
      const conflicts = calls.filter(r => r.response.status === 409);
      assert.equal(success.length, 1);
      assert.equal(conflicts.length, 1);
      assert.equal(success[0].body.status, 'In-Consultation');
      assert.equal(success[0].body.called_by_staff_id, doctor.staff_id);
      assert.ok(success[0].body.called_at);

      const notes = await request(`/api/queue/${testVisit.queue_id}/notes`, {
        method: 'PUT', headers: auth(tokens.doctor), body: JSON.stringify({ doctor_notes: 'Integration consultation note.' })
      });
      assert.equal(notes.response.status, 200);

      const discharged = await request(`/api/queue/${testVisit.queue_id}/discharge`, {
        method: 'PUT', headers: auth(tokens.doctor), body: '{}'
      });
      assert.equal(discharged.response.status, 200);
      assert.equal(discharged.body.status, 'Discharged');
      assert.equal(discharged.body.discharged_by_staff_id, doctor.staff_id);
      assert.ok(discharged.body.discharged_at);

      const notesAfter = await request(`/api/queue/${testVisit.queue_id}/notes`, {
        method: 'PUT', headers: auth(tokens.doctor), body: JSON.stringify({ doctor_notes: 'tamper' })
      });
      assert.equal(notesAfter.response.status, 409);
    });

    await t.test('history applies Doctor-only note visibility', async () => {
      const doctorHistory = await request(`/api/history?identification_number=${encodeURIComponent(patientPayload.identification_number)}`, { headers: auth(tokens.doctor) });
      assert.equal(doctorHistory.response.status, 200);
      assert.equal(doctorHistory.body.length, 1);
      assert.equal(doctorHistory.body[0].doctor_notes, 'Integration consultation note.');

      const nurseHistory = await request(`/api/history?identification_number=${encodeURIComponent(patientPayload.identification_number)}`, { headers: auth(tokens.nurse) });
      assert.equal(nurseHistory.response.status, 200);
      assert.equal(nurseHistory.body.length, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(nurseHistory.body[0], 'doctor_notes'), false);
    });

    await t.test('shift overlap is rejected at the database boundary', async () => {
      const created = await request('/api/shifts', {
        method: 'POST', headers: auth(tokens.admin),
        body: JSON.stringify({ staff_id: nurse.staff_id, shift_date: '2030-01-02', start_time: '08:00', end_time: '12:00' })
      });
      assert.equal(created.response.status, 201);
      createdShiftIds.push(created.body.shift_id);

      const overlap = await request('/api/shifts', {
        method: 'POST', headers: auth(tokens.admin),
        body: JSON.stringify({ staff_id: nurse.staff_id, shift_date: '2030-01-02', start_time: '11:00', end_time: '13:00' })
      });
      assert.equal(overlap.response.status, 409);
    });

    await t.test('account deactivation invalidates a previously issued token', async () => {
      const temp = await request('/api/auth/register', {
        method: 'POST', headers: auth(tokens.admin),
        body: JSON.stringify({ username: `temp_${Date.now()}`, password: 'TempPass2026!', role: 'NURSE' })
      });
      assert.equal(temp.response.status, 201);
      createdStaffIds.push(temp.body.staff.staff_id);
      const username = temp.body.staff.username;

      const firstLogin = await login(username, 'TempPass2026!');
      const changed = await request('/api/auth/change-password', {
        method: 'PUT', headers: auth(firstLogin.token),
        body: JSON.stringify({ current_password: 'TempPass2026!', new_password: 'TempPass2026!x' })
      });
      assert.equal(changed.response.status, 200);
      const ready = await login(username, 'TempPass2026!x');

      const before = await request('/api/history/overview', { headers: auth(ready.token) });
      assert.equal(before.response.status, 200);

      const target = temp.body.staff.staff_id;
      const deactivated = await request(`/api/staff/${target}/status`, {
        method: 'PUT', headers: auth(tokens.admin), body: JSON.stringify({ is_active: false })
      });
      assert.equal(deactivated.response.status, 200);

      const after = await request('/api/history/overview', { headers: auth(ready.token) });
      assert.equal(after.response.status, 401);
    });

    await t.test('permissions take effect on the next sign-in', async () => {
      const grant = await request(`/api/staff/${reception.staff_id}/permissions`, {
        method: 'PUT', headers: auth(tokens.admin), body: JSON.stringify({ permission: 'VIEW_STAFF_DIRECTORY', grant: true })
      });
      assert.equal(grant.response.status, 200);

      const oldToken = await request('/api/staff', { headers: auth(tokens.reception) });
      assert.equal(oldToken.response.status, 403);

      const refreshedReception = await login('reception_demo');
      const newToken = await request('/api/staff', { headers: auth(refreshedReception.token) });
      assert.equal(newToken.response.status, 200);

      const revoke = await request(`/api/staff/${reception.staff_id}/permissions`, {
        method: 'PUT', headers: auth(tokens.admin), body: JSON.stringify({ permission: 'VIEW_STAFF_DIRECTORY', grant: false })
      });
      assert.equal(revoke.response.status, 200);

      const currentToken = await request('/api/staff', { headers: auth(refreshedReception.token) });
      assert.equal(currentToken.response.status, 200);
      const nextLogin = await login('reception_demo');
      const nextToken = await request('/api/staff', { headers: auth(nextLogin.token) });
      assert.equal(nextToken.response.status, 403);
    });

    await t.test('internal service endpoint requires its service token', async () => {
      const rejected = await request('/api/shifts/on-duty');
      assert.equal(rejected.response.status, 401);
      const allowed = await request('/api/shifts/on-duty', { headers: { 'X-Internal-Service-Token': process.env.INTERNAL_SERVICE_TOKEN } });
      assert.equal(allowed.response.status, 200);
      assert.equal(typeof allowed.body.on_duty, 'number');
    });
  });
}
