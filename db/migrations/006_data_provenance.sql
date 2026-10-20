BEGIN;

-- Legacy queue records are deliberately unclassified. Do not guess whether old
-- rows are real operational visits, demo data or acceptance-test records.
ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS data_provenance VARCHAR(20) NOT NULL DEFAULT 'UNCLASSIFIED';

ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS data_provenance_note VARCHAR(300) NOT NULL DEFAULT '';

ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS provenance_updated_by_staff_id INTEGER NULL
  REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT;

ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS provenance_updated_at TIMESTAMPTZ NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_queue_data_provenance'
      AND conrelid = 'queue_entries'::regclass
  ) THEN
    ALTER TABLE queue_entries
      ADD CONSTRAINT chk_queue_data_provenance
      CHECK (data_provenance IN ('UNCLASSIFIED','OPERATIONAL','SYNTHETIC_TEST','DEMO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_queue_data_provenance_note'
      AND conrelid = 'queue_entries'::regclass
  ) THEN
    ALTER TABLE queue_entries
      ADD CONSTRAINT chk_queue_data_provenance_note
      CHECK (char_length(data_provenance_note) <= 300);
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_queue_provenance_status_time
  ON queue_entries(data_provenance, status, queued_at DESC);

COMMIT;
