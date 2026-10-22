BEGIN;

-- Keep the original workload estimate and the correction separately. The
-- final prediction remains the value scored by Forecast Truth; calibration
-- must learn from the unadjusted baseline to avoid cumulative drift.
ALTER TABLE public.flow_forecast_samples
  ADD COLUMN IF NOT EXISTS baseline_wait_minutes NUMERIC(8,2);

ALTER TABLE public.flow_forecast_samples
  ADD COLUMN IF NOT EXISTS calibration_offset_minutes NUMERIC(6,2) NOT NULL DEFAULT 0;

-- Existing samples predate adaptive calibration and therefore have no applied
-- correction. Backfill their known baseline from the recorded prediction.
UPDATE public.flow_forecast_samples
SET baseline_wait_minutes = predicted_wait_minutes
WHERE baseline_wait_minutes IS NULL;

ALTER TABLE public.flow_forecast_samples
  ALTER COLUMN baseline_wait_minutes SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_forecast_baseline_wait_minutes'
      AND conrelid = 'public.flow_forecast_samples'::regclass
  ) THEN
    ALTER TABLE public.flow_forecast_samples
      ADD CONSTRAINT chk_forecast_baseline_wait_minutes
      CHECK (baseline_wait_minutes >= 0 AND baseline_wait_minutes <= 720);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_forecast_calibration_offset_minutes'
      AND conrelid = 'public.flow_forecast_samples'::regclass
  ) THEN
    ALTER TABLE public.flow_forecast_samples
      ADD CONSTRAINT chk_forecast_calibration_offset_minutes
      CHECK (calibration_offset_minutes BETWEEN -30 AND 30);
  END IF;
END
$migration$;

COMMIT;
