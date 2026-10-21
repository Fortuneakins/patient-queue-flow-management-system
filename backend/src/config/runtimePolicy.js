const { URL } = require('node:url');

function asBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function isPlaceholderSecret(value) {
  return /REPLACE[_ -]?WITH|GENERATED[_ -]?BY|PLACEHOLDER|YOUR[_ -]|CHANGE[_ -]?ME|EXAMPLE[_ -]?SECRET|CI[_ -]?SECRET/i.test(String(value || ''));
}

function parseTrustProxyHops(value) {
  const normalized = String(value ?? '0').trim().toLowerCase();
  if (normalized === '' || normalized === 'false') return false;
  if (/^\d+$/.test(normalized) && Number.isSafeInteger(Number(normalized))) {
    return Number(normalized);
  }
  throw new Error('TRUST_PROXY_HOPS must be a non-negative integer or false; do not trust all proxies.');
}

function validateProductionConfig(input = {}) {
  const nodeEnv = String(input.nodeEnv || 'development').trim().toLowerCase();
  if (nodeEnv !== 'production') return { production: false };

  const jwtSecret = String(input.jwtSecret || '');
  const internalToken = String(input.internalServiceToken || '');
  if (jwtSecret.length < 48 || isPlaceholderSecret(jwtSecret)) {
    throw new Error('Production requires a unique JWT_SECRET of at least 48 characters, provisioned through a secrets manager.');
  }
  if (internalToken.length < 32 || isPlaceholderSecret(internalToken)) {
    throw new Error('Production requires an independent INTERNAL_SERVICE_TOKEN of at least 32 characters.');
  }
  if (jwtSecret === internalToken) {
    throw new Error('JWT_SECRET and INTERNAL_SERVICE_TOKEN must be different secrets.');
  }
  const databasePassword = String(input.databasePassword || '').trim();
  const databaseUrl = String(input.databaseUrl || '').trim();
  if (!databaseUrl && !databasePassword) {
    throw new Error('Production requires a database password or DATABASE_URL.');
  }
  if (databasePassword && isPlaceholderSecret(databasePassword)) {
    throw new Error('Production database credentials cannot use a placeholder secret.');
  }
  if (databaseUrl) {
    let parsedDatabaseUrl;
    try { parsedDatabaseUrl = new URL(databaseUrl); } catch (_) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) || !parsedDatabaseUrl.hostname) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
    if (!parsedDatabaseUrl.username || !parsedDatabaseUrl.password || isPlaceholderSecret(decodeURIComponent(parsedDatabaseUrl.password))) {
      throw new Error('DATABASE_URL must contain non-placeholder database credentials.');
    }
    const configuredSslMode = parsedDatabaseUrl.searchParams.get('sslmode');
    if (configuredSslMode && !['require', 'verify-ca', 'verify-full'].includes(configuredSslMode.toLowerCase())) {
      throw new Error('DATABASE_URL cannot override verified PostgreSQL TLS with a weaker sslmode.');
    }
  }
  if (input.trustProxyHops !== undefined && input.trustProxyHops !== false
    && (!Number.isSafeInteger(input.trustProxyHops) || input.trustProxyHops < 0)) {
    throw new Error('Production TRUST_PROXY_HOPS must be a non-negative integer; do not trust all proxies.');
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

module.exports = { asBoolean, isPlaceholderSecret, parseTrustProxyHops, validateProductionConfig };
