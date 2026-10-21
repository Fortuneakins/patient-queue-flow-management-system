const { httpServer } = require('./app');
const { pool } = require('./db/pool');
const env = require('./config/env');

async function assertProductionDatabaseSafety() {
  if (env.NODE_ENV !== 'production') return;
  const result = await pool.query(
    "SELECT COUNT(*)::int AS demo_accounts FROM clinic_staff WHERE username = ANY($1::text[])",
    [['admin_demo', 'reception_demo', 'nurse_demo', 'doctor_demo']]
  );
  if (Number(result.rows[0]?.demo_accounts || 0) > 0) {
    throw new Error('Production startup blocked: seeded demonstration accounts are present. Provision named staff accounts through the approved bootstrap process and remove demo accounts before deployment.');
  }
}

async function start() {
  await pool.query('SELECT 1');
  await assertProductionDatabaseSafety();
  httpServer.listen(env.PORT, () => console.log(`PQFMS API listening on port ${env.PORT} (${env.NODE_ENV})`));
}

start().catch(error => {
  console.error('PQFMS API failed to start:', error.message);
  process.exit(1);
});
