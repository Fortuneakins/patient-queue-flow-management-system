const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

const dbConfigured = Boolean(process.env.RUN_DB_TESTS && process.env.DB_NAME);
if (!dbConfigured) {
  test('clinic intelligence integration suite requires RUN_DB_TESTS=1 and PostgreSQL', { skip: true }, () => {});
} else {
  process.env.JWT_SECRET ||= 'integration-test-secret-with-at-least-32-characters-123';
  process.env.INTERNAL_SERVICE_TOKEN ||= 'integration-internal-token';
  process.env.NODE_ENV ||= 'test';
  process.env.DATA_PROVENANCE_MODE ||= 'SYNTHETIC_TEST';
  process.env.SMS_ENABLED = 'false';

  let httpServer;
  let query;
  let pool;
  let analyticsServer;
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
    // This deterministic fixture preserves the production service-token
    // contract without making CI depend on the real analytics database query.
    analyticsServer = http.createServer(async (req, res) => {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (req.method !== 'GET' || pathname !== '/api/predict') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found.' }));
        return;
      }
      if (req.headers['x-internal-service-token'] !== process.env.INTERNAL_SERVICE_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required.' }));
        return;
      }
      try {
        // Use the same bounded visible queue snapshot shape as the predictor.
        // Individual fixture predictions intentionally differ from tier summary
        // estimates so the integration test can prove the ledger stores per-visit
        // values rather than copying the tier-level summary into every row.
        const snapshot = await query(
          "WITH visible_queue AS (" +
          "SELECT queue_id, status, COALESCE(priority_level,4)::int AS tier, queued_at " +
          "FROM queue_entries WHERE status IN ('Waiting','In-Consultation') " +
          "AND data_provenance <> 'DEMO' " +
          "ORDER BY COALESCE(priority_level,4), queued_at, queue_id LIMIT 1000) " +
          "SELECT queue_id, tier FROM visible_queue WHERE status='Waiting' ORDER BY tier, queue_id"
        );
        const visitEstimates = snapshot.rows.map(item => ({
          queue_id: Number(item.queue_id),
          tier: Number(item.tier),
          estimated_wait_minutes: ({ 1: 1, 2: 4, 3: 7, 4: 11 })[Number(item.tier)]
        }));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          '1': 2, '2': 5, '3': 10, '4': 15,
          model: 'queue-workload-estimate',
          model_version: 'pqfms-ci-analytics-fixture-v1',
          estimate_quality: 'OBSERVATION_BASED',
          service_time_basis: 'deterministic integration-test timing fixture',
          service_history_samples: 24,
          staffed_doctors: 2,
          waiting_visits: visitEstimates.length,
          active_consultations: 0,
          visit_estimates: visitEstimates,
          degraded: false,
          provenance_mode: 'SYNTHETIC_TEST',
          limitations: ['Deterministic integration-test fixture; not clinical evidence.'],
          generated_at: new Date().toISOString()
        }));
      } catch (_error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Analytics fixture failure.' }));
      }
    });
    await new Promise(resolve => analyticsServer.listen(0, '127.0.0.1', resolve));
    process.env.ANALYTICS_URL = 'http://127.0.0.1:' + analyticsServer.address().port;

    // Import after assigning ANALYTICS_URL because the configuration module is
    // evaluated once and the route/service dependencies retain that snapshot.
    ({ httpServer } = require('../../src/app'));
    ({ query, pool } = require('../../src/db/pool'));
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
    if (analyticsServer?.listening) await new Promise(resolve => analyticsServer.close(resolve));
    if (pool) await pool.end();
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

      const publicPrediction = await request('/api/analytics/predict');
      assert.equal(publicPrediction.response.status, 200);
      assert.equal(publicPrediction.body['1'], 2);
      assert.equal(publicPrediction.body.estimate_basis, 'OBSERVED_TIMINGS');
      assert.equal(Object.hasOwn(publicPrediction.body, 'model'), false);
      assert.equal(Object.hasOwn(publicPrediction.body, 'staffed_doctors'), false);

      const anonymousModel = await request('/api/analytics/model');
      assert.equal(anonymousModel.response.status, 401);
      const receptionModel = await request('/api/analytics/model', { headers: auth(tokens.reception) });
      assert.equal(receptionModel.response.status, 403);
      const adminModel = await request('/api/analytics/model', { headers: auth(tokens.admin) });
      assert.equal(adminModel.response.status, 200);
      assert.equal(adminModel.body.model_version, 'pqfms-ci-analytics-fixture-v1');
      assert.equal(adminModel.body.staffed_doctors, 2);
      assert.equal(adminModel.body.service_history_samples, 24);
      assert.equal(Object.hasOwn(adminModel.body, 'visit_estimates'), false);

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
      const adminProvenance = await request('/api/intelligence/data-provenance/queue-records', { headers: auth(tokens.admin) });
      assert.equal(adminProvenance.response.status, 200);
      assert.ok(Array.isArray(adminProvenance.body.records));
      assert.ok(adminProvenance.body.summary.UNCLASSIFIED >= 0);
      const nurseProvenance = await request('/api/intelligence/data-provenance/queue-records', { headers: auth(tokens.nurse) });
      assert.equal(nurseProvenance.response.status, 403);
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
    assert.equal(checkedIn.body.data_provenance, 'SYNTHETIC_TEST', 'non-production check-ins must receive the server-configured provenance automatically');
    assert.equal(checkedIn.body.data_provenance_source, 'SERVER_POLICY', 'automatic provenance source must be identifiable');
    const checkInEvent = await request('/api/intelligence/events?event_type=VISIT_CHECKED_IN&limit=20', { headers: auth(tokens.admin) });
    assert.equal(checkInEvent.response.status, 200);
    const automaticProvenanceEvent = checkInEvent.body.find(event => Number(event.entity_id) === Number(queueId));
    assert.equal(automaticProvenanceEvent.metadata.data_provenance, 'SYNTHETIC_TEST');
    assert.equal(automaticProvenanceEvent.metadata.data_provenance_source, 'SERVER_POLICY');

    const cannotHideActiveTestVisit = await request('/api/intelligence/data-provenance/queue-records/' + queueId, {
      method: 'PATCH', headers: auth(tokens.admin),
      body: JSON.stringify({ provenance: 'DEMO', reason: 'CI test must not reclassify an active visit.' })
    });
    assert.equal(cannotHideActiveTestVisit.response.status, 409, 'active visits must complete normally before being marked as test/demo data');

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
      // Deliberately try to inject false values and a fabricated model label.
      // The database ledger must capture the current server-side prediction.
      body: JSON.stringify({
        horizon_minutes: 60,
        tier_estimates: { 1: 999, 2: 998, 3: 997, 4: 996 },
        model_version: 'client-forged-model'
      })
    });
    assert.equal(forecast.response.status, 201, JSON.stringify(forecast.body));
    assert.equal(forecast.body.model_version, 'pqfms-ci-analytics-fixture-v1');
    assert.deepEqual(forecast.body.tier_estimates, { 1: 2, 2: 5, 3: 10, 4: 15 });
    forecastIds.push(forecast.body.forecast_id);
    const recordedSample = await query(
      'SELECT predicted_wait_minutes FROM flow_forecast_samples WHERE forecast_id=$1 AND queue_id=$2',
      [forecast.body.forecast_id, queueId]
    );
    assert.equal(recordedSample.rowCount, 1);
    const recordedTier = await query('SELECT COALESCE(priority_level,4)::int AS tier FROM queue_entries WHERE queue_id=$1', [queueId]);
    const perVisitExpected = ({ 1: 1, 2: 4, 3: 7, 4: 11 })[recordedTier.rows[0].tier];
    assert.equal(Number(recordedSample.rows[0].predicted_wait_minutes), perVisitExpected,
      'truth ledger should use the per-visit estimate, not the tier-level summary');

    // Model an observation that arrives after its declared horizon. The overall
    // MAE remains auditable, while the API must separately identify in-horizon
    // accuracy so an outlier is not silently treated as a representative sample.
    const delayedSample = await query(
      'UPDATE flow_forecast_samples SET actual_wait_minutes=$1, observed_at=NOW() WHERE forecast_id=$2 AND queue_id=$3 RETURNING sample_id',
      [75, forecast.body.forecast_id, queueId]
    );
    assert.equal(delayedSample.rowCount, 1, 'forecast should track the newly checked-in waiting visit');
    const truth = await request('/api/intelligence/forecasts/truth', { headers: auth(tokens.admin) });
    assert.equal(truth.response.status, 200);
    assert.ok(Array.isArray(truth.body.forecasts));
    const evaluatedForecast = truth.body.forecasts.find(item => Number(item.forecast_id) === Number(forecast.body.forecast_id));
    assert.ok(evaluatedForecast, 'newly recorded forecast should appear in truth ledger');
    assert.ok(Number(evaluatedForecast.tracked_samples) >= 1);
    assert.ok(Number(evaluatedForecast.observed_samples) >= 1);
    assert.equal(Number(evaluatedForecast.within_horizon_samples), 0, 'synthetic fixtures must not count as verified operational accuracy');
    assert.equal(Number(evaluatedForecast.out_of_horizon_samples), 0, 'synthetic observations must not be represented as operational errors');
    assert.equal(Number(evaluatedForecast.unclassified_observed_samples), 0);
    assert.equal(Number(evaluatedForecast.excluded_synthetic_observed_samples), 1);
    assert.equal(Number(evaluatedForecast.excluded_synthetic_out_of_horizon_samples), 1, 'the 75-minute synthetic observation must remain explicitly outside the 60-minute horizon');
    assert.equal(Number(evaluatedForecast.unclassified_out_of_horizon_samples), 0);
    assert.equal(evaluatedForecast.within_horizon_mean_absolute_error_minutes, null);
    assert.ok(Number(evaluatedForecast.mean_absolute_error_minutes) >= 0, 'all-sample MAE should remain available for audit');
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

    // Normal workflow state changes must preserve the provenance assigned by server policy.
    const callResponse = await request('/api/queue/' + queueId + '/call', {
      method: 'PUT', headers: auth(tokens.doctor), body: JSON.stringify({})
    });
    assert.equal(callResponse.response.status, 200, JSON.stringify(callResponse.body));
    const dischargeResponse = await request('/api/queue/' + queueId + '/discharge', {
      method: 'PUT', headers: auth(tokens.doctor), body: JSON.stringify({})
    });
    assert.equal(dischargeResponse.response.status, 200, JSON.stringify(dischargeResponse.body));
    const preservedProvenance = await query(
      'SELECT data_provenance, data_provenance_source FROM queue_entries WHERE queue_id=$1',
      [queueId]
    );
    assert.equal(preservedProvenance.rows[0].data_provenance, 'SYNTHETIC_TEST');
    assert.equal(preservedProvenance.rows[0].data_provenance_source, 'SERVER_POLICY');

    // Regression: P90 labelled queue-to-call must not include time from call to discharge.
    const doctor = await query("SELECT staff_id FROM clinic_staff WHERE username = 'doctor_demo' LIMIT 1");
    assert.ok(doctor.rows[0], 'doctor_demo must exist in integration seed data');
    await query(
      "UPDATE queue_entries SET status='Discharged', priority_level=2, " +
      "queued_at=NOW() - INTERVAL '60 minutes', called_by_staff_id=$2, called_at=NOW() - INTERVAL '45 minutes', " +
      "discharged_by_staff_id=$2, discharged_at=NOW() - INTERVAL '5 minutes' WHERE queue_id=$1",
      [queueId, doctor.rows[0].staff_id]
    );
    const explicitlyOperational = await request('/api/intelligence/data-provenance/queue-records/' + queueId, {
      method: 'PATCH', headers: auth(tokens.admin),
      body: JSON.stringify({ provenance: 'OPERATIONAL', reason: 'CI fixture explicitly marked operational to test verified metric inclusion.' })
    });
    assert.equal(explicitlyOperational.response.status, 200, JSON.stringify(explicitlyOperational.body));
    assert.equal(explicitlyOperational.body.data_provenance, 'OPERATIONAL');
    assert.equal(explicitlyOperational.body.data_provenance_source, 'ADMIN_REVIEW');
    const fairnessRegression = await request('/api/intelligence/fairness', { headers: auth(tokens.admin) });
    assert.equal(fairnessRegression.response.status, 200);
    const tierTwo = fairnessRegression.body.tiers.find(item => item.tier === 2);
    assert.ok(tierTwo, 'tier 2 metrics should be present');
    const expectedTierTwo = await query(
      "SELECT COUNT(*)::int AS sample_size, " +
      "ROUND(AVG(EXTRACT(EPOCH FROM (called_at - queued_at)) / 60.0)::numeric,1) AS mean_wait_minutes, " +
      "ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (called_at - queued_at)) / 60.0)::numeric,1) AS p90_queue_to_call_minutes, " +
      "ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (discharged_at - queued_at)) / 60.0)::numeric,1) AS p90_queue_to_discharge_minutes " +
      "FROM queue_entries WHERE status='Discharged' AND data_provenance='OPERATIONAL' AND COALESCE(priority_level,4)=2 " +
      "AND called_at IS NOT NULL AND called_at >= queued_at AND discharged_at >= NOW() - INTERVAL '30 days'"
    );
    assert.equal(tierTwo.sample_size, expectedTierTwo.rows[0].sample_size);
    assert.equal(Number(tierTwo.mean_wait_minutes), Number(expectedTierTwo.rows[0].mean_wait_minutes));
    assert.notEqual(
      Number(expectedTierTwo.rows[0].p90_queue_to_call_minutes),
      Number(expectedTierTwo.rows[0].p90_queue_to_discharge_minutes),
      'fixture must distinguish queue-to-call from queue-to-discharge duration'
    );
    assert.equal(
      Number(tierTwo.p90_wait_minutes),
      Number(expectedTierTwo.rows[0].p90_queue_to_call_minutes),
      'P90 must use called_at - queued_at, not discharged_at - queued_at'
    );

    const classifiedAsSynthetic = await request('/api/intelligence/data-provenance/queue-records/' + queueId, {
      method: 'PATCH', headers: auth(tokens.admin),
      body: JSON.stringify({ provenance: 'SYNTHETIC_TEST', reason: 'CI verifies synthetic records are excluded from operational history.' })
    });
    assert.equal(classifiedAsSynthetic.response.status, 200, JSON.stringify(classifiedAsSynthetic.body));
    assert.equal(classifiedAsSynthetic.body.data_provenance, 'SYNTHETIC_TEST');
    assert.equal(classifiedAsSynthetic.body.data_provenance_source, 'ADMIN_REVIEW');
    assert.equal(classifiedAsSynthetic.body.status, 'Discharged', 'provenance classification must not change visit status');
    assert.equal(Number(classifiedAsSynthetic.body.priority_level), 2, 'provenance classification must not change assigned tier');
    const filteredRecords = await request('/api/intelligence/data-provenance/queue-records?provenance=SYNTHETIC_TEST', { headers: auth(tokens.admin) });
    assert.equal(filteredRecords.response.status, 200);
    assert.ok(filteredRecords.body.records.some(item => Number(item.queue_id) === Number(queueId)));
    const fairnessAfterClassification = await request('/api/intelligence/fairness', { headers: auth(tokens.admin) });
    assert.equal(fairnessAfterClassification.response.status, 200);
    const syntheticTierTwo = fairnessAfterClassification.body.tiers.find(item => item.tier === 2);
    assert.ok(Number(syntheticTierTwo.excluded_synthetic_sample_size) >= 1);
    const provenanceEvents = await request('/api/intelligence/events?event_type=QUEUE_DATA_PROVENANCE_UPDATED&limit=20', { headers: auth(tokens.admin) });
    assert.equal(provenanceEvents.response.status, 200);
    assert.ok(provenanceEvents.body.some(event => Number(event.entity_id) === Number(queueId)));

    await t.test('role demotions and permission changes take effect without reissuing the JWT', async () => {
      const adminBefore = await query("SELECT staff_id, role, extra_permissions FROM clinic_staff WHERE username='admin_demo' LIMIT 1");
      assert.ok(adminBefore.rows[0], 'admin_demo must exist in integration seed data');
      const adminRecord = adminBefore.rows[0];
      try {
        await query("UPDATE clinic_staff SET role='RECEPTION' WHERE staff_id=$1", [adminRecord.staff_id]);
        const demotedAdmin = await request('/api/intelligence/overview', { headers: auth(tokens.admin) });
        assert.equal(demotedAdmin.response.status, 403, 'a role demotion must override the still-valid token role');
      } finally {
        await query("UPDATE clinic_staff SET role=$1 WHERE staff_id=$2", [adminRecord.role, adminRecord.staff_id]);
      }

      const receptionBefore = await query("SELECT staff_id, extra_permissions FROM clinic_staff WHERE username='reception_demo' LIMIT 1");
      assert.ok(receptionBefore.rows[0], 'reception_demo must exist in integration seed data');
      const receptionRecord = receptionBefore.rows[0];
      try {
        await query("UPDATE clinic_staff SET extra_permissions=ARRAY['VIEW_STAFF_DIRECTORY']::text[] WHERE staff_id=$1", [receptionRecord.staff_id]);
        const grantedWithoutRelogin = await request('/api/staff', { headers: auth(tokens.reception) });
        assert.equal(grantedWithoutRelogin.response.status, 200, 'current DB permissions must be applied immediately');
      } finally {
        await query("UPDATE clinic_staff SET extra_permissions=$1::text[] WHERE staff_id=$2", [receptionRecord.extra_permissions || [], receptionRecord.staff_id]);
      }
      const revokedWithoutRelogin = await request('/api/staff', { headers: auth(tokens.reception) });
      assert.equal(revokedWithoutRelogin.response.status, 403, 'permission removal must apply without waiting for token expiry');
    });
  });
}
