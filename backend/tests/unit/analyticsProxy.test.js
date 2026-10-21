process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-with-at-least-32-characters-123456';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getWaitPredictions } = require('../../src/services/analyticsProxyService');

function predictionPayload() {
  return {
    '1': 0,
    '2': 6,
    '3': 18,
    '4': 32,
    degraded: false,
    staffed_doctors: 3,
    generated_at: '2026-10-21T10:00:00.000Z',
    model: {
      version: 'pqfms-observed-queue-v2.0.0',
      method: 'TIER_ORDERED_QUEUE_SIMULATION',
      staffing_source: 'SHIFT_SCHEDULE'
    },
    warnings: []
  };
}

test('proxy sends the internal token server-to-server and preserves valid model evidence', async () => {
  let observedUrl = '';
  let observedOptions;
  const payload = predictionPayload();

  const result = await getWaitPredictions({
    analyticsUrl: 'http://analytics.internal:5001',
    internalToken: 'proxy-test-secret',
    fetchImpl: async (url, options) => {
      observedUrl = url;
      observedOptions = options;
      return { ok: true, status: 200, json: async () => payload };
    }
  });

  assert.equal(observedUrl, 'http://analytics.internal:5001/api/predict');
  assert.equal(observedOptions.headers['X-Internal-Service-Token'], 'proxy-test-secret');
  assert.equal(observedOptions.headers.Accept, 'application/json');
  assert.ok(observedOptions.signal);
  assert.deepEqual(result, payload);
});

test('missing internal token degrades safely without calling the analytics service', async () => {
  let called = false;

  const result = await getWaitPredictions({
    internalToken: '',
    fetchImpl: async () => { called = true; throw new Error('should not run'); }
  });

  assert.equal(called, false);
  assert.equal(result.degraded, true);
  assert.equal(result.model.method, 'UNAVAILABLE');
  assert.match(result.warnings[0], /internal service token/);
});

test('malformed analytics data is not passed through as a valid prediction', async () => {
  const result = await getWaitPredictions({
    internalToken: 'proxy-test-secret',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...predictionPayload(), '3': -4 })
    })
  });

  assert.equal(result.degraded, true);
  assert.equal(result.model.method, 'UNAVAILABLE');
  assert.match(result.warnings[0], /failed validation/);
});

test('internal timeout or network error returns a safe degraded response', async () => {
  const result = await getWaitPredictions({
    internalToken: 'proxy-test-secret',
    fetchImpl: async () => { throw new Error('sensitive internal network detail'); }
  });

  assert.equal(result.degraded, true);
  assert.equal(result['1'], 0);
  assert.match(result.warnings[0], /unreachable or timed out/);
  assert.equal(result.warnings.some(item => item.includes('sensitive internal network detail')), false);
});
