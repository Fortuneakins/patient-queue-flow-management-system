BEGIN;
INSERT INTO departments (department_id, department_name)
VALUES (1, 'Outpatient Department')
ON CONFLICT (department_id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('departments', 'department_id'), GREATEST((SELECT COALESCE(MAX(department_id), 1) FROM departments), 1), true);
COMMIT;
