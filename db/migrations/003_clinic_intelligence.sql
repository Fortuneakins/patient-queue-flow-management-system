BEGIN;

CREATE TABLE IF NOT EXISTS operational_events (
  event_id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL CHECK (char_length(trim(event_type)) BETWEEN 3 AND 60),
  entity_type VARCHAR(40) NOT NULL CHECK (char_length(trim(entity_type)) BETWEEN 2 AND 40),
  entity_id VARCHAR(100) NULL,
  actor_staff_id INTEGER NULL,
  from_state VARCHAR(40) NULL,
  to_state VARCHAR(40) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  correlation_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operational_events_created ON operational_events(created_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS idx_operational_events_entity ON operational_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_events_type ON operational_events(event_type, created_at DESC);

CREATE OR REPLACE FUNCTION reject_operational_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Operational events are append-only';
END;
$function$;
DROP TRIGGER IF EXISTS trg_operational_events_immutable ON operational_events;
CREATE TRIGGER trg_operational_events_immutable BEFORE UPDATE OR DELETE ON operational_events FOR EACH ROW EXECUTE FUNCTION reject_operational_event_mutation();

CREATE TABLE IF NOT EXISTS care_pathways (
  pathway_id SERIAL PRIMARY KEY,
  pathway_code VARCHAR(40) NOT NULL UNIQUE CHECK (pathway_code ~ '^[A-Z][A-Z0-9_]{2,39}$'),
  name VARCHAR(120) NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 120),
  description VARCHAR(800) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_staff_id INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS care_pathway_stages (
  stage_id SERIAL PRIMARY KEY,
  pathway_id INTEGER NOT NULL REFERENCES care_pathways(pathway_id) ON DELETE CASCADE,
  stage_code VARCHAR(40) NOT NULL CHECK (stage_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name VARCHAR(120) NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  sequence_no SMALLINT NOT NULL CHECK (sequence_no BETWEEN 1 AND 30),
  required_role VARCHAR(20) NULL CHECK (required_role IS NULL OR required_role IN ('RECEPTION','NURSE','DOCTOR','ADMIN')),
  resource_type VARCHAR(20) NULL CHECK (resource_type IS NULL OR resource_type IN ('ROOM','EQUIPMENT','SERVICE','SUPPLY')),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pathway_id, stage_code), UNIQUE(pathway_id, sequence_no)
);
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS care_pathway_id INTEGER NULL REFERENCES care_pathways(pathway_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_queue_pathway ON queue_entries(care_pathway_id) WHERE care_pathway_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS queue_pathway_progress (
  progress_id BIGSERIAL PRIMARY KEY,
  queue_id INTEGER NOT NULL REFERENCES queue_entries(queue_id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL REFERENCES care_pathway_stages(stage_id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','IN_PROGRESS','COMPLETED','BLOCKED')),
  block_reason VARCHAR(300) NULL, started_at TIMESTAMPTZ NULL, completed_at TIMESTAMPTZ NULL,
  updated_by_staff_id INTEGER NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(queue_id, stage_id), CHECK ((status = 'COMPLETED' AND completed_at IS NOT NULL) OR status <> 'COMPLETED')
);
CREATE INDEX IF NOT EXISTS idx_pathway_progress_queue ON queue_pathway_progress(queue_id, progress_id);

CREATE TABLE IF NOT EXISTS clinic_resources (
  resource_id SERIAL PRIMARY KEY,
  resource_code VARCHAR(40) NOT NULL UNIQUE CHECK (resource_code ~ '^[A-Za-z0-9_-]{2,40}$'),
  name VARCHAR(120) NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('ROOM','EQUIPMENT','SERVICE','SUPPLY')),
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','LIMITED','UNAVAILABLE')),
  capacity SMALLINT NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  location_label VARCHAR(120) NULL, notes VARCHAR(500) NOT NULL DEFAULT '',
  updated_by_staff_id INTEGER NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinic_resources_type_status ON clinic_resources(resource_type, status);

CREATE TABLE IF NOT EXISTS flow_simulations (
  simulation_id BIGSERIAL PRIMARY KEY, simulation_kind VARCHAR(24) NOT NULL CHECK (simulation_kind IN ('SCENARIO','SYNTHETIC_BATCH')),
  name VARCHAR(120) NOT NULL, model_version VARCHAR(40) NOT NULL, seed INTEGER NOT NULL,
  input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'), output JSONB NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  created_by_staff_id INTEGER NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flow_simulations_recent ON flow_simulations(created_at DESC);
CREATE TABLE IF NOT EXISTS flow_forecasts (
  forecast_id BIGSERIAL PRIMARY KEY, model_version VARCHAR(40) NOT NULL, horizon_minutes SMALLINT NOT NULL CHECK (horizon_minutes BETWEEN 1 AND 1440),
  tier_estimates JSONB NOT NULL CHECK (jsonb_typeof(tier_estimates) = 'object'), waiting_snapshot INTEGER NOT NULL CHECK (waiting_snapshot >= 0),
  created_by_staff_id INTEGER NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS flow_forecast_samples (
  sample_id BIGSERIAL PRIMARY KEY, forecast_id BIGINT NOT NULL REFERENCES flow_forecasts(forecast_id) ON DELETE CASCADE,
  queue_id INTEGER NULL REFERENCES queue_entries(queue_id) ON DELETE SET NULL, tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 4),
  predicted_wait_minutes NUMERIC(8,2) NOT NULL CHECK (predicted_wait_minutes >= 0), actual_wait_minutes NUMERIC(8,2) NULL CHECK (actual_wait_minutes IS NULL OR actual_wait_minutes >= 0),
  observed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(forecast_id, queue_id)
);
CREATE INDEX IF NOT EXISTS idx_forecast_samples_queue ON flow_forecast_samples(queue_id) WHERE queue_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS care_referrals (
  referral_id BIGSERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE RESTRICT,
  queue_id INTEGER NULL REFERENCES queue_entries(queue_id) ON DELETE SET NULL, referred_to VARCHAR(160) NOT NULL CHECK (char_length(trim(referred_to)) BETWEEN 2 AND 160),
  reason VARCHAR(1000) NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ACKNOWLEDGED','IN_PROGRESS','COMPLETED','CANCELLED')),
  due_at TIMESTAMPTZ NULL, acknowledgement_note VARCHAR(500) NOT NULL DEFAULT '', created_by_staff_id INTEGER NULL, updated_by_staff_id INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_care_referrals_status_due ON care_referrals(status, due_at NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_referrals_patient ON care_referrals(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_contact_preferences (
  patient_id INTEGER PRIMARY KEY REFERENCES patients(patient_id) ON DELETE CASCADE,
  preferred_language_code VARCHAR(5) NOT NULL DEFAULT 'en' CHECK (preferred_language_code IN ('en','af','zu','xh','st','tn','nso','ts','ss','ve','nr')),
  preferred_channel VARCHAR(10) NOT NULL DEFAULT 'NONE' CHECK (preferred_channel IN ('NONE','SMS','VOICE')),
  contact_consent BOOLEAN NOT NULL DEFAULT FALSE,
  consent_method VARCHAR(30) NOT NULL DEFAULT 'STAFF_RECORDED' CHECK (consent_method IN ('STAFF_RECORDED','KIOSK','SMS','VOICE','REVOKED')),
  consent_version VARCHAR(30) NOT NULL DEFAULT 'v1', updated_by_staff_id INTEGER NULL, consent_recorded_at TIMESTAMPTZ NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT contact_consent OR preferred_channel IN ('SMS','VOICE'))
);

CREATE TABLE IF NOT EXISTS offline_sync_receipts (
  idempotency_key UUID PRIMARY KEY, operation_type VARCHAR(30) NOT NULL CHECK (operation_type = 'RESOURCE_STATUS'),
  resource_id INTEGER NOT NULL REFERENCES clinic_resources(resource_id) ON DELETE RESTRICT, actor_staff_id INTEGER NOT NULL,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'), response_payload JSONB NOT NULL CHECK (jsonb_typeof(response_payload) = 'object'),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO care_pathways (pathway_code, name, description)
VALUES ('OPD_STANDARD', 'Standard outpatient journey', 'Configurable operational stages for a standard outpatient visit. This pathway does not replace clinical judgement.')
ON CONFLICT (pathway_code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = NOW();
WITH pathway AS (SELECT pathway_id FROM care_pathways WHERE pathway_code = 'OPD_STANDARD')
INSERT INTO care_pathway_stages (pathway_id, stage_code, name, sequence_no, required_role, resource_type, is_required)
SELECT pathway.pathway_id, stage.stage_code, stage.name, stage.sequence_no, stage.required_role, stage.resource_type, TRUE FROM pathway
CROSS JOIN (VALUES
  ('REGISTRATION', 'Registration and identity check', 1, 'RECEPTION', NULL::varchar),
  ('TRIAGE', 'Nurse triage', 2, 'NURSE', 'SERVICE'),
  ('CONSULTATION', 'Clinical consultation', 3, 'DOCTOR', 'ROOM'),
  ('DISCHARGE', 'Discharge and next-step instructions', 4, 'DOCTOR', NULL::varchar)
) AS stage(stage_code, name, sequence_no, required_role, resource_type)
ON CONFLICT (pathway_id, stage_code) DO UPDATE SET name = EXCLUDED.name, sequence_no = EXCLUDED.sequence_no, required_role = EXCLUDED.required_role, resource_type = EXCLUDED.resource_type;

COMMIT;
