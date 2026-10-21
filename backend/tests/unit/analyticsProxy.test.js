process.env.JWT_SECRET ||= 'analytics-proxy-unit-test-secret-with-at-least-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getWaitPredictions, isPredictionPayload } = require('../../src/services/analyticsProxyService');
const { publicPrediction, modelEvidence } = require('../../src/routes/analytics.routes');

function payload(overrides = {}) {
  return {
    '1': 0, '2': 6, '3': 18, '4': 32,
    visit_estimates: [{ queue_id: 19, tier: 4, estimated_wait_minutes: 24 }],
    model: 'queue-workload-estimate',
    model_version: 'queue-workload-3.1.0',
    estimate_quality: 'OBSERVATION_BASED',
    service_time_basis: 'median of operational call-to-discharge intervals',
    service_history_samples: 35,
    staffed_doctors: 3,
    degraded: false,
    provenance_mode: 'OPERATIONAL',
    limitations: ['Planning estimate only.'],
    generated_at: '2026-10-21T10:00:00.000Z',
    ...overrides
  };
}

test('analytics proxy authenticates service-to-service calls and validates data', async () => {
  let urlSeen = '';
  let optionsSeen;
  const result = await getWaitPredictions({
    analyticsUrl: 'http://analytics.internal:5001',
    internalToken: 'test-token',
    fetchImpl: async (url, options) => {
      urlSeen = url;
      optionsSeen = options;
      return { ok: true, status: 200, json: async () => payload() };
    }
  });

  assert.equal(urlSeen, 'http://analytics.internal:5001/api/predict');
  assert.equal(optionsSeen.headers['X-Internal-Service-Token'], 'test-token');
  assert.equal(result.model_version, 'queue-workload-3.1.0');
  assert.equal(result.service_history_samples, 35);
  assert.equal(result.degraded, false);
  assert.deepEqual(result.visit_estimates, [{ queue_id: 19, tier: 4, estimated_wait_minutes: 24 }]);
});

test('analytics proxy fails closed when no internal token is configured', async () => {
  let called = false;
  const result = await getWaitPredictions({
    analyticsUrl: 'http://analytics.internal:5001',
    internalToken: '',
    fetchImpl: async () => { called = true; return { ok: true, json: async () => payload() }; }
  });

  assert.equal(called, false);
  assert.equal(result.degraded, true);
  assert.equal(result['1'], null);
});

test('malformed response or network failure returns unavailable, not a numeric zero', async () => {
  const invalid = await getWaitPredictions({
    internalToken: 'test-token',
    fetchImpl: async () => ({ ok: true, json: async () => payload({ '3': 900 }) })
  });
  assert.equal(invalid.degraded, true);
  assert.equal(invalid['1'], null);

  const failed = await getWaitPredictions({
    internalToken: 'test-token',
    fetchImpl: async () => { throw new Error('local failure'); }
  });
  assert.equal(failed.degraded, true);
  assert.equal(failed['4'], null);
  assert.equal(failed.limitations.some(item => item.includes('local failure')), false);
});

test('healthy data requires numeric tier estimates but degraded data may use null', () => {
  assert.equal(isPredictionPayload(payload()), true);
  assert.equal(isPredictionPayload(payload({ '2': null })), false);
  assert.equal(isPredictionPayload(payload({ '1': null, '2': null, '3': null, '4': null, degraded: true })), true);
});

test('public response strips internal staffing, model evidence and queue identifiers', () => {
  const result = publicPrediction(payload());
  assert.equal(result.estimate_basis, 'OBSERVED_TIMINGS');
  assert.equal(Object.hasOwn(result, 'model_version'), false);
  assert.equal(Object.hasOwn(result, 'staffed_doctors'), false);
  assert.equal(Object.hasOwn(result, 'service_history_samples'), false);
  assert.equal(Object.hasOwn(result, 'visit_estimates'), false);
  assert.deepEqual(result.warnings, []);
});

test('public response reports limited, fallback and unavailable estimate bases', () => {
  assert.equal(publicPrediction(payload({ estimate_quality: 'LIMITED_OBSERVATIONS' })).estimate_basis, 'LIMITED_OBSERVATIONS');
  assert.equal(publicPrediction(payload({ estimate_quality: 'DEFAULT_ASSUMPTION' })).estimate_basis, 'FALLBACK_ASSUMPTION');
  const unavailable = publicPrediction(payload({ '1': null, '2': null, '3': null, '4': null, degraded: true, estimate_quality: 'UNAVAILABLE' }));
  assert.equal(unavailable.estimate_basis, 'UNAVAILABLE');
  assert.deepEqual(unavailable.warnings, ['Wait estimates are currently unavailable.']);
});



test('administrator model evidence omits internal per-visit queue identifiers', () => {
  const result = modelEvidence(payload());

  assert.equal(result.model_version, 'queue-workload-3.1.0');
  assert.equal(Object.hasOwn(result, 'visit_estimates'), false);
});
