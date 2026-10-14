const express = require('express');
const { query } = require('../db/pool');
const router = express.Router();

router.get('/live', (req, res) => res.json({ status: 'ok', service: 'pqfms-api', timestamp: new Date().toISOString() }));
router.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ready', database: 'ok', timestamp: new Date().toISOString() });
  } catch (_error) {
    res.status(503).json({ status: 'not-ready', database: 'unavailable' });
  }
});
module.exports = router;
