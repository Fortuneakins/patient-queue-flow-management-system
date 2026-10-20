const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDataProvenancePolicy } = require('../../src/config/dataProvenancePolicy');

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

test('requires an explicit safety acknowledgement to use non-operational provenance in production', () => {
  assert.throws(
    () => resolveDataProvenancePolicy({ nodeEnv: 'production', configuredMode: 'SYNTHETIC_TEST' }),
    /Production requires DATA_PROVENANCE_MODE=OPERATIONAL/
  );
  assert.equal(resolveDataProvenancePolicy({
    nodeEnv: 'production',
    configuredMode: 'DEMO',
    allowNonOperationalInProduction: 'true'
  }).mode, 'DEMO');
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
