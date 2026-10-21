const express = require('express');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const { createRateLimiter } = require('../utils/rateLimit');
const { getWaitPredictions } = require('../services/analyticsProxyService');

const router = express.Router();

const predictionLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
const modelLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: req => String(req.user?.staff_id || req.ip)
});

function modelEvidence(prediction) {
  const evidence = { ...prediction };
  delete evidence.visit_estimates;
  return evidence;
}

function publicPrediction(prediction) {
  const quality = prediction.estimate_quality;
  let estimateBasis = 'FALLBACK_ASSUMPTION';
  if (prediction.degraded) estimateBasis = 'UNAVAILABLE';
  else if (quality === 'OBSERVATION_BASED') estimateBasis = 'OBSERVED_TIMINGS';
  else if (quality === 'LIMITED_OBSERVATIONS') estimateBasis = 'LIMITED_OBSERVATIONS';
  else if (quality === 'UNAVAILABLE_NO_STAFF') estimateBasis = 'UNAVAILABLE';

  return {
    '1': prediction['1'],
    '2': prediction['2'],
    '3': prediction['3'],
    '4': prediction['4'],
    degraded: prediction.degraded,
    estimate_basis: estimateBasis,
    generated_at: prediction.generated_at,
    warnings: prediction.degraded ? ['Wait estimates are currently unavailable.'] : []
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
    res.json(modelEvidence(await getWaitPredictions()));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.publicPrediction = publicPrediction;
module.exports.modelEvidence = modelEvidence;
