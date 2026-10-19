const { query, withTransaction } = require('../db/pool');
const { appendOperationalEvent } = require('./operationalEventService');
const { ENGINE_VERSION, normalizeScenario, reconstructScenario } = require('../utils/continuityEngine');

async function runSyntheticRecovery(input, actorStaffId) {
  const normalized = normalizeScenario(input);
  const output = reconstructScenario(normalized);
  const name = 'Synthetic RMSH downtime recovery';
  const stored = await withTransaction(async client => {
    const result = await client.query(
      'INSERT INTO continuity_runs (scenario_code,engine_version,seed,outage_minutes,source_scope,input,output,created_by_staff_id) ' +
      'VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING continuity_run_id,created_at',
      [normalized.scenario_code, ENGINE_VERSION, normalized.seed, normalized.outage_minutes,
        'SYNTHETIC_ONLY', JSON.stringify(normalized), JSON.stringify(output), actorStaffId]
    );
    const row = result.rows[0];
    await appendOperationalEvent(client, {
      eventType: 'CONTINUITY_SCENARIO_RUN',
      entityType: 'CONTINUITY_RUN',
      entityId: row.continuity_run_id,
      actorStaffId,
      toState: 'COMPLETED',
      metadata: {
        scenario_code: normalized.scenario_code,
        engine_version: ENGINE_VERSION,
        source_scope: 'SYNTHETIC_ONLY',
        seed: normalized.seed,
        discrepancy_count: output.summary.discrepancy_count,
        reconstructed_visit_count: output.summary.reconstructed_visit_count
      }
    });
    return row;
  });
  return { ...stored, name, input: normalized, ...output };
}

async function listRecoveryRuns(limit = 10) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const result = await query(
    'SELECT continuity_run_id,scenario_code,engine_version,seed,outage_minutes,source_scope,input,output,created_at ' +
    'FROM continuity_runs ORDER BY created_at DESC, continuity_run_id DESC LIMIT $1',
    [safeLimit]
  );
  return result.rows;
}

module.exports = { runSyntheticRecovery, listRecoveryRuns };
