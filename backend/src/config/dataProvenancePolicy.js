const ALLOWED_DATA_PROVENANCE_MODES = Object.freeze(['OPERATIONAL', 'SYNTHETIC_TEST', 'DEMO']);

function asBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function resolveDataProvenancePolicy({
  nodeEnv = 'development',
  configuredMode = '',
  allowNonOperationalInProduction = false
} = {}) {
  const environment = String(nodeEnv || 'development').trim().toLowerCase();
  const requested = String(configuredMode || '').trim().toUpperCase();
  const mode = requested || (environment === 'production' ? 'OPERATIONAL' : 'SYNTHETIC_TEST');

  if (!ALLOWED_DATA_PROVENANCE_MODES.includes(mode)) {
    throw new Error(
      'DATA_PROVENANCE_MODE must be OPERATIONAL, SYNTHETIC_TEST or DEMO; received an unsupported value.'
    );
  }

  const acknowledgedNonOperationalProductionMode = asBoolean(allowNonOperationalInProduction);
  if (
    environment === 'production'
    && mode !== 'OPERATIONAL'
    && !acknowledgedNonOperationalProductionMode
  ) {
    throw new Error(
      'Production requires DATA_PROVENANCE_MODE=OPERATIONAL. To intentionally run a non-operational demonstration, set ALLOW_NON_OPERATIONAL_PROVENANCE_MODE=true explicitly.'
    );
  }

  return Object.freeze({
    mode,
    source: requested ? 'ENVIRONMENT_CONFIG' : 'ENVIRONMENT_DEFAULT',
    environment,
    allowedModes: ALLOWED_DATA_PROVENANCE_MODES,
    productionGuarded: environment === 'production',
    nonOperationalProductionOverride: environment === 'production'
      && mode !== 'OPERATIONAL'
      && acknowledgedNonOperationalProductionMode
  });
}

module.exports = { ALLOWED_DATA_PROVENANCE_MODES, resolveDataProvenancePolicy, asBoolean };
