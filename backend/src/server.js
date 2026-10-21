const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { httpServer } = require('./app');
const { pool } = require('./db/pool');
const env = require('./config/env');

const migrationDirectory = path.resolve(__dirname, '../../db/migrations');

function migrationChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function assertProductionDatabaseSafety() {
  if (env.NODE_ENV !== 'production') return;

  const migrationFiles = fs.readdirSync(migrationDirectory)
    .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (!migrationFiles.length) {
    throw new Error('Production startup blocked: no versioned database migrations are present in the image.');
  }

  const ledger = await pool.query(
    'SELECT filename, sha256 FROM pqfms_schema_migrations ORDER BY filename'
  ).catch(() => {
    throw new Error('Production startup blocked: tracked schema migration ledger is missing or unavailable. Run the reviewed migration procedure first.');
  });
  const appliedByName = new Map(ledger.rows.map(row => [row.filename, String(row.sha256).trim()]));
  const expected = new Set(migrationFiles);

  for (const filename of migrationFiles) {
    const source = fs.readFileSync(path.join(migrationDirectory, filename), 'utf8');
    const expectedChecksum = migrationChecksum(source);
    if (appliedByName.get(filename) !== expectedChecksum) {
      throw new Error(`Production startup blocked: migration ${filename} is not recorded with its current checksum. Run the tracked migration command and review the output.`);
    }
  }
  const unknownApplied = [...appliedByName.keys()].filter(filename => !expected.has(filename));
  if (unknownApplied.length) {
    throw new Error('Production startup blocked: database migration ledger contains migrations absent from this application image. Resolve release/schema drift before starting.');
  }

  const demoAccounts = await pool.query(
    "SELECT COUNT(*)::int AS demo_accounts FROM clinic_staff WHERE username = ANY($1::text[])",
    [['admin_demo', 'reception_demo', 'nurse_demo', 'doctor_demo']]
  );
  if (Number(demoAccounts.rows[0]?.demo_accounts || 0) > 0) {
    throw new Error('Production startup blocked: seeded demonstration accounts are present. Provision named staff accounts through the approved bootstrap process and remove demo accounts before deployment.');
  }
}

async function start() {
  await pool.query('SELECT 1');
  await assertProductionDatabaseSafety();
  httpServer.listen(env.PORT, () => console.log(`PQFMS API listening on port ${env.PORT} (${env.NODE_ENV})`));
}

start().catch(error => {
  // Do not log SQL text, connection strings or secret-bearing environment values.
  console.error('PQFMS API failed to start:', error.message);
  process.exit(1);
});
