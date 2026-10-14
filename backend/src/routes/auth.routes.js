const express = require('express');
const authService = require('../services/authService');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const router = express.Router();
const loginBuckets = new Map();

function recordLoginFailure(req, res, next) {
  const key = `${req.ip}|${String(req.body?.username || '').trim().toLowerCase()}`;
  const now = Date.now();
  const bucket = loginBuckets.get(key);
  if (!bucket || now - bucket.start >= 15 * 60 * 1000) {
    loginBuckets.set(key, { start: now, failures: 0 });
  }
  const current = loginBuckets.get(key);
  if (current.failures >= 5) return res.status(429).json({ error: 'Too many failed sign-in attempts. Please try again later.' });
  req.loginRateKey = key;
  next();
}

function markLoginFailure(req) {
  const current = loginBuckets.get(req.loginRateKey);
  if (current) current.failures += 1;
}

router.post('/login', recordLoginFailure, async (req, res, next) => {
  try {
    const result = await authService.login({ username: req.body?.username, password: req.body?.password, ipAddress: req.ip });
    if (!result.ok) {
      if (result.status === 401) markLoginFailure(req);
      return res.status(result.status).json({ error: result.error });
    }
    loginBuckets.delete(req.loginRateKey);
    res.json(result.data);
  } catch (error) { next(error); }
});

router.put('/change-password', authenticate, async (req, res, next) => {
  try {
    await authService.changePassword(req.user.staff_id, req.body?.current_password, req.body?.new_password);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) { next(error); }
});

router.post('/register', authenticate, requireReadyPassword, authorizeRoles('ADMIN'), async (req, res, next) => {
  try {
    const staff = await authService.createStaff(req.body || {});
    res.status(201).json({ message: 'Staff account created.', staff });
  } catch (error) { next(error); }
});

module.exports = router;
