const { URL } = require('node:url');

function asBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function validateProductionConfig(input = {}) {
  const nodeEnv = String(input.nodeEnv || 'development').trim().toLowerCase();
  if (nodeEnv !== 'production') return { production: false };

  const jwtSecret = String(input.jwtSecret || '');
  const internalToken = String(input.internalServiceToken || '');
  if (jwtSecret.length < 48 || /GENERATED_BY_SETUP_SCRIPT|change[-_ ]?me|example|ci-secret/i.test(jwtSecret)) {
    throw new Error('Production requires a unique JWT_SECRET of at least 48 characters, provisioned through a secrets manager.');
  }
  if (internalToken.length < 32 || /GENERATED_BY_SETUP_SCRIPT|change[-_ ]?me|example|ci-token/i.test(internalToken)) {
    throw new Error('Production requires an independent INTERNAL_SERVICE_TOKEN of at least 32 characters.');
  }
  if (jwtSecret === internalToken) {
    throw new Error('JWT_SECRET and INTERNAL_SERVICE_TOKEN must be different secrets.');
  }
  if (!input.databaseUrl && !String(input.databasePassword || '').trim()) {
    throw new Error('Production requires a database password or DATABASE_URL.');
  }
  if (input.databaseSsl !== true) {
    throw new Error('Production requires DB_SSL=true with certificate validation enabled.');
  }
  const origins = Array.isArray(input.corsOrigins) ? input.corsOrigins : [];
  if (!origins.length) throw new Error('Production requires at least one HTTPS CORS_ORIGIN.');
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch (_) {
      throw new Error('Every production CORS_ORIGIN must be a valid HTTPS origin.');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '')) {
      throw new Error('Every production CORS_ORIGIN must be a clean HTTPS origin without credentials or a path.');
    }
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) {
      throw new Error('Localhost is not a valid production CORS_ORIGIN.');
    }
  }
  if (asBoolean(input.allowNonOperationalProvenanceMode)) {
    throw new Error('Non-operational provenance overrides are prohibited in production.');
  }
  if (input.smsEnabled && (!input.twilioAccountSid || !input.twilioAuthToken || !input.twilioPhoneNumber)) {
    throw new Error('SMS_ENABLED=true requires all Twilio credentials in production.');
  }
  return { production: true, corsOrigins: origins.length };
}

module.exports = { asBoolean, validateProductionConfig };
