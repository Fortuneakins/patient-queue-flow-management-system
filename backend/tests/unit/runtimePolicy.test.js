const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig, parseTrustProxyHops } = require('../../src/config/runtimePolicy');

const validProductionConfig = {
  nodeEnv: 'production',
  jwtSecret: 'a'.repeat(56),
  internalServiceToken: 'b'.repeat(48),
  databaseUrl: '',
  databasePassword: 'unique-db-password',
  databaseSsl: true,
  corsOrigins: ['https://clinic.example.org'],
  allowNonOperationalProvenanceMode: false,
  smsEnabled: false,
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: ''
};

test('development does not require production infrastructure secrets', () => {
  assert.equal(validateProductionConfig({ nodeEnv: 'development' }).production, false);
});

test('accepts valid production-only infrastructure configuration', () => {
  assert.equal(validateProductionConfig(validProductionConfig).production, true);
});

test('rejects missing, weak, shared or placeholder production secrets', () => {
  for (const override of [
    { jwtSecret: 'short-secret' },
    { jwtSecret: 'GENERATED_BY_SETUP_SCRIPT'.padEnd(56, 'x') },
    { internalServiceToken: 'short' },
    { internalServiceToken: 'a'.repeat(56) },
    { internalServiceToken: 'ci-token-placeholder-value'.padEnd(40, 'x') }
  ]) {
    assert.throws(() => validateProductionConfig({ ...validProductionConfig, ...override }));
  }
});

test('requires validated database TLS and a database credential', () => {
  assert.throws(() => validateProductionConfig({ ...validProductionConfig, databaseSsl: false }), /DB_SSL=true/);
  assert.throws(() => validateProductionConfig({ ...validProductionConfig, databasePassword: '' }), /database password/);
});

test('requires public HTTPS CORS origins without localhost or URL paths', () => {
  for (const corsOrigins of [
    ['http://clinic.example.org'],
    ['http://localhost:5173'],
    ['https://clinic.example.org/admin'],
    [],
    ['not-a-url']
  ]) {
    assert.throws(() => validateProductionConfig({ ...validProductionConfig, corsOrigins }));
  }
});

test('prohibits production non-operational mode override', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    allowNonOperationalProvenanceMode: true
  }), /prohibited in production/);
});

test('requires complete Twilio settings if SMS is enabled', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    smsEnabled: true
  }), /Twilio credentials/);
});


test('rejects placeholder database credentials in production', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    databasePassword: 'REPLACE_WITH_DATABASE_SECRET'
  }), /cannot use a placeholder/);
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    databaseUrl: 'postgresql://pqfms:REPLACE_WITH_DATABASE_SECRET@db.example.org:5432/pqfms',
    databasePassword: ''
  }), /non-placeholder database credentials/);
});

test('rejects malformed production PostgreSQL URLs', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    databaseUrl: 'https://user:secret@db.example.org:5432/pqfms'
  }), /valid PostgreSQL connection URL/);
});


test('rejects a PostgreSQL URL that explicitly disables TLS', () => {
  assert.throws(() => validateProductionConfig({
    ...validProductionConfig,
    databaseUrl: 'postgresql://pqfms:unique-password@db.example.org:5432/pqfms?sslmode=disable',
    databasePassword: ''
  }), /cannot override verified PostgreSQL TLS/);
});


test('trust proxy parser requires a numeric hop count or explicit false', () => {
  assert.equal(parseTrustProxyHops('0'), 0);
  assert.equal(parseTrustProxyHops('2'), 2);
  assert.equal(parseTrustProxyHops('false'), false);
  assert.equal(parseTrustProxyHops(''), false);
  assert.throws(() => parseTrustProxyHops('true'), /do not trust all proxies/);
  assert.throws(() => parseTrustProxyHops('-1'), /non-negative integer/);
  assert.throws(() => parseTrustProxyHops('two'), /non-negative integer/);
});
