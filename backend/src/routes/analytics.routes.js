const express = require('express');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const { createRateLimiter } = require('../utils/rateLimit');
const { getWaitPredictions } = require('../services/analyticsProxyService');

const router = express.Router();

// Public-facing clients receive only the minimum aggregate estimate payload.
// Model samples, active queue counts, staffing provenance and detailed warnings
// are available through the administrator-protected /model endpoint.
const predictionLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
const modelLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: req => String(req.user?.staff_id || req.ip)
});

function publicPrediction(prediction) {
  const unavailable = prediction.degraded === true;
  const sampleCount = Number(prediction.model?.valid_service_samples || 0);
  return {
    '1': prediction['1'],
    '2': prediction['2'],
    '3': prediction['3'],
    '4': prediction['4'],
    degraded: unavailable,
    estimate_basis: unavailable ? 'UNAVAILABLE' : sampleCount >= 8 ? 'OBSERVED_TIMINGS' : 'FALLBACK_ASSUMPTION',
    generated_at: prediction.generated_at,
    warnings: unavailable ? ['Wait estimates are currently unavailable.'] : []
  };
}

router.get('/predict', predictionLimiter, async (_req, res, next) => {
  try {
    res.json(publicPrediction(await getWaitPredictions()));
  } catch (error) {
    next(error);
  }
});

router.get('/model', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), modelLimiter, async (_req, res, next) => {
  try {
    res.json(await getWaitPredictions());
  } catch (error) {
    next(error);
  }
});

module.exports = { router, publicPrediction };
