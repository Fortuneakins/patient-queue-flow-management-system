const express = require('express');
const authService = require('../services/authService');
const { authenticate, authorizeRoles, requireReadyPassword } = require('../middleware/authenticate');
const { createLoginAttemptLimiter } = require('../utils/loginAttemptLimiter');
const router = express.Router();
const loginLimiter = createLoginAttemptLimiter();

router.post('/login', async (req, res, next) => {
  const attempt = loginLimiter.consume(req.ip, req.body?.username);
  if (!attempt.allowed) {
    res.set('Retry-After', String(attempt.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait before trying again.' });
  }
  try {
    const result = await authService.login({ username: req.body?.username, password: req.body?.password, ipAddress: req.ip });
    if (!result.ok) {
      if (result.status === 401) loginLimiter.recordFailure(attempt.accountKey);
      return res.status(result.status).json({ error: result.error });
    }
    loginLimiter.clearFailures(attempt.accountKey);
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
