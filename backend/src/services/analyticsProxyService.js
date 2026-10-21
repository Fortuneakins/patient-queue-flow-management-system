'use strict';

const env = require('../config/env');

function unavailablePrediction(message) {
  return {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    degraded: true,
    staffed_doctors: 0,
    generated_at: new Date().toISOString(),
    model: { version: 'unavailable', method: 'UNAVAILABLE', staffing_source: 'UNKNOWN' },
    warnings: [message || 'Live wait estimates are unavailable. Queue operations continue normally.']
  };
}

function isPredictionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (typeof payload.degraded !== 'boolean') return false;
  if (!payload.model || typeof payload.model !== 'object' || Array.isArray(payload.model)) return false;
  if (!Array.isArray(payload.warnings)) return false;
  return [1, 2, 3, 4].every(tier => {
    const value = Number(payload[String(tier)]);
    return Number.isFinite(value) && value >= 0 && value <= 720;
  });
}

/**
 * Server-to-server proxy for the aggregate wait predictor. The browser never
 * receives the analytics URL or the internal service token.
 */
async function getWaitPredictions({
  fetchImpl = globalThis.fetch,
  analyticsUrl = env.ANALYTICS_URL,
  internalToken = env.INTERNAL_SERVICE_TOKEN,
  timeoutMs = 3000
} = {}) {
  if (!internalToken) {
    return unavailablePrediction('Wait-time analytics is not configured with an internal service token.');
  }
  if (typeof fetchImpl !== 'function') {
    return unavailablePrediction('Wait-time analytics is unavailable because server-side fetch is not supported.');
  }

  try {
    const url = new URL('/api/predict', analyticsUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return unavailablePrediction('Wait-time analytics is misconfigured; the service URL must use HTTP or HTTPS.');
    }

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Internal-Service-Token': internalToken
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response || !response.ok) {
      return unavailablePrediction('Wait-time analytics did not return a successful response. Queue operations continue normally.');
    }

    const payload = await response.json();
    if (!isPredictionPayload(payload)) {
      return unavailablePrediction('Wait-time analytics returned a response that failed validation. Queue operations continue normally.');
    }

    return {
      ...payload,
      '1': Number(payload['1']),
      '2': Number(payload['2']),
      '3': Number(payload['3']),
      '4': Number(payload['4']),
      staffed_doctors: Number.isFinite(Number(payload.staffed_doctors)) ? Number(payload.staffed_doctors) : 0,
      generated_at: typeof payload.generated_at === 'string' ? payload.generated_at : new Date().toISOString(),
      warnings: payload.warnings.filter(item => typeof item === 'string')
    };
  } catch (_error) {
    return unavailablePrediction('Wait-time analytics is unreachable or timed out. Queue operations continue normally.');
  }
}

module.exports = { getWaitPredictions, isPredictionPayload, unavailablePrediction };
