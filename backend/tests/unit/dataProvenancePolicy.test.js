const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDataProvenancePolicy, queueVisibilityPredicate } = require('../../src/config/dataProvenancePolicy');

test('defaults production deployments to operational provenance', () => {
  const policy = resolveDataProvenancePolicy({ nodeEnv: 'production' });
  assert.equal(policy.mode, 'OPERATIONAL');
  assert.equal(policy.source, 'ENVIRONMENT_DEFAULT');
  assert.equal(policy.productionGuarded, true);
});

test('defaults development and test environments to synthetic test provenance', () => {
  for (const nodeEnv of ['development', 'test', 'staging', '']) {
    const policy = resolveDataProvenancePolicy({ nodeEnv });
    assert.equal(policy.mode, 'SYNTHETIC_TEST', nodeEnv || 'empty environment');
    assert.equal(policy.source, 'ENVIRONMENT_DEFAULT');
  }
});

test('accepts an explicit allow-listed mode in non-production', () => {
  assert.equal(resolveDataProvenancePolicy({
    nodeEnv: 'development',
    configuredMode: ' demo '
  }).mode, 'DEMO');
  assert.equal(resolveDataProvenancePolicy({
    nodeEnv: 'test',
    configuredMode: 'OPERATIONAL'
  }).mode, 'OPERATIONAL');
});

test('rejects unsupported and user-input-like policy values', () => {
  for (const configuredMode of ['UNCLASSIFIED', 'true', 'production', 'SYNTHETIC', '']) {
    if (configuredMode === '') continue;
    assert.throws(
      () => resolveDataProvenancePolicy({ nodeEnv: 'development', configuredMode }),
      /DATA_PROVENANCE_MODE/
    );
  }
});

test('production refuses synthetic/demo provenance even when an override is set', () => {
  assert.throws(
    () => resolveDataProvenancePolicy({ nodeEnv: 'production', configuredMode: 'SYNTHETIC_TEST' }),
    /Production requires DATA_PROVENANCE_MODE=OPERATIONAL/
  );
  assert.throws(
    () => resolveDataProvenancePolicy({
      nodeEnv: 'production',
      configuredMode: 'DEMO',
      allowNonOperationalInProduction: 'true'
    }),
    /Production requires DATA_PROVENANCE_MODE=OPERATIONAL/
  );
  assert.throws(
    () => resolveDataProvenancePolicy({
      nodeEnv: 'production',
      configuredMode: 'OPERATIONAL',
      allowNonOperationalInProduction: 'true'
    }),
    /ALLOW_NON_OPERATIONAL_PROVENANCE_MODE is prohibited in production/
  );
});

test('does not permit the production override to legitimise an invalid mode', () => {
  assert.throws(
    () => resolveDataProvenancePolicy({
      nodeEnv: 'production',
      configuredMode: 'UNCLASSIFIED',
      allowNonOperationalInProduction: true
    }),
    /DATA_PROVENANCE_MODE/
  );
});


test('queue visibility follows the server mode while retaining unclassified legacy visits for review', () => {
  assert.equal(
    queueVisibilityPredicate('OPERATIONAL', 'q'),
    "q.data_provenance NOT IN ('SYNTHETIC_TEST','DEMO')"
  );
  assert.equal(
    queueVisibilityPredicate('SYNTHETIC_TEST', 'q'),
    "q.data_provenance <> 'DEMO'"
  );
  assert.equal(
    queueVisibilityPredicate('DEMO', 'queue_entry'),
    "queue_entry.data_provenance <> 'SYNTHETIC_TEST'"
  );
});

test('test mode keeps operational and legacy records visible while hiding the other demo class', () => {
  const predicate = queueVisibilityPredicate('SYNTHETIC_TEST', 'q');
  assert.ok(predicate.includes("<> 'DEMO'"));
  assert.ok(!predicate.includes("= 'SYNTHETIC_TEST'"));
});

test('queue visibility rejects unsafe aliases and unsupported modes', () => {
  assert.throws(() => queueVisibilityPredicate('SYNTHETIC_TEST', 'q; DROP TABLE patients'));
  assert.throws(() => queueVisibilityPredicate('UNCLASSIFIED', 'q'));
});
