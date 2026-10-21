const express = require('express');
const { createRateLimiter } = require('../utils/rateLimit');
const { getWaitPredictions } = require('../services/analyticsProxyService');

const router = express.Router();

// Tier-level estimates expose aggregate operational information only. The
// endpoint is public for the waiting-room display and kiosk, with per-IP abuse
// protection; the internal analytics endpoint itself requires a service token.
const predictionLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

router.get('/predict', predictionLimiter, async (_req, res, next) => {
  try {
    res.json(await getWaitPredictions());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
