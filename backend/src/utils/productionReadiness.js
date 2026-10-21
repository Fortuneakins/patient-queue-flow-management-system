const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function assertProductionDatabaseSafety({ nodeEnv, pool, migrationDirectory }) {
  if (String(nodeEnv || 'development').toLowerCase() !== 'production') {
    return { checked: false, reason: 'NON_PRODUCTION' };
  }
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Production startup blocked: database readiness could not be checked.');
  }

  const directory = migrationDirectory || path.resolve(__dirname, '../../../db/migrations');
  const filenames = fs.readdirSync(directory)
    .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (!filenames.length) {
    throw new Error('Production startup blocked: no versioned database migrations are present in the image.');
  }

  const ledger = await pool.query(
    'SELECT filename, sha256 FROM pqfms_schema_migrations ORDER BY filename'
  ).catch(() => {
    throw new Error('Production startup blocked: tracked schema migration ledger is missing or unavailable. Run the reviewed migration procedure first.');
  });
  const appliedByName = new Map(ledger.rows.map(row => [row.filename, String(row.sha256).trim()]));
  const expected = new Set(filenames);

  for (const filename of filenames) {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    if (appliedByName.get(filename) !== checksum(source)) {
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
  return { checked: true, migrationsVerified: filenames.length, demoAccounts: 0 };
}

module.exports = { assertProductionDatabaseSafety, checksum };
