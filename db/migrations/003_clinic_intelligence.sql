BEGIN;

-- Append-only operational history. These events deliberately exclude patient names,
-- identification numbers, contact details, symptoms and consultation notes.
CREATE TABLE IF NOT EXISTS operational_events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    queue_id INTEGER NULL,
    actor_staff_id INTEGER NULL,
    event_source VARCHAR(20) NOT NULL DEFAULT 'SYSTEM'
      CHECK (event_source IN ('SYSTEM', 'STAFF', 'OFFLINE_SYNC')),
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(details) = 'object'),
    client_event_id UUID NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operational_events_time ON operational_events(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_events_entity ON operational_events(entity_type, entity_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_events_type ON operational_events(event_type, event_at DESC);

CREATE OR REPLACE FUNCTION pqfms_reject_operational_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Operational events are append-only and cannot be changed or deleted.';
END;
$$;
DROP TRIGGER IF EXISTS trg_operational_events_immutable ON operational_events;
CREATE TRIGGER trg_operational_events_immutable
BEFORE UPDATE OR DELETE ON operational_events
FOR EACH ROW EXECUTE FUNCTION pqfms_reject_operational_event_mutation();

CREATE OR REPLACE FUNCTION pqfms_log_queue_operational_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
  v_actor INTEGER;
  v_details JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'visit_checked_in';
    v_actor := NULL;
    v_details := jsonb_build_object('status', NEW.status, 'priority_level', NEW.priority_level);
  ELSIF OLD.priority_level IS DISTINCT FROM NEW.priority_level THEN
    v_type := 'priority_assigned';
    v_actor := NEW.triaged_by_staff_id;
    v_details := jsonb_build_object('status', NEW.status, 'previous_priority', OLD.priority_level, 'priority_level', NEW.priority_level);
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_actor := CASE
      WHEN NEW.status = 'In-Consultation' THEN NEW.called_by_staff_id
      WHEN NEW.status = 'Discharged' THEN NEW.discharged_by_staff_id
      ELSE NULL
    END;
    v_type := CASE
      WHEN NEW.status = 'In-Consultation' THEN 'consultation_started'
      WHEN NEW.status = 'Discharged' THEN 'visit_discharged'
      ELSE 'visit_status_changed'
    END;
    v_details := jsonb_build_object('previous_status', OLD.status, 'status', NEW.status, 'priority_level', NEW.priority_level);
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO operational_events(event_type, entity_type, entity_id, queue_id, actor_staff_id, event_source, details)
  VALUES (v_type, 'queue_entry', NEW.queue_id::TEXT, NEW.queue_id, v_actor, 'SYSTEM', v_details);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_queue_operational_event ON queue_entries;
CREATE TRIGGER trg_queue_operational_event
AFTER INSERT OR UPDATE OF status, priority_level ON queue_entries
FOR EACH ROW EXECUTE FUNCTION pqfms_log_queue_operational_event();

CREATE TABLE IF NOT EXISTS clinic_resources (
    resource_id BIGSERIAL PRIMARY KEY,
    resource_name VARCHAR(100) NOT NULL UNIQUE,
    resource_type VARCHAR(20) NOT NULL
      CHECK (resource_type IN ('STATION', 'ROOM', 'EQUIPMENT', 'SUPPLY')),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
      CHECK (status IN ('AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'MAINTENANCE')),
    capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 500),
    service_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    notes VARCHAR(300) NULL,
    created_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    updated_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinic_resources_status_type ON clinic_resources(status, resource_type);

CREATE TABLE IF NOT EXISTS care_pathway_templates (
    template_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    description VARCHAR(500) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS care_pathway_stages (
    stage_id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES care_pathway_templates(template_id) ON DELETE CASCADE,
    stage_order SMALLINT NOT NULL CHECK (stage_order BETWEEN 1 AND 50),
    stage_code VARCHAR(40) NOT NULL,
    stage_name VARCHAR(120) NOT NULL,
    required_resource_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_id, stage_order),
    UNIQUE (template_id, stage_code)
);
CREATE TABLE IF NOT EXISTS care_pathway_instances (
    instance_id BIGSERIAL PRIMARY KEY,
    queue_id INTEGER NOT NULL REFERENCES queue_entries(queue_id) ON DELETE CASCADE,
    template_id BIGINT NOT NULL REFERENCES care_pathway_templates(template_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
      CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    opened_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    UNIQUE (queue_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_pathway_instances_status ON care_pathway_instances(status, created_at DESC);
CREATE TABLE IF NOT EXISTS care_pathway_instance_stages (
    instance_stage_id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT NOT NULL REFERENCES care_pathway_instances(instance_id) ON DELETE CASCADE,
    stage_id BIGINT NOT NULL REFERENCES care_pathway_stages(stage_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    updated_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instance_id, stage_id),
    CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_pathway_instance_stages_status ON care_pathway_instance_stages(instance_id, status);

CREATE TABLE IF NOT EXISTS flow_simulations (
    simulation_id BIGSERIAL PRIMARY KEY,
    simulation_type VARCHAR(30) NOT NULL CHECK (simulation_type IN ('FLOW_TWIN', 'SYNTHETIC_LAB', 'CRISIS')),
    title VARCHAR(140) NOT NULL,
    inputs JSONB NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
    baseline_result JSONB NOT NULL CHECK (jsonb_typeof(baseline_result) = 'object'),
    proposed_result JSONB NOT NULL CHECK (jsonb_typeof(proposed_result) = 'object'),
    assumptions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assumptions) = 'object'),
    created_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flow_simulations_created ON flow_simulations(created_at DESC);

CREATE TABLE IF NOT EXISTS wait_forecast_ledger (
    forecast_id BIGSERIAL PRIMARY KEY,
    forecast_scope VARCHAR(60) NOT NULL,
    horizon_minutes SMALLINT NOT NULL CHECK (horizon_minutes BETWEEN 1 AND 1440),
    predicted_p50_minutes NUMERIC(8,2) NOT NULL CHECK (predicted_p50_minutes >= 0),
    predicted_p90_minutes NUMERIC(8,2) NOT NULL CHECK (predicted_p90_minutes >= predicted_p50_minutes),
    actual_wait_minutes NUMERIC(8,2) NULL CHECK (actual_wait_minutes IS NULL OR actual_wait_minutes >= 0),
    sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
    model_version VARCHAR(40) NOT NULL,
    assumptions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assumptions) = 'object'),
    created_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actual_recorded_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    actual_recorded_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_wait_forecast_ledger_created ON wait_forecast_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS patient_contact_preferences (
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    channel VARCHAR(12) NOT NULL CHECK (channel IN ('SMS', 'VOICE')),
    opted_in BOOLEAN NOT NULL DEFAULT FALSE,
    consent_source VARCHAR(20) NOT NULL CHECK (consent_source IN ('RECEPTION', 'KIOSK', 'PAPER_FORM', 'PATIENT_REQUEST')),
    consent_text_version VARCHAR(40) NOT NULL DEFAULT 'queue-updates-v1',
    updated_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    consented_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (patient_id, channel),
    CHECK ((opted_in = TRUE) = (consented_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS patient_notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    channel VARCHAR(12) NOT NULL CHECK (channel IN ('SMS')),
    notification_type VARCHAR(24) NOT NULL CHECK (notification_type IN ('WAIT_ESTIMATE')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('SENT', 'FAILED', 'SKIPPED')),
    provider_reference VARCHAR(120) NULL,
    safe_result VARCHAR(80) NOT NULL DEFAULT '',
    created_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_notifications_patient_time ON patient_notifications(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS operational_referrals (
    referral_id BIGSERIAL PRIMARY KEY,
    reference_code VARCHAR(20) NOT NULL UNIQUE,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE RESTRICT,
    source_queue_id INTEGER NULL REFERENCES queue_entries(queue_id) ON DELETE SET NULL,
    target_facility VARCHAR(140) NOT NULL,
    target_service VARCHAR(120) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
      CHECK (status IN ('OPEN', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED')),
    created_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    updated_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ NULL,
    acknowledged_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_operational_referrals_status ON operational_referrals(status, created_at DESC);

-- Offline continuity stores only non-clinical operational observations. It deliberately
-- does not accept offline patient check-ins, triage changes or clinical notes.
CREATE TABLE IF NOT EXISTS continuity_sync_receipts (
    client_event_id UUID PRIMARY KEY,
    event_type VARCHAR(40) NOT NULL
      CHECK (event_type IN ('OPERATIONAL_INCIDENT_RECORDED', 'RESOURCE_STATUS_OBSERVED')),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    received_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clinic_resources(resource_name, resource_type, status, capacity, service_tags, is_critical)
VALUES
  ('Consultation station 1', 'STATION', 'AVAILABLE', 1, ARRAY['consultation']::TEXT[], TRUE),
  ('Triage station 1', 'STATION', 'AVAILABLE', 1, ARRAY['triage']::TEXT[], TRUE),
  ('Reception station 1', 'STATION', 'AVAILABLE', 1, ARRAY['registration']::TEXT[], FALSE)
ON CONFLICT (resource_name) DO NOTHING;

INSERT INTO care_pathway_templates(name, description, is_active)
VALUES ('Standard outpatient journey', 'Operational stage tracking for a standard outpatient visit. This template does not determine clinical triage or treatment.', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO care_pathway_stages(template_id, stage_order, stage_code, stage_name, required_resource_tags, is_required)
SELECT t.template_id, stages.stage_order, stages.stage_code, stages.stage_name, stages.required_resource_tags, TRUE
FROM care_pathway_templates t
CROSS JOIN (VALUES
  (1::SMALLINT, 'TRIAGE', 'Clinical triage', ARRAY['triage']::TEXT[]),
  (2::SMALLINT, 'CONSULTATION', 'Consultation', ARRAY['consultation']::TEXT[]),
  (3::SMALLINT, 'DISCHARGE', 'Discharge and next steps', ARRAY['registration']::TEXT[])
) AS stages(stage_order, stage_code, stage_name, required_resource_tags)
WHERE t.name = 'Standard outpatient journey'
ON CONFLICT (template_id, stage_code) DO NOTHING;

COMMIT;