BEGIN;
CREATE TABLE IF NOT EXISTS patient_communications (
  communication_id BIGSERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE RESTRICT,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('SMS','VOICE')),
  template_code VARCHAR(30) NOT NULL CHECK (template_code IN ('WAIT_ESTIMATE','SERVICE_DELAY')),
  delivery_status VARCHAR(12) NOT NULL CHECK (delivery_status IN ('SENT','SKIPPED','FAILED')),
  provider_message_id VARCHAR(120) NULL,
  status_message VARCHAR(160) NOT NULL DEFAULT '',
  created_by_staff_id INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_communications_patient ON patient_communications(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_communications_status ON patient_communications(delivery_status, created_at DESC);
COMMIT;
