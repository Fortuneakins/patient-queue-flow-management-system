BEGIN;

-- Migration 007 adds the source field to rows that already existed. Earlier
-- versions already recorded manual reviews in these two nullable columns, so
-- reconcile only rows with explicit review evidence. Do not infer provenance
-- from ticket numbers, dates, names, status, or clinical text.
UPDATE queue_entries
SET data_provenance_source = 'ADMIN_REVIEW'
WHERE data_provenance_source = 'LEGACY_REVIEW_REQUIRED'
  AND provenance_updated_by_staff_id IS NOT NULL
  AND provenance_updated_at IS NOT NULL;

-- Rows without prior review metadata deliberately remain LEGACY_REVIEW_REQUIRED.
-- The migration changes source metadata only, not classification, status,
-- priority, clinical notes, timestamps, or the existing event history.

COMMIT;
