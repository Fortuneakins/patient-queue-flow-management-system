BEGIN;

CREATE TABLE IF NOT EXISTS continuity_runs (
  continuity_run_id BIGSERIAL PRIMARY KEY,
  scenario_code VARCHAR(50) NOT NULL CHECK (scenario_code = 'RMSH_DOWNTIME_RECOVERY'),
  engine_version VARCHAR(50) NOT NULL,
  seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 2147483647),
  outage_minutes SMALLINT NOT NULL CHECK (outage_minutes BETWEEN 15 AND 240),
  source_scope VARCHAR(20) NOT NULL DEFAULT 'SYNTHETIC_ONLY' CHECK (source_scope = 'SYNTHETIC_ONLY'),
  input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  output JSONB NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  created_by_staff_id INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_continuity_runs_created
  ON continuity_runs(created_at DESC, continuity_run_id DESC);

COMMIT;
