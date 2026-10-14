BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS patients (
    patient_id SERIAL PRIMARY KEY,
    identification_number VARCHAR(20) NOT NULL UNIQUE,
    identification_type VARCHAR(10) NOT NULL CHECK (identification_type IN ('SA_ID', 'PASSPORT')),
    full_name VARCHAR(150) NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 150),
    date_of_birth DATE NOT NULL,
    contact_no VARCHAR(16) NOT NULL CHECK (contact_no ~ '^\\+[1-9][0-9]{7,14}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_staff (
    staff_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_.-]{3,50}$'),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_reset_password BOOLEAN NOT NULL DEFAULT TRUE,
    contact_no VARCHAR(16) NULL CHECK (contact_no IS NULL OR contact_no ~ '^\\+[1-9][0-9]{7,14}$'),
    employee_id VARCHAR(50) NULL,
    extra_permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ticket_counters (
    ticket_date DATE PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0)
);

CREATE TABLE IF NOT EXISTS queue_entries (
    queue_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE RESTRICT,
    department_id INTEGER NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    ticket_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ticket_number VARCHAR(12) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Waiting' CHECK (status IN ('Waiting', 'In-Consultation', 'Discharged')),
    priority_level SMALLINT NULL CHECK (priority_level BETWEEN 1 AND 4),
    symptoms TEXT NOT NULL CHECK (char_length(trim(symptoms)) BETWEEN 1 AND 500),
    doctor_notes TEXT NULL CHECK (doctor_notes IS NULL OR char_length(doctor_notes) <= 5000),
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triaged_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
    triaged_at TIMESTAMPTZ NULL,
    called_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
    called_at TIMESTAMPTZ NULL,
    discharged_by_staff_id INTEGER NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
    discharged_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ticket_per_day UNIQUE (ticket_date, ticket_number),
    CONSTRAINT chk_status_timestamps CHECK (
      (status = 'Waiting' AND called_at IS NULL AND discharged_at IS NULL)
      OR (status = 'In-Consultation' AND called_at IS NOT NULL AND discharged_at IS NULL)
      OR (status = 'Discharged' AND called_at IS NOT NULL AND discharged_at IS NOT NULL)
    ),
    CONSTRAINT chk_actor_timestamp_pairs CHECK (
      (triaged_by_staff_id IS NULL AND triaged_at IS NULL) OR (triaged_by_staff_id IS NOT NULL AND triaged_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS login_events (
    event_id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
    logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45) NULL
);

CREATE TABLE IF NOT EXISTS shifts (
    shift_id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES clinic_staff(staff_id) ON DELETE RESTRICT,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_shift_time CHECK (start_time < end_time),
    CONSTRAINT uq_staff_shift_exact UNIQUE (staff_id, shift_date, start_time, end_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_visit_per_patient
    ON queue_entries(patient_id)
    WHERE status <> 'Discharged';

CREATE INDEX IF NOT EXISTS idx_queue_active_order
    ON queue_entries(status, priority_level, queued_at);

CREATE INDEX IF NOT EXISTS idx_queue_patient_status
    ON queue_entries(patient_id, status);

CREATE INDEX IF NOT EXISTS idx_queue_discharged_at
    ON queue_entries(discharged_at DESC)
    WHERE status = 'Discharged';

CREATE INDEX IF NOT EXISTS idx_login_events_staff_time
    ON login_events(staff_id, logged_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_shift_staff_date
    ON shifts(staff_id, shift_date);

ALTER TABLE shifts
    DROP CONSTRAINT IF EXISTS shifts_no_overlap;

ALTER TABLE shifts
    ADD CONSTRAINT shifts_no_overlap
    EXCLUDE USING gist (
      staff_id WITH =,
      tsrange(
        (shift_date + start_time),
        (shift_date + end_time),
        '[)'
      ) WITH &&
    );

COMMIT;
