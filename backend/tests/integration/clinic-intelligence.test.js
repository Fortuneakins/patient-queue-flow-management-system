const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const dbConfigured = Boolean(process.env.RUN_DB_TESTS && process.env.DB_NAME);
if (!dbConfigured) {
  test('clinic intelligence integration suite requires RUN_DB_TESTS=1 and PostgreSQL', { skip: true }, () => {});
} else {
  process.env.JWT_SECRET ||= 'integration-test-secret-with-at-least-32-characters-123';
  process.env.INTERNAL_SERVICE_TOKEN ||= 'integration-internal-token';
  process.env.SMS_ENABLED = 'false';

  const { httpServer } = require('../../src/app');
  const { query, pool } = require('../../src/db/pool');
  let baseUrl;
  let listening = false;
  const patientIds = [];
  const queueIds = [];
  const referralIds = [];
  const resourceIds = [];
  const simulationIds = [];
  const forecastIds = [];
  const tokens = {};

  function passportId(suffix) { return `TEST${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}${suffix}`.slice(0, 15); }
  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const response = await fetch(baseUrl + path, { ...options, headers });
    const kind = response.headers.get('content-type') || '';
    const body = kind.includes('application/json') ? await response.json() : null;
    return { response, body };
  }
  const auth = token => ({ Authorization: 'Bearer ' + token });
  async function login(username) {
    const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password: 'DemoPass2026!' }) });
    assert.equal(result.response.status, 200, 'test login failed for ' + username);
    return result.body;
  }

  test.before(async () => {
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    listening = true;
    baseUrl = 'http://127.0.0.1:' + httpServer.address().port;
  });

  test.after(async () => {
    for (const referralId of referralIds) await query('DELETE FROM care_referrals WHERE referral_id=$1', [referralId]);
    for (const queueId of queueIds) await query('DELETE FROM queue_entries WHERE queue_id=$1', [queueId]);
    for (const patientId of patientIds) {
      await query('DELETE FROM patient_communications WHERE patient_id=$1', [patientId]);
      await query('DELETE FROM patient_contact_preferences WHERE patient_id=$1', [patientId]);
      await query('DELETE FROM patients WHERE patient_id=$1', [patientId]);
    }
    for (const resourceId of resourceIds) {
      await query('DELETE FROM offline_sync_receipts WHERE resource_id=$1', [resourceId]);
      await query('DELETE FROM clinic_resources WHERE resource_id=$1', [resourceId]);
    }
    for (const simulationId of simulationIds) await query('DELETE FROM flow_simulations WHERE simulation_id=$1', [simulationId]);
    for (const forecastId of forecastIds) await query('DELETE FROM flow_forecasts WHERE forecast_id=$1', [forecastId]);
    if (listening) await new Promise(resolve => httpServer.close(resolve));
    await pool.end();
  });

  test('clinic intelligence enforces access, tracks journeys, simulates operations and respects contact consent', async t => {
    tokens.admin = (await login('admin_demo')).token;
    tokens.reception = (await login('reception_demo')).token;
    tokens.nurse = (await login('nurse_demo')).token;
    tokens.doctor = (await login('doctor_demo')).token;

    await t.test('administrative endpoints enforce authentication and role boundaries', async () => {
      const anonymous = await request('/api/intelligence/overview');
      assert.equal(anonymous.response.status, 401);
      const reception = await request('/api/intelligence/overview', { headers: auth(tokens.reception) });
      assert.equal(reception.response.status, 403);
      const admin = await request('/api/intelligence/overview', { headers: auth(tokens.admin) });
      assert.equal(admin.response.status, 200);
      assert.equal(admin.body.model_version, 'flowtwin-1.0.0');

      const nursePathways = await request('/api/intelligence/pathways', { headers: auth(tokens.nurse) });
      assert.equal(nursePathways.response.status, 200);
      assert.ok(nursePathways.body.some(pathway => pathway.pathway_code === 'OPD_STANDARD'));
      const nurseVisits = await request('/api/intelligence/active-visits', { headers: auth(tokens.nurse) });
      assert.equal(nurseVisits.response.status, 200);
      assert.ok(Array.isArray(nurseVisits.body));
            const nurseResources = await request('/api/intelligence/resources', { headers: auth(tokens.nurse) });
      assert.equal(nurseResources.response.status, 200);
      const nurseReferrals = await request('/api/intelligence/referrals', { headers: auth(tokens.nurse) });
      assert.equal(nurseReferrals.response.status, 200);
      const nurseEventLog = await request('/api/intelligence/events', { headers: auth(tokens.nurse) });
      assert.equal(nurseEventLog.response.status, 403);
      const nurseCreateResource = await request('/api/intelligence/resources', {
        method: 'POST', headers: auth(tokens.nurse), body: JSON.stringify({ resource_code: 'DENIED', name: 'Denied resource', resource_type: 'ROOM' })
      });
      assert.equal(nurseCreateResource.response.status, 403);
      const nurseCreateReferral = await request('/api/intelligence/referrals', {
        method: 'POST', headers: auth(tokens.nurse), body: JSON.stringify({ patient_id: 1, referred_to: 'Denied', reason: 'Not authorised' })
      });
      assert.equal(nurseCreateReferral.response.status, 403);
      const doctorEditsConsent = await request('/api/intelligence/contact-preferences/1', {
        method: 'PUT', headers: auth(tokens.doctor), body: JSON.stringify({ preferred_channel: 'SMS', contact_consent: true, consent_confirmed: true })
      });
      assert.equal(doctorEditsConsent.response.status, 403);
      const nurseSimulation = await request('/api/intelligence/simulations', {
        method: 'POST', headers: auth(tokens.nurse), body: JSON.stringify({ horizon_minutes: 60 })
      });
      assert.equal(nurseSimulation.response.status, 403);
    });

    const patientPayload = {
      identification_type: 'PASSPORT', identification_number: passportId('A'),
      full_name: 'Synthetic Intelligence Patient', date_of_birth: '1998-05-12', contact_no: '+27821234501'
    };
    const createdPatient = await request('/api/patients', {
      method: 'POST', headers: auth(tokens.reception), body: JSON.stringify(patientPayload)
    });
    assert.equal(createdPatient.response.status, 201, JSON.stringify(createdPatient.body));
    const patientId = createdPatient.body.patient_id;
    patientIds.push(patientId);

    const checkedIn = await request('/api/queue/check-in', {
      method: 'POST', body: JSON.stringify({ identification_number: patientPayload.identification_number, symptoms: 'Synthetic test visit for pathway acceptance' })
    });
    assert.equal(checkedIn.response.status, 201, JSON.stringify(checkedIn.body));
    const queueId = checkedIn.body.queue_id;
    queueIds.push(queueId);
    assert.ok(checkedIn.body.care_pathway_id, 'a new visit should automatically receive the standard pathway');

    const journey = await request('/api/intelligence/journeys/' + queueId, { headers: auth(tokens.nurse) });
    assert.equal(journey.response.status, 200);
    assert.equal(journey.body.pathway.pathway_code, 'OPD_STANDARD');
    assert.equal(journey.body.stages[0].status, 'COMPLETED', 'identity/check-in stage is already complete');
    assert.equal(journey.body.stages[1].status, 'READY');
    const stages = journey.body.stages;

    await t.test('required pathway stages advance in order and require the assigned role', async () => {
      const wrongRole = await request('/api/intelligence/journeys/' + queueId + '/stages/' + stages[1].stage_id, {
        method: 'PATCH', headers: auth(tokens.doctor), body: JSON.stringify({ status: 'IN_PROGRESS' })
      });
      assert.equal(wrongRole.response.status, 403);
      const nurseStart = await request('/api/intelligence/journeys/' + queueId + '/stages/' + stages[1].stage_id, {
        method: 'PATCH', headers: auth(tokens.nurse), body: JSON.stringify({ status: 'IN_PROGRESS' })
      });
      assert.equal(nurseStart.response.status, 200);
      const nurseDone = await request('/api/intelligence/journeys/' + queueId + '/stages/' + stages[1].stage_id, {
        method: 'PATCH', headers: auth(tokens.nurse), body: JSON.stringify({ status: 'COMPLETED' })
      });
      assert.equal(nurseDone.response.status, 200);
      const consultationStage = (await request('/api/intelligence/journeys/' + queueId, { headers: auth(tokens.doctor) })).body.stages[2];
      assert.equal(consultationStage.status, 'READY');
      const doctorStart = await request('/api/intelligence/journeys/' + queueId + '/stages/' + consultationStage.stage_id, {
        method: 'PATCH', headers: auth(tokens.doctor), body: JSON.stringify({ status: 'IN_PROGRESS' })
      });
      assert.equal(doctorStart.response.status, 200);
      const doctorDone = await request('/api/intelligence/journeys/' + queueId + '/stages/' + consultationStage.stage_id, {
        method: 'PATCH', headers: auth(tokens.doctor), body: JSON.stringify({ status: 'COMPLETED' })
      });
      assert.equal(doctorDone.response.status, 200);
    });

    const resource = await request('/api/intelligence/resources', {
      method: 'POST', headers: auth(tokens.admin),
      body: JSON.stringify({ resource_code: 'TEST-' + Date.now(), name: 'Synthetic spare equipment', resource_type: 'EQUIPMENT', capacity: 1 })
    });
    assert.equal(resource.response.status, 201, JSON.stringify(resource.body));
    resourceIds.push(resource.body.resource_id);
    const unavailable = await request('/api/intelligence/resources/' + resource.body.resource_id + '/status', {
      method: 'PUT', headers: auth(tokens.admin), body: JSON.stringify({ status: 'UNAVAILABLE' })
    });
    assert.equal(unavailable.response.status, 200);
    const idempotencyKey = crypto.randomUUID();
    const syncBody = { operations: [{ idempotency_key: idempotencyKey, operation_type: 'RESOURCE_STATUS', resource_id: resource.body.resource_id, status: 'AVAILABLE' }] };
    const firstSync = await request('/api/intelligence/offline-sync', { method: 'POST', headers: auth(tokens.admin), body: JSON.stringify(syncBody) });
    assert.equal(firstSync.response.status, 200, JSON.stringify(firstSync.body));
    const replay = await request('/api/intelligence/offline-sync', { method: 'POST', headers: auth(tokens.admin), body: JSON.stringify(syncBody) });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.results[0].duplicate_replay, true);
    const reusedKey = await request('/api/intelligence/offline-sync', {
      method: 'POST', headers: auth(tokens.admin),
      body: JSON.stringify({ operations: [{ ...syncBody.operations[0], status: 'LIMITED' }] })
    });
    assert.equal(reusedKey.response.status, 409);

    const scenario = await request('/api/intelligence/simulations', {
      method: 'POST', headers: auth(tokens.admin),
      body: JSON.stringify({ name: 'CI demand shock', horizon_minutes: 60, extra_arrivals: 6, additional_stations: 1, station_loss: 0, doctor_delay_minutes: 0, seed: 117 })
    });
    assert.equal(scenario.response.status, 201, JSON.stringify(scenario.body));
    simulationIds.push(scenario.body.simulation_id);
    assert.equal(scenario.body.human_review_required, true);
    assert.equal(scenario.body.automatic_actions_taken, false);
    const lab = await request('/api/intelligence/synthetic-lab/run', {
      method: 'POST', headers: auth(tokens.admin),
      body: JSON.stringify({ replications: 3, hours: 4, arrivals_per_hour: 2, servers: 2, mean_service_minutes: 10, seed: 777 })
    });
    assert.equal(lab.response.status, 201, JSON.stringify(lab.body));
    simulationIds.push(lab.body.simulation_id);
    assert.equal(lab.body.summary.model_quality, 'SYNTHETIC_ONLY');

    const forecast = await request('/api/intelligence/forecasts', {
      method: 'POST', headers: auth(tokens.admin),
      body: JSON.stringify({ horizon_minutes: 60, tier_estimates: { 1: 5, 2: 10, 3: 15, 4: 20 } })
    });
    assert.equal(forecast.response.status, 201, JSON.stringify(forecast.body));
    forecastIds.push(forecast.body.forecast_id);
    const truth = await request('/api/intelligence/forecasts/truth', { headers: auth(tokens.admin) });
    assert.equal(truth.response.status, 200);
    assert.ok(Array.isArray(truth.body.forecasts));
    const fairness = await request('/api/intelligence/fairness', { headers: auth(tokens.admin) });
    assert.equal(fairness.response.status, 200);
    assert.equal(fairness.body.tiers.length, 4);

    const referral = await request('/api/intelligence/referrals', {
      method: 'POST', headers: auth(tokens.doctor),
      body: JSON.stringify({ patient_id: patientId, queue_id: queueId, referred_to: 'Synthetic partner service', reason: 'Integration test referral only' })
    });
    assert.equal(referral.response.status, 201, JSON.stringify(referral.body));
    referralIds.push(referral.body.referral_id);
    const ack = await request('/api/intelligence/referrals/' + referral.body.referral_id, {
      method: 'PATCH', headers: auth(tokens.doctor),
      body: JSON.stringify({ status: 'ACKNOWLEDGED', acknowledgement_note: 'Synthetic acknowledgement' })
    });
    assert.equal(ack.response.status, 200);
    const prefsWithoutConsent = await request('/api/intelligence/contact-preferences/' + patientId + '/send-update', {
      method: 'POST', headers: auth(tokens.reception), body: JSON.stringify({ template_code: 'SERVICE_DELAY' })
    });
    assert.equal(prefsWithoutConsent.response.status, 409);
    const savedPrefs = await request('/api/intelligence/contact-preferences/' + patientId, {
      method: 'PUT', headers: auth(tokens.reception),
      body: JSON.stringify({ preferred_language_code: 'en', preferred_channel: 'SMS', contact_consent: true, consent_confirmed: true, consent_method: 'STAFF_RECORDED', consent_version: 'test-v1' })
    });
    assert.equal(savedPrefs.response.status, 200);
    const message = await request('/api/intelligence/contact-preferences/' + patientId + '/send-update', {
      method: 'POST', headers: auth(tokens.reception), body: JSON.stringify({ template_code: 'SERVICE_DELAY' })
    });
    assert.equal(message.response.status, 200, JSON.stringify(message.body));
    assert.equal(message.body.delivery_status, 'SKIPPED', 'CI has SMS disabled; no provider message should be sent');

    const noEstimateMessage = await request('/api/intelligence/contact-preferences/' + patientId + '/send-update', {
      method: 'POST', headers: auth(tokens.reception),
      body: JSON.stringify({ template_code: 'WAIT_ESTIMATE', wait_minutes: 9999 })
    });
    assert.equal(noEstimateMessage.response.status, 200);
    assert.equal(noEstimateMessage.body.delivery_status, 'SKIPPED');
    assert.equal(noEstimateMessage.body.estimated_wait_minutes, null, 'the client-supplied wait must not be treated as a trusted estimate');

    const events = await request('/api/intelligence/events?limit=100', { headers: auth(tokens.admin) });
    assert.equal(events.response.status, 200);
    assert.ok(events.body.some(event => event.event_type === 'VISIT_CHECKED_IN'));
    assert.ok(events.body.some(event => event.event_type === 'FLOWTWIN_SIMULATION_RUN'));
    assert.ok(events.body.some(event => event.event_type === 'REFERRAL_CREATED'));
  });
}
