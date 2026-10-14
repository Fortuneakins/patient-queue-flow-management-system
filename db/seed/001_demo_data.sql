BEGIN;

-- Demo passwords are deliberately synthetic. Replace them before any real-world deployment.
INSERT INTO clinic_staff (username, password_hash, role, is_active, must_reset_password, contact_no, employee_id, extra_permissions)
VALUES
  ('admin_demo', '$2b$12$CVfgOU11e747SwYsSr6qSuwXWdSGcNtDpmZBXamJfOLyYMhscm0fC', 'ADMIN', true, false, '+27820000001', 'DEMO-ADMIN', ARRAY[]::TEXT[]),
  ('reception_demo', '$2b$12$CVfgOU11e747SwYsSr6qSuwXWdSGcNtDpmZBXamJfOLyYMhscm0fC', 'RECEPTION', true, false, '+27820000002', 'DEMO-REC', ARRAY[]::TEXT[]),
  ('nurse_demo', '$2b$12$CVfgOU11e747SwYsSr6qSuwXWdSGcNtDpmZBXamJfOLyYMhscm0fC', 'NURSE', true, false, '+27820000003', 'DEMO-NURSE', ARRAY[]::TEXT[]),
  ('doctor_demo', '$2b$12$CVfgOU11e747SwYsSr6qSuwXWdSGcNtDpmZBXamJfOLyYMhscm0fC', 'DOCTOR', true, false, '+27820000004', 'DEMO-DOCTOR', ARRAY[]::TEXT[])
ON CONFLICT (username) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  must_reset_password = EXCLUDED.must_reset_password,
  contact_no = EXCLUDED.contact_no,
  employee_id = EXCLUDED.employee_id,
  extra_permissions = EXCLUDED.extra_permissions;

-- Password for the demo accounts above is: DemoPass2026!
-- The hash is included here only as seed data; do not reuse this password elsewhere.

INSERT INTO patients (identification_number, identification_type, full_name, date_of_birth, contact_no)
VALUES
  ('9001015009087', 'SA_ID', 'Anele Mokoena', '1990-01-01', '+27821234567'),
  ('9205055800086', 'SA_ID', 'Lerato Ndlovu', '1992-05-05', '+27822345678'),
  ('9502125100087', 'SA_ID', 'Thabo Dlamini', '1995-02-12', '+27823456789'),
  ('9709096200081', 'SA_ID', 'Naledi Molefe', '1997-09-09', '+27824567890')
ON CONFLICT (identification_number) DO NOTHING;

INSERT INTO shifts (staff_id, shift_date, start_time, end_time)
SELECT staff_id, CURRENT_DATE, '07:00', '15:00'
FROM clinic_staff
WHERE role = 'DOCTOR' AND username = 'doctor_demo'
ON CONFLICT DO NOTHING;

COMMIT;
