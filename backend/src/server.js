const { httpServer } = require('./app');
const { pool } = require('./db/pool');
const env = require('./config/env');

async function assertProductionDatabaseSafety() {
  if (env.NODE_ENV !== 'production') return;
  const ledger = await pool.query("SELECT to_regclass('public.pqfms_schema_migrations') AS table_name");
  if (!ledger.rows[0]?.table_name) {
    throw new Error('Production startup blocked: tracked schema migration ledger is missing. Run the reviewed database migration procedure first.');
  }
  const schemaVersion = await pool.query(
    "SELECT 1 FROM pqfms_schema_migrations WHERE filename = $1",
    ['008_backfill_reviewed_provenance_sources.sql']
  );
  if (schemaVersion.rowCount !== 1) {
    throw new Error('Production startup blocked: schema migration 008 is not recorded. Run the tracked migration command and review the output.');
  }
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
