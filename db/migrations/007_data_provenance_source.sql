BEGIN;

-- Existing records must remain clearly distinguishable from automatically
-- classified new check-ins. Never infer the origin of historical data.
ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS data_provenance_source VARCHAR(30) NOT NULL
  DEFAULT 'LEGACY_REVIEW_REQUIRED';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_queue_data_provenance_source'
      AND conrelid = 'queue_entries'::regclass
  ) THEN
    ALTER TABLE queue_entries
      ADD CONSTRAINT chk_queue_data_provenance_source
      CHECK (data_provenance_source IN (
        'LEGACY_REVIEW_REQUIRED',
        'SERVER_POLICY',
        'ADMIN_REVIEW'
      ));
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_queue_provenance_source
  ON queue_entries(data_provenance_source, data_provenance);

COMMIT;
