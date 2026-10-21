const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertProductionDatabaseSafety, checksum } = require('../../src/utils/productionReadiness');

function temporaryMigrations(files = { '001_schema.sql': 'BEGIN; SELECT 1; COMMIT;', '002_feature.sql': 'BEGIN; SELECT 2; COMMIT;' }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pqfms-migrations-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content);
  return directory;
}

function fakePool(migrations, demoAccounts = 0) {
  return {
    async query(sql) {
      if (sql.includes('pqfms_schema_migrations')) return { rows: migrations };
      if (sql.includes('demo_accounts')) return { rows: [{ demo_accounts: demoAccounts }] };
      throw new Error('Unexpected SQL in production readiness test.');
    }
  };
}

test('does not impose production schema checks on development/test environments', async () => {
  const directory = temporaryMigrations();
  try {
    const result = await assertProductionDatabaseSafety({
      nodeEnv: 'test',
      migrationDirectory: directory,
      pool: { query: async () => { throw new Error('not called'); } }
    });
    assert.deepEqual(result, { checked: false, reason: 'NON_PRODUCTION' });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('accepts the exact migration ledger and an environment without demo accounts', async () => {
  const files = { '001_schema.sql': 'SELECT 1;', '002_feature.sql': 'SELECT 2;' };
  const directory = temporaryMigrations(files);
  const ledger = Object.entries(files).map(([filename, content]) => ({ filename, sha256: checksum(content) }));
  try {
    const result = await assertProductionDatabaseSafety({
      nodeEnv: 'production',
      migrationDirectory: directory,
      pool: fakePool(ledger)
    });
    assert.equal(result.checked, true);
    assert.equal(result.migrationsVerified, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('fails closed when the migration ledger is absent', async () => {
  const directory = temporaryMigrations();
  try {
    await assert.rejects(
      assertProductionDatabaseSafety({
        nodeEnv: 'production',
        migrationDirectory: directory,
        pool: { query: async () => { throw new Error('relation does not exist'); } }
      }),
      /migration ledger is missing or unavailable/
    );
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('fails closed when a migration is missing or has changed', async () => {
  const files = { '001_schema.sql': 'SELECT 1;', '002_feature.sql': 'SELECT 2;' };
  const directory = temporaryMigrations(files);
  try {
    await assert.rejects(
      assertProductionDatabaseSafety({
        nodeEnv: 'production',
        migrationDirectory: directory,
        pool: fakePool([{ filename: '001_schema.sql', sha256: checksum(files['001_schema.sql']) }])
      }),
      /002_feature.sql is not recorded/
    );
    await assert.rejects(
      assertProductionDatabaseSafety({
        nodeEnv: 'production',
        migrationDirectory: directory,
        pool: fakePool([
          { filename: '001_schema.sql', sha256: checksum('OLD SQL') },
          { filename: '002_feature.sql', sha256: checksum(files['002_feature.sql']) }
        ])
      }),
      /001_schema.sql is not recorded/
    );
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('fails closed when the database reports migration files absent from the release image', async () => {
  const files = { '001_schema.sql': 'SELECT 1;' };
  const directory = temporaryMigrations(files);
  try {
    await assert.rejects(
      assertProductionDatabaseSafety({
        nodeEnv: 'production',
        migrationDirectory: directory,
        pool: fakePool([
          { filename: '001_schema.sql', sha256: checksum(files['001_schema.sql']) },
          { filename: '999_untracked.sql', sha256: 'a'.repeat(64) }
        ])
      }),
      /migrations absent from this application image/
    );
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('fails closed when seeded demonstration accounts remain', async () => {
  const files = { '001_schema.sql': 'SELECT 1;' };
  const directory = temporaryMigrations(files);
  try {
    await assert.rejects(
      assertProductionDatabaseSafety({
        nodeEnv: 'production',
        migrationDirectory: directory,
        pool: fakePool([{ filename: '001_schema.sql', sha256: checksum(files['001_schema.sql']) }], 1)
      }),
      /demonstration accounts are present/
    );
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
