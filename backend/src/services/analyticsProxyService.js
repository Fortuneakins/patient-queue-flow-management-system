'use strict';

const env = require('../config/env');

function unavailablePrediction(message) {
  return {
    '1': null,
    '2': null,
    '3': null,
    '4': null,
    model: 'queue-workload-estimate',
    model_version: 'unavailable',
    estimate_quality: 'UNAVAILABLE',
    service_time_basis: 'No valid prediction is currently available.',
    service_history_samples: 0,
    staffed_doctors: 0,
    degraded: true,
    provenance_mode: env.DATA_PROVENANCE_MODE,
    limitations: [message || 'Wait estimates are unavailable. Queue operations continue normally.'],
    generated_at: new Date().toISOString()
  };
}

function isPredictionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (typeof payload.degraded !== 'boolean') return false;
  if (typeof payload.model !== 'string' || !payload.model.trim()) return false;
  if (typeof payload.model_version !== 'string' || !payload.model_version.trim()) return false;
  if (typeof payload.estimate_quality !== 'string' || !payload.estimate_quality.trim()) return false;

  for (let tier = 1; tier <= 4; tier += 1) {
    const value = payload[String(tier)];
    if (value === null || value === undefined) {
      if (payload.degraded) continue;
      return false;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 720) return false;
  }
  if (!payload.degraded && !Array.isArray(payload.visit_estimates)) return false;
  if (payload.visit_estimates !== undefined) {
    if (!Array.isArray(payload.visit_estimates) || payload.visit_estimates.length > 1000) return false;
    const seenQueueIds = new Set();
    for (const item of payload.visit_estimates) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const queueId = Number(item.queue_id);
      const tier = Number(item.tier);
      const wait = Number(item.estimated_wait_minutes);
      const baseline = Number(item.baseline_wait_minutes);
      const offset = Number(item.calibration_offset_minutes);
      if (!Number.isSafeInteger(queueId) || queueId < 1 || !Number.isInteger(tier) || tier < 1 || tier > 4) return false;
      if (!Number.isFinite(wait) || wait < 0 || wait > 720) return false;
      if (!Number.isFinite(baseline) || baseline < 0 || baseline > 720) return false;
      if (!Number.isFinite(offset) || offset < -30 || offset > 30 || seenQueueIds.has(queueId)) return false;
      seenQueueIds.add(queueId);
    }
  }
  return true;
}

/**
 * Server-to-server bridge to the private Flask analytics service. Internal
 * credentials and the analytics hostname never enter the browser response.
 * The prediction schema intentionally preserves null estimates during degraded
 * states; an unavailable wait is never coerced into a zero-minute wait.
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

    const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(250, Math.min(10000, Number(timeoutMs))) : 3000;
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Internal-Service-Token': internalToken
      },
      signal: AbortSignal.timeout(timeout)
    });

    if (!response || !response.ok) {
      return unavailablePrediction('Wait-time analytics did not return a successful response. Queue operations continue normally.');
    }

    const payload = await response.json();
    if (!isPredictionPayload(payload)) {
      return unavailablePrediction('Wait-time analytics returned a response that failed validation. Queue operations continue normally.');
    }

    const normalized = {
      ...payload,
      model: payload.model,
      model_version: payload.model_version,
      estimate_quality: payload.estimate_quality,
      service_time_basis: typeof payload.service_time_basis === 'string' ? payload.service_time_basis : 'Not reported',
      service_history_samples: Number.isSafeInteger(Number(payload.service_history_samples)) && Number(payload.service_history_samples) >= 0
        ? Number(payload.service_history_samples) : 0,
      staffed_doctors: Number.isFinite(Number(payload.staffed_doctors)) && Number(payload.staffed_doctors) >= 0
        ? Number(payload.staffed_doctors) : 0,
      degraded: payload.degraded,
      provenance_mode: typeof payload.provenance_mode === 'string' ? payload.provenance_mode : 'UNKNOWN',
      limitations: Array.isArray(payload.limitations)
        ? payload.limitations.filter(item => typeof item === 'string').slice(0, 20)
        : (typeof payload.reason === 'string' ? [payload.reason] : []),
      visit_estimates: Array.isArray(payload.visit_estimates) ? payload.visit_estimates.map(item => ({
        queue_id: Number(item.queue_id),
        tier: Number(item.tier),
        baseline_wait_minutes: Number(item.baseline_wait_minutes),
        calibration_offset_minutes: Number(item.calibration_offset_minutes),
        estimated_wait_minutes: Number(item.estimated_wait_minutes)
      })) : [],
      generated_at: typeof payload.generated_at === 'string' ? payload.generated_at : new Date().toISOString()
    };
    for (let tier = 1; tier <= 4; tier += 1) {
      const value = payload[String(tier)];
      normalized[String(tier)] = value === null || value === undefined ? null : Number(value);
    }
    return normalized;
  } catch (_error) {
    return unavailablePrediction('Wait-time analytics is unreachable or timed out. Queue operations continue normally.');
  }
}

module.exports = { getWaitPredictions, isPredictionPayload, unavailablePrediction };
