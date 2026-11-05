BEGIN;

CREATE TABLE IF NOT EXISTS clinic_action_items (
  action_id BIGSERIAL PRIMARY KEY,
  source_rule_id VARCHAR(40) NOT NULL CHECK (char_length(trim(source_rule_id)) BETWEEN 3 AND 40),
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  title VARCHAR(180) NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 180),
  summary VARCHAR(600) NOT NULL CHECK (char_length(trim(summary)) BETWEEN 3 AND 600),
  recommended_action VARCHAR(800) NOT NULL CHECK (char_length(trim(recommended_action)) BETWEEN 3 AND 800),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED')),
  owner_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE SET NULL,
  created_by_staff_id INTEGER NOT NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
  updated_by_staff_id INTEGER NOT NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_action_items_status_updated
  ON clinic_action_items(status, updated_at DESC, action_id DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_action_items_owner_status
  ON clinic_action_items(owner_staff_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_action_items_active_rule
  ON clinic_action_items(source_rule_id)
  WHERE status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

COMMIT;
