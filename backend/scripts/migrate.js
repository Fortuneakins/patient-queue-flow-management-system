const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pool } = require('../src/db/pool');

const migrationDirectory = path.resolve(__dirname, '../../db/migrations');
const baselineRequested = process.argv.includes('--baseline-existing');
const baselineConfirmation = 'YES_I_VERIFIED_MIGRATIONS_001_008';

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function migrationFiles() {
  return fs.readdirSync(migrationDirectory)
    .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

async function baselineExistingSchema(client, files) {
  if (process.env.PQFMS_CONFIRM_BASELINE_REVIEWED !== baselineConfirmation) {
    throw new Error(
      'Existing database has no migration ledger. Baseline is destructive-risk-sensitive: inspect the schema/backup first, then set PQFMS_CONFIRM_BASELINE_REVIEWED=' + baselineConfirmation + ' and rerun with --baseline-existing.'
    );
  }
  const result = await client.query(`
    SELECT
      to_regclass('public.patients') IS NOT NULL AS has_patients,
      to_regclass('public.clinic_staff') IS NOT NULL AS has_staff,
      to_regclass('public.queue_entries') IS NOT NULL AS has_queue,
      to_regclass('public.operational_events') IS NOT NULL AS has_events,
      to_regclass('public.care_pathways') IS NOT NULL AS has_pathways,
      to_regclass('public.clinic_resources') IS NOT NULL AS has_resources,
      to_regclass('public.flow_simulations') IS NOT NULL AS has_simulations,
      to_regclass('public.flow_forecasts') IS NOT NULL AS has_forecasts,
      to_regclass('public.patient_communications') IS NOT NULL AS has_communications,
      to_regclass('public.continuity_runs') IS NOT NULL AS has_continuity,
      (SELECT COUNT(*)::int FROM information_schema.columns
       WHERE table_schema='public' AND table_name='queue_entries'
         AND column_name IN ('data_provenance','data_provenance_source','data_provenance_note','provenance_updated_by_staff_id','provenance_updated_at','care_pathway_id')) AS expected_queue_columns
  `);
  const schema = result.rows[0];
  if (Number(schema.expected_queue_columns) !== 6) {
    throw new Error('Existing queue schema does not have all six reviewed provenance/pathway columns. Do not baseline this database.');
  }
  const backfill = await client.query(`
    SELECT COUNT(*)::int AS unbackfilled_review_sources
    FROM queue_entries
    WHERE data_provenance_source = 'LEGACY_REVIEW_REQUIRED'
      AND provenance_updated_by_staff_id IS NOT NULL
      AND provenance_updated_at IS NOT NULL
  `);
  const requiredFlags = [
    'has_patients','has_staff','has_queue','has_events','has_pathways','has_resources',
    'has_simulations','has_forecasts','has_communications','has_continuity'
  ];
  const missing = requiredFlags.filter(key => !schema[key]);
  if (missing.length || Number(backfill.rows[0].unbackfilled_review_sources) !== 0) {
    throw new Error(
      'Existing schema does not match the reviewed baseline for migrations 001–008. Missing markers: ' +
      [...missing,
        ...(Number(backfill.rows[0].unbackfilled_review_sources) !== 0 ? ['review-source backfill is incomplete; apply migration 008 explicitly before baseline'] : [])
      ].join(', ') +
      '. Do not baseline this database; review its migration history first.'
    );
  }

  // Only mark the schema version that this baseline procedure explicitly knows.
  // Future migrations must remain pending and execute normally.
  const baselineFiles = files.filter(filename => Number(filename.slice(0, 3)) >= 1 && Number(filename.slice(0, 3)) <= 8);
  if (baselineFiles.length !== 8) {
    throw new Error('Safe baseline requires all eight reviewed migrations (001–008). Review and update the baseline procedure before continuing.');
  }
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pqfms_schema_migrations (
        filename VARCHAR(200) PRIMARY KEY,
        sha256 CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        applied_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER
      )
    `);
    for (const filename of baselineFiles) {
      const sql = fs.readFileSync(path.join(migrationDirectory, filename), 'utf8');
      await client.query(
        'INSERT INTO pqfms_schema_migrations (filename, sha256, applied_by) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
        [filename, checksum(sql), 'MANUALLY_REVIEWED_BASELINE']
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  console.log(`Baselined ${baselineFiles.length} reviewed migration files (001–008). No migration SQL was run.`);
}

async function main() {
  const files = migrationFiles();
  if (!files.length) throw new Error('No SQL migration files were found.');

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(1729010127)');
    const ledger = await client.query("SELECT to_regclass('public.pqfms_schema_migrations') AS table_name");
    const existingSchema = await client.query("SELECT to_regclass('public.patients') AS table_name");
    if (!ledger.rows[0].table_name) {
      if (existingSchema.rows[0].table_name) {
        if (!baselineRequested) {
          throw new Error('Existing schema has no pqfms_schema_migrations ledger. Back up and review it; if it is known to contain migrations 001–008, use the explicit --baseline-existing procedure in docs/PRODUCTION_DEPLOYMENT.md.');
        }
        await baselineExistingSchema(client, files);
      } else {
        await client.query(`
          CREATE TABLE pqfms_schema_migrations (
            filename VARCHAR(200) PRIMARY KEY,
            sha256 CHAR(64) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            applied_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER
          )
        `);
      }
    } else if (baselineRequested) {
      throw new Error('The migration ledger already exists; --baseline-existing is not applicable.');
    }

    for (const filename of files) {
      const source = fs.readFileSync(path.join(migrationDirectory, filename), 'utf8');
      const digest = checksum(source);
      const applied = await client.query(
        'SELECT sha256 FROM pqfms_schema_migrations WHERE filename=$1',
        [filename]
      );
      if (applied.rows[0]) {
        if (applied.rows[0].sha256.trim() !== digest) {
          throw new Error(`Applied migration ${filename} has changed. Create a new migration rather than editing an applied file.`);
        }
        console.log(`Already applied: ${filename}`);
        continue;
      }

      // Migration files own their BEGIN/COMMIT in source control. Strip only the
      // outer wrappers so the schema change and ledger record commit atomically.
      const sql = source
        .replace(/^\uFEFF?\s*BEGIN\s*;\s*/i, '')
        .replace(/\s*COMMIT\s*;\s*$/i, '');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO pqfms_schema_migrations (filename, sha256) VALUES ($1, $2)',
          [filename, digest]
        );
        await client.query('COMMIT');
        console.log(`Applied: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(1729010127)'); } catch (_) { /* best effort */ }
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
